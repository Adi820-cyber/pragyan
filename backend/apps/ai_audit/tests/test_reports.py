from apps.ai_audit import models as m
from apps.ai_audit.services import report as report_service
from apps.ai_audit.tests.base import AuditTestCase
from apps.ai_audit.tests import test_e2e


class ReportWorkflowTests(AuditTestCase):
    def _completed_run(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        run_id = test_e2e.EndToEndAuditTests._start_run(self, owner, system, "v1")
        self.run_worker()
        return owner, run_id

    def _generate(self, client, run_id):
        response = client.post("/api/v1/ai/reports/", {"run": run_id}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_generate_submit_and_approve_with_separation_of_duties(self):
        owner, run_id = self._completed_run()
        reviewer = self.client_for("reviewer_a")
        report = self._generate(owner, run_id)
        rid = report["id"]
        self.assertEqual((report["status"], report["version"]), ("draft", 1))
        self.assertEqual(report["generated_by_name"], "owner_a")
        self.assertEqual(len(report["fingerprint"]), 64)
        # Only one open report per run.
        self.assertEqual(owner.post("/api/v1/ai/reports/", {"run": run_id}, format="json").status_code, 409)
        # Cannot approve a draft.
        self.assertEqual(reviewer.post(f"/api/v1/ai/reports/{rid}/approve/", {}, format="json").status_code, 400)
        self.assertEqual(owner.post(f"/api/v1/ai/reports/{rid}/submit/", {}, format="json").json()["status"], "in_review")
        # Generator/submitter cannot approve (and does not hold the review permission anyway).
        self.assertEqual(owner.post(f"/api/v1/ai/reports/{rid}/approve/", {}, format="json").status_code, 403)
        # A reader cannot submit or approve.
        reader = self.client_for("reader_a")
        self.assertEqual(reader.post(f"/api/v1/ai/reports/{rid}/approve/", {}, format="json").status_code, 403)
        approved = reviewer.post(f"/api/v1/ai/reports/{rid}/approve/", {"comment": "Reviewed."}, format="json")
        self.assertEqual(approved.status_code, 200, approved.content)
        body = approved.json()
        self.assertEqual((body["status"], body["approved_by_name"]), ("approved", "reviewer_a"))
        self.assertEqual([e["action"] for e in body["events"]], ["generate", "submit", "approve"])
        # Approved reports cannot be changed again.
        self.assertEqual(reviewer.post(f"/api/v1/ai/reports/{rid}/approve/", {}, format="json").status_code, 400)

    def test_reviewer_who_generated_cannot_approve_own_report(self):
        owner, run_id = self._completed_run()
        reviewer = self.client_for("reviewer_a")
        rid = self._generate(reviewer, run_id)["id"]
        reviewer.post(f"/api/v1/ai/reports/{rid}/submit/", {}, format="json")
        response = reviewer.post(f"/api/v1/ai/reports/{rid}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Segregation of duties", response.json()["detail"])

    def test_request_changes_needs_comment_and_returns_to_draft(self):
        owner, run_id = self._completed_run()
        reviewer = self.client_for("reviewer_a")
        rid = self._generate(owner, run_id)["id"]
        owner.post(f"/api/v1/ai/reports/{rid}/submit/", {}, format="json")
        self.assertEqual(reviewer.post(f"/api/v1/ai/reports/{rid}/request-changes/", {}, format="json").status_code, 400)
        back = reviewer.post(f"/api/v1/ai/reports/{rid}/request-changes/", {"comment": "Add vendor evidence"}, format="json").json()
        self.assertEqual((back["status"], back["review_comment"]), ("draft", "Add vendor evidence"))

    def test_run_must_be_completed_and_tenant_scoped(self):
        owner, run_id = self._completed_run()
        other = self.client_for("owner_b")
        self.assertEqual(other.post("/api/v1/ai/reports/", {"run": run_id}, format="json").status_code, 404)
        rid = self._generate(owner, run_id)["id"]
        self.assertEqual(other.get(f"/api/v1/ai/reports/{rid}/").status_code, 404)
        self.assertEqual(other.get(f"/api/v1/ai/reports/{rid}/html/").status_code, 404)
        self.assertEqual(other.post(f"/api/v1/ai/reports/{rid}/submit/", {}, format="json").status_code, 404)
        self.assertEqual(other.get("/api/v1/ai/reports/").json()["results"], [])
        m.AuditRun.all_objects.filter(id=run_id).update(status="failed")
        m.AuditReport.all_objects.all().delete()
        self.assertEqual(owner.post("/api/v1/ai/reports/", {"run": run_id}, format="json").status_code, 400)

    def test_fingerprint_verifies_and_detects_tampering(self):
        owner, run_id = self._completed_run()
        rid = self._generate(owner, run_id)["id"]
        self.assertTrue(owner.get(f"/api/v1/ai/reports/{rid}/verify/").json()["valid"])
        # Changing a stored measurement after the report was frozen is detected.
        result = m.CheckResult.all_objects.filter(run_id=run_id).first()
        m.CheckResult.all_objects.filter(id=result.id).update(summary="edited later")
        check = owner.get(f"/api/v1/ai/reports/{rid}/verify/").json()
        self.assertFalse(check["valid"])
        self.assertFalse(check["source_results_match"])
        # Editing the stored snapshot is detected too.
        m.CheckResult.all_objects.filter(id=result.id).update(summary=result.summary)
        report = m.AuditReport.all_objects.get(id=rid)
        report.snapshot["system"]["name"] = "Renamed"
        report.save()
        self.assertFalse(owner.get(f"/api/v1/ai/reports/{rid}/verify/").json()["snapshot_matches"])

    def test_exports_and_summary_do_not_overclaim(self):
        owner, run_id = self._completed_run()
        report = self._generate(owner, run_id)
        rid = report["id"]
        summary = report["executive_summary"]
        self.assertEqual(summary["verdict"]["level"], "attention")
        self.assertTrue(1 <= len(summary["top_risks"]) <= 3)
        self.assertTrue(summary["failed"])
        self.assertTrue(summary["not_tested"])
        html = owner.get(f"/api/v1/ai/reports/{rid}/html/")
        self.assertEqual(html.status_code, 200)
        text = html.content.decode()
        for expected in ("Executive summary", "Fingerprint", report["fingerprint"], "Not approved", "Supports evidence for"):
            self.assertIn(expected, text)
        self.assertNotIn("compliant with", text.lower().replace("not a statement that the system is compliant", ""))
        md = owner.get(f"/api/v1/ai/reports/{rid}/markdown/")
        self.assertIn("attachment", md["Content-Disposition"])
        self.assertIn(report["fingerprint"], md.content.decode())
        self.assertIn("does not show that an organisation complies", md.content.decode())

    def test_list_filters_and_versions_increment(self):
        owner, run_id = self._completed_run()
        reviewer = self.client_for("reviewer_a")
        first = self._generate(owner, run_id)["id"]
        owner.post(f"/api/v1/ai/reports/{first}/submit/", {}, format="json")
        reviewer.post(f"/api/v1/ai/reports/{first}/approve/", {}, format="json")
        second = self._generate(owner, run_id)
        self.assertEqual(second["version"], 2)
        listed = owner.get("/api/v1/ai/reports/?status=approved").json()["results"]
        self.assertEqual([r["id"] for r in listed], [first])
        self.assertNotIn("snapshot", listed[0])

    def test_reports_are_frozen_against_later_changes(self):
        owner, run_id = self._completed_run()
        rid = self._generate(owner, run_id)["id"]
        report = m.AuditReport.all_objects.get(id=rid)
        before = report_service.render_html(report.snapshot)
        m.AISystem.all_objects.filter(id=report.system_id).update(name="Renamed afterwards")
        after = report_service.render_html(m.AuditReport.all_objects.get(id=rid).snapshot)
        self.assertEqual(before, after)
        self.assertNotIn("Renamed afterwards", after)