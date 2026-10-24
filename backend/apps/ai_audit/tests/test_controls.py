import hashlib
import io

from apps.ai_audit import models as m
from apps.ai_audit.services import controls
from apps.ai_audit.tests.base import AuditTestCase


class ControlChecklistTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.reviewer = self.client_for("reviewer_a")
        body = {"name": "Scorer", "purpose": "Score applicants", "jurisdictions": ["DPDP", "GDPR"], "automated_decision": False}
        self.system = self.owner.post("/api/v1/ai/systems/", body, format="json").json()

    def assessments(self, client=None):
        client = client or self.owner
        return client.get(f"/api/v1/ai/control-assessments/?system={self.system['id']}").json()["results"]

    def by_control(self, control_id):
        return next(a for a in self.assessments() if a["control_id"] == control_id)

    def test_packs_load_and_cite_sources(self):
        for pack_id in controls.JURISDICTION_PACKS.values():
            pack = controls.load_pack(pack_id)
            self.assertTrue(pack["sources"])
            self.assertIn("not legal advice", pack["legal_review_status"].lower())
            ids = [c["id"] for c in pack["controls"]]
            self.assertEqual(len(ids), len(set(ids)))
            for c in pack["controls"]:
                self.assertTrue(c["source"] and c["question"] and c["required_evidence"], c["id"])

    def test_creating_a_system_creates_assessments_with_conditional_applicability(self):
        rows = self.assessments()
        self.assertEqual(len(rows), sum(len(controls.load_pack(p)["controls"]) for p in controls.JURISDICTION_PACKS.values()))
        # Not marked as an automated decision, children's data or SDF: those controls start as not applicable, with a reason.
        for cid in ("GDPR-04", "DPDP-10", "DPDP-11", "DPDP-04"):
            row = self.by_control(cid)
            self.assertFalse(row["applicable"], cid)
            self.assertEqual(row["state"], "not_applicable")
            self.assertTrue(row["applicability_rationale"])
        self.assertTrue(self.by_control("DPDP-06")["applicable"])
        self.assertEqual(self.by_control("DPDP-06")["state"], "needs_evidence")

    def test_marking_automated_decision_makes_controls_applicable_after_ensure(self):
        self.assertFalse(self.by_control("GDPR-04")["applicable"])
        r = self.owner.patch(f"/api/v1/ai/systems/{self.system['id']}/", {"automated_decision": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        row = self.by_control("GDPR-04")
        self.assertTrue(row["applicable"])
        self.assertEqual(row["state"], "needs_evidence")

        # A person's own "not applicable" decision is not overridden by a later flag change.
        a = self.by_control("DPDP-06")
        self.owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/",
                         {"applicable": False, "applicability_rationale": "Handled by parent company"}, format="json")
        self.owner.patch(f"/api/v1/ai/systems/{self.system['id']}/", {"purpose": "Updated"}, format="json")
        self.assertFalse(self.by_control("DPDP-06")["applicable"])

    def test_not_applicable_requires_a_rationale(self):
        a = self.by_control("DPDP-06")
        bad = self.owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/", {"applicable": False}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/",
                              {"applicable": False, "applicability_rationale": "No personal data stored"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()["state"], "not_applicable")

    def upload(self, client, assessment_id, content=b"policy text", title="Breach procedure"):
        f = io.BytesIO(content)
        f.name = "procedure.pdf"
        return client.post(f"/api/v1/ai/control-assessments/{assessment_id}/evidence/", {"title": title, "file": f}, format="multipart")

    def test_evidence_review_flow_with_separation_of_duties(self):
        a = self.by_control("DPDP-06")
        content = b"Incident response procedure v3"
        up = self.upload(self.owner, a["id"], content)
        self.assertEqual(up.status_code, 201, up.content)
        # The server computes the digest; the client cannot supply one.
        self.assertEqual(up.json()["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(self.by_control("DPDP-06")["state"], "evidence_supplied")

        # Whoever supplied the evidence cannot review it; an independent reviewer must comment.
        self.assertEqual(self.owner.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed", "comment": "ok"}, format="json").status_code, 403)
        self.assertEqual(self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed"}, format="json").status_code, 400)
        done = self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed", "comment": "Procedure is adequate"}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["state"], "reviewed")

        # New evidence after review resets the decision: stale sign-off is not kept.
        self.upload(self.owner, a["id"], b"updated", "Updated procedure")
        self.assertEqual(self.by_control("DPDP-06")["state"], "evidence_supplied")

        # Evidence downloads need authentication and the right tenant.
        evidence_id = self.by_control("DPDP-06")["evidence_files"][0]["id"]
        response = self.owner.get(f"/api/v1/ai/control-evidence/{evidence_id}/download/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.client_for("owner_b").get(f"/api/v1/ai/control-evidence/{evidence_id}/download/").status_code, 404)

    def test_cannot_mark_reviewed_without_evidence(self):
        a = self.by_control("DPDP-06")
        r = self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed", "comment": "trust me"}, format="json")
        self.assertEqual(r.status_code, 400)
        gap = self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "gap_identified", "comment": "No procedure exists"}, format="json")
        self.assertEqual(gap.status_code, 200)
        self.assertEqual(gap.json()["state"], "gap_identified")

    def test_summary_lists_gaps_and_never_claims_compliance(self):
        summary = controls.summarise(m.AISystem.all_objects.get(id=self.system["id"]))
        self.assertGreater(summary["needs_attention"], 0)
        self.assertNotIn("compliant", str(summary).lower())
