from datetime import date, timedelta

from django.core.management import call_command

from apps.ai_audit import models as m
from apps.ai_audit.services import controls
from apps.ai_audit.tests.base import AuditTestCase


class RegisterTestBase(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.reviewer = self.client_for("reviewer_a")
        self.reader = self.client_for("reader_a")
        body = {"name": "Scorer", "purpose": "Score applicants", "jurisdictions": ["DPDP", "GDPR"], "automated_decision": True}
        self.system = self.owner.post("/api/v1/ai/systems/", body, format="json").json()

    def control(self, control_id, client=None):
        rows = (client or self.owner).get(f"/api/v1/ai/control-assessments/?system={self.system['id']}").json()["results"]
        return next(a for a in rows if a["control_id"] == control_id)


class ControlAssessmentDetailTests(RegisterTestBase):
    def test_owner_can_be_assigned_and_is_logged_without_voiding_review(self):
        a = self.control("DPDP-06")
        who = self.members["owner_a"]
        r = self.owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/", {"owner": str(who.id)}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        row = self.control("DPDP-06")
        self.assertEqual(row["owner_name"], "owner_a")
        self.assertEqual(row["history"][0]["kind"], "owner_changed")

    def test_cannot_assign_owner_from_another_tenant(self):
        a = self.control("DPDP-06")
        r = self.owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/", {"owner": str(self.members["owner_b"].id)}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_link_evidence_and_history(self):
        a = self.control("DPDP-06")
        bad = self.owner.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "x", "url": "javascript:alert(1)"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.owner.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "IR plan", "url": "https://example.com/ir"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        row = self.control("DPDP-06")
        self.assertEqual(row["state"], "evidence_supplied")
        self.assertEqual(row["basis"], "manual")
        self.assertEqual(row["links"][0]["url"], "https://example.com/ir")
        self.assertEqual(row["history"][0]["kind"], "link_added")
        self.assertTrue(row["last_assessed"])

    def test_reader_cannot_add_link_and_other_tenant_cannot_see_assessment(self):
        a = self.control("DPDP-06")
        r = self.reader.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "t", "url": "https://example.com"}, format="json")
        self.assertEqual(r.status_code, 403)
        other = self.client_for("owner_b")
        self.assertEqual(other.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "t", "url": "https://example.com"}, format="json").status_code, 404)

    def test_review_is_logged_and_gap_is_listed(self):
        a = self.control("DPDP-06")
        self.owner.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "IR plan", "url": "https://example.com/ir"}, format="json")
        r = self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "gap_identified", "comment": "Plan has no owner"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        row = self.control("DPDP-06")
        self.assertEqual(row["history"][0]["kind"], "gap_identified")
        self.assertTrue(any("Plan has no owner" in g for g in row["gaps"]))

    def test_manual_only_when_no_audit(self):
        row = self.control("DPDP-08")
        self.assertIsNone(row["automated"])
        self.assertEqual(row["basis"], "none")
        self.assertTrue(row["gaps"])

    def test_coverage_is_computed_from_states(self):
        summary = controls.summarise(m.AISystem.all_objects.get(id=self.system["id"]))
        self.assertEqual(summary["reviewed"], 0)
        self.assertEqual(summary["reviewed_pct"], 0)
        a = self.control("DPDP-06")
        self.owner.post(f"/api/v1/ai/control-assessments/{a['id']}/links/", {"title": "IR plan", "url": "https://example.com/ir"}, format="json")
        r = self.reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed", "comment": "Adequate"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        # The reviewer is a different person from the uploader, so the review stands.
        summary = controls.summarise(m.AISystem.all_objects.get(id=self.system["id"]))
        self.assertEqual(summary["reviewed"], 1)
        self.assertEqual(summary["reviewed_pct"], round(100 / summary["applicable"]))


class AutomatedEvidenceTests(RegisterTestBase):
    def test_automated_evidence_comes_only_from_a_completed_run(self):
        system = m.AISystem.all_objects.get(id=self.system["id"])
        self.assertEqual(controls.automated_evidence_for_system(system), {})
        run = m.AuditRun.all_objects.create(
            tenant_id=system.tenant_id, system=system, status="completed", finished_at=__import__("django").utils.timezone.now(),
            model_version=m.ModelVersion.all_objects.create(tenant_id=system.tenant_id, system=system, version_label="v1", source="predictions_only"),
            reference_dataset=m.Dataset.all_objects.create(tenant_id=system.tenant_id, system=system, role="reference", name="r", sha256="0" * 64, row_count=1),
        )
        m.CheckResult.all_objects.create(
            tenant_id=system.tenant_id, run=run, category="governance", check_key="vendor_dependency", metric="vendor_gaps",
            state="review_required", summary="Vendor X has no contract.", subject="Vendor X")
        auto = controls.automated_evidence_for_system(system)
        self.assertEqual(auto["DPDP-08"]["signal"], "review_required")
        self.assertNotIn("DPDP-01", auto)
        row = self.control("DPDP-08")
        self.assertEqual(row["basis"], "automated")
        self.assertTrue(any("Vendor X has no contract" in g for g in row["gaps"]))


class VendorRegisterTests(RegisterTestBase):
    def payload(self, **kw):
        base = {"system": self.system["id"], "name": "Acme AI", "role": "model_provider", "relationship": "processor",
                "personal_data_shared": True, "contract_in_place": False, "outside_india": True, "criticality": "high"}
        base.update(kw)
        return base

    def test_create_derives_risk_and_gaps(self):
        r = self.owner.post("/api/v1/ai/dependencies/", self.payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["risk"], "high")
        self.assertTrue(any("without a contract" in g for g in body["gaps"]))
        self.assertFalse(body["is_demo"])

    def test_relationship_filter_and_update(self):
        self.owner.post("/api/v1/ai/dependencies/", self.payload(relationship="sub_processor", name="Sub"), format="json")
        self.owner.post("/api/v1/ai/dependencies/", self.payload(name="Main"), format="json")
        rows = self.owner.get("/api/v1/ai/dependencies/?relationship=sub_processor").json()["results"]
        self.assertEqual([x["name"] for x in rows], ["Sub"])
        r = self.owner.patch(f"/api/v1/ai/dependencies/{rows[0]['id']}/", {"contract_in_place": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["contract_in_place"])

    def test_vendor_isolated_by_tenant_and_read_only_role(self):
        self.assertEqual(self.reader.post("/api/v1/ai/dependencies/", self.payload(), format="json").status_code, 403)
        other = self.client_for("owner_b")
        self.assertEqual(other.post("/api/v1/ai/dependencies/", self.payload(), format="json").status_code, 400)


class SubjectRequestTests(RegisterTestBase):
    def payload(self, **kw):
        base = {"system": self.system["id"], "reference": "TKT-1", "kind": "erasure", "received_on": str(date.today() - timedelta(days=10))}
        base.update(kw)
        return base

    def test_due_date_defaults_from_sla_and_overdue_flag(self):
        r = self.owner.post("/api/v1/ai/subject-requests/", self.payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["due_on"], str(date.today() - timedelta(days=10) + timedelta(days=30)))
        self.assertFalse(body["overdue"])
        late = self.owner.post("/api/v1/ai/subject-requests/", self.payload(reference="TKT-2", received_on=str(date.today() - timedelta(days=40))), format="json").json()
        self.assertTrue(late["overdue"])
        self.assertLess(late["days_left"], 0)

    def test_declared_sla_wins_and_dpdp_grievance_default(self):
        m.RightsProcess.all_objects.create(tenant_id=self.members["owner_a"].tenant_id, system_id=self.system["id"], right="access", sla_days=7)
        r = self.owner.post("/api/v1/ai/subject-requests/", self.payload(reference="A", kind="access"), format="json").json()
        self.assertEqual(r["due_on"], str(date.today() - timedelta(days=10) + timedelta(days=7)))
        dpdp = self.owner.post("/api/v1/ai/systems/", {"name": "D", "purpose": "p", "jurisdictions": ["DPDP"]}, format="json").json()
        g = self.owner.post("/api/v1/ai/subject-requests/", self.payload(system=dpdp["id"], reference="G", kind="grievance"), format="json").json()
        self.assertEqual(g["due_on"], str(date.today() - timedelta(days=10) + timedelta(days=90)))

    def test_status_update_sets_and_clears_closed_date_and_filters(self):
        a = self.owner.post("/api/v1/ai/subject-requests/", self.payload(), format="json").json()
        self.owner.post("/api/v1/ai/subject-requests/", self.payload(reference="TKT-3", kind="access"), format="json")
        done = self.owner.patch(f"/api/v1/ai/subject-requests/{a['id']}/", {"status": "completed"}, format="json").json()
        self.assertEqual(done["closed_on"], str(date.today()))
        self.assertFalse(done["overdue"])
        reopened = self.owner.patch(f"/api/v1/ai/subject-requests/{a['id']}/", {"status": "in_progress"}, format="json").json()
        self.assertIsNone(reopened["closed_on"])
        self.owner.patch(f"/api/v1/ai/subject-requests/{a['id']}/", {"status": "completed"}, format="json")
        rows = self.owner.get("/api/v1/ai/subject-requests/?open=true").json()["results"]
        self.assertEqual([x["reference"] for x in rows], ["TKT-3"])
        self.assertEqual(len(self.owner.get("/api/v1/ai/subject-requests/?kind=erasure").json()["results"]), 1)

    def test_rejects_email_reference_bad_dates_and_foreign_references(self):
        self.assertEqual(self.owner.post("/api/v1/ai/subject-requests/", self.payload(reference="a@b.com"), format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/v1/ai/subject-requests/", self.payload(due_on=str(date.today() - timedelta(days=60))), format="json").status_code, 400)
        other = self.client_for("owner_b")
        self.assertEqual(other.post("/api/v1/ai/subject-requests/", self.payload(), format="json").status_code, 400)
        a = self.owner.post("/api/v1/ai/subject-requests/", self.payload(), format="json").json()
        self.assertEqual(other.get(f"/api/v1/ai/subject-requests/{a['id']}/").status_code, 404)
        self.assertEqual(self.reader.patch(f"/api/v1/ai/subject-requests/{a['id']}/", {"status": "completed"}, format="json").status_code, 403)
        self.assertIn(self.owner.delete(f"/api/v1/ai/subject-requests/{a['id']}/").status_code, (403, 405))
        self.assertTrue(m.DataSubjectRequest.all_objects.filter(id=a["id"]).exists())

    def test_get_creates_nothing(self):
        before = m.DataSubjectRequest.all_objects.count()
        self.owner.get("/api/v1/ai/subject-requests/")
        self.owner.get("/api/v1/ai/overview/")
        self.assertEqual(m.DataSubjectRequest.all_objects.count(), before)


class OverviewNumbersTests(RegisterTestBase):
    def test_overview_summarises_real_records(self):
        empty = self.owner.get("/api/v1/ai/overview/").json()
        self.assertEqual(empty["vendors"]["total"], 0)
        self.assertEqual(empty["requests"]["open"], 0)
        self.assertEqual(empty["controls"]["reviewed"], 0)
        self.owner.post("/api/v1/ai/dependencies/", {"system": self.system["id"], "name": "V", "personal_data_shared": True,
                                                    "contract_in_place": False, "criticality": "high"}, format="json")
        self.owner.post("/api/v1/ai/subject-requests/", {"system": self.system["id"], "reference": "T1", "kind": "access",
                                                         "received_on": str(date.today() - timedelta(days=45))}, format="json")
        data = self.owner.get("/api/v1/ai/overview/").json()
        self.assertEqual(data["vendors"]["total"], 1)
        self.assertEqual(data["vendors"]["without_dpa"], 1)
        self.assertEqual(data["requests"]["open"], 1)
        self.assertEqual(data["requests"]["overdue"], 1)
        self.assertEqual(data["controls"]["applicable"], data["systems"][0]["controls"]["applicable"])
        # another tenant sees none of it
        theirs = self.client_for("owner_b").get("/api/v1/ai/overview/").json()
        self.assertEqual(theirs["vendors"]["total"], 0)
        self.assertEqual(theirs["requests"]["total"], 0)


class SeedDemoControlsTests(AuditTestCase):
    def test_seed_is_idempotent_and_labels_demo_records(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("seed_demo_controls", "--tenant", "org-a", verbosity=0)
        owner = self.members["owner_a"]
        from apps.core.models import Membership

        Membership.all_objects.create(tenant=owner.tenant, user=self.users["reviewer_a"], email="admin_a@example.org", full_name="adm", role="TENANT_ADMIN", status="ACTIVE")
        self.seed_sample()  # the stored synthetic HireLens sample
        call_command("seed_demo_controls", "--tenant", "org-a", verbosity=0)
        counts = (m.DataSubjectRequest.all_objects.count(), m.ControlLink.all_objects.count(), m.ControlAssessmentEvent.all_objects.count())
        self.assertGreater(counts[0], 0)
        call_command("seed_demo_controls", "--tenant", "org-a", verbosity=0)
        self.assertEqual(counts, (m.DataSubjectRequest.all_objects.count(), m.ControlLink.all_objects.count(), m.ControlAssessmentEvent.all_objects.count()))
        self.assertFalse(m.DataSubjectRequest.all_objects.filter(is_demo=False).exists())
        self.assertFalse(m.AuditRun.all_objects.exists(), "Seeding must not fabricate audit runs without --run-audit.")
