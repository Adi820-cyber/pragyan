from apps.ai_audit import models as m
from apps.ai_audit.tests.base import AuditTestCase


class EndToEndAuditTests(AuditTestCase):
    def _start_run(self, client, system, version_label):
        mv = m.ModelVersion.all_objects.get(system=system, version_label=version_label)
        suffix = version_label
        ref = m.Dataset.all_objects.get(system=system, role="reference", name__contains=f"({suffix}")
        cur = m.Dataset.all_objects.get(system=system, role="current", name__contains=f"({suffix}")
        from apps.ai_audit.services.demo import DEMO_CONFIG

        response = client.post(
            "/api/v1/ai/runs/",
            {"system": str(system.id), "model_version": str(mv.id), "reference_dataset": str(ref.id),
             "current_dataset": str(cur.id), "config": {**DEMO_CONFIG, "bootstrap": 100}},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def test_full_audit_flow(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")

        run_id = self._start_run(owner, system, "v1")
        self.assertEqual(owner.get(f"/api/v1/ai/runs/{run_id}/").json()["status"], "queued")
        self.run_worker()

        run = owner.get(f"/api/v1/ai/runs/{run_id}/").json()
        self.assertEqual(run["status"], "completed", run.get("error"))
        counts = run["state_counts"]
        self.assertEqual(set(counts), {"bias", "drift", "explainability", "privacy", "governance"})
        self.assertIn("review_required", counts["bias"])
        self.assertIn("review_required", counts["drift"])
        self.assertIn("review_required", counts["privacy"])

        # Bias: v1 shows a selection-rate gap with a confidence interval and denominators.
        bias = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=bias&check_key=demographic_parity").json()
        self.assertEqual(len(bias), 1)
        self.assertGreater(bias[0]["value"], 0.10)
        self.assertEqual(bias[0]["state"], "review_required")
        self.assertIsNotNone(bias[0]["ci_low"])
        self.assertGreater(bias[0]["support_n"], 1000)

        # Explainability: additive self-check passes and city_tier is flagged as a proxy.
        expl = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=explainability").json()
        additivity = next(r for r in expl if r["check_key"] == "additivity")
        self.assertEqual(additivity["state"], "no_alert")
        self.assertTrue(any(r["check_key"] == "proxy_screen" and "city_tier" in r["subject"] and r["state"] == "review_required" for r in expl))

        # Privacy: email and phone are detected, and nothing raw leaks into results.
        priv = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=privacy").json()
        detected = {r["detail"].get("column") for r in priv if r["detail"].get("confidence") == "detected"}
        self.assertIn("email", detected)
        self.assertIn("phone", detected)
        self.assertNotIn("applicant1", str(priv))

        # Findings were raised and a report can be built.
        findings = owner.get(f"/api/v1/ai/findings/?run={run_id}").json()["results"]
        self.assertTrue(findings)
        html = owner.get(f"/api/v1/ai/runs/{run_id}/report.html/")
        self.assertEqual(html.status_code, 200)
        self.assertIn(b"Coverage", html.content)
        self.assertIn(b"not a certificate", html.content)
        self.assertIn("default-src 'none'", html["Content-Security-Policy"])
        self.assertEqual(html["X-Content-Type-Options"], "nosniff")
        report = owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        self.assertEqual(set(report["coverage"]), {"bias", "drift", "explainability", "privacy", "governance"})

        # Rerun with v2 (same held-out data): the gap narrows and the diff shows it.
        run2 = self._start_run(owner, system, "v2")
        self.run_worker()
        self.assertEqual(owner.get(f"/api/v1/ai/runs/{run2}/").json()["status"], "completed")
        bias2 = owner.get(f"/api/v1/ai/runs/{run2}/results/?category=bias&check_key=demographic_parity").json()[0]
        self.assertLess(bias2["value"], bias[0]["value"])
        self.assertEqual(bias2["state"], "no_alert")
        diff = owner.get(f"/api/v1/ai/runs/{run2}/diff/{run_id}/").json()
        self.assertTrue(any(c["check_key"] == "demographic_parity" for c in diff["changes"]))

        # Original run is untouched by the rerun.
        again = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=bias&check_key=demographic_parity").json()
        self.assertEqual(again[0]["value"], bias[0]["value"])

    def test_results_are_immutable(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        run_id = self._start_run(owner, system, "v1")
        self.run_worker()
        result = m.CheckResult.all_objects.filter(run_id=run_id).first()
        result.summary = "tampered"
        with self.assertRaises(ValueError):
            result.save()

    def test_finding_review_workflow_enforces_separation_of_duties(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        reviewer = self.client_for("reviewer_a")
        reader = self.client_for("reader_a")
        run_id = self._start_run(owner, system, "v1")
        self.run_worker()
        finding = owner.get(f"/api/v1/ai/findings/?run={run_id}").json()["results"][0]
        fid = finding["id"]

        # Cannot submit without a comment.
        self.assertEqual(owner.post(f"/api/v1/ai/findings/{fid}/submit/", {}, format="json").status_code, 400)
        ok = owner.post(f"/api/v1/ai/findings/{fid}/submit/", {"comment": "Removed proxy; see v2"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)

        # Owner/submitter cannot approve their own submission; read-only user cannot either.
        self.assertEqual(owner.post(f"/api/v1/ai/findings/{fid}/accept/", {"comment": "ok"}, format="json").status_code, 403)
        self.assertEqual(reader.post(f"/api/v1/ai/findings/{fid}/accept/", {"comment": "ok"}, format="json").status_code, 403)

        # Independent reviewer can, once only.
        self.assertEqual(reviewer.post(f"/api/v1/ai/findings/{fid}/accept/", {}, format="json").status_code, 400)
        done = reviewer.post(f"/api/v1/ai/findings/{fid}/accept/", {"comment": "Risk accepted until Q4"}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(done.json()["status"], "accepted")
        again = reviewer.post(f"/api/v1/ai/findings/{fid}/accept/", {"comment": "twice"}, format="json")
        self.assertEqual(again.status_code, 400)
        history = [h["action"] for h in done.json()["history"]]
        self.assertEqual(history, ["created", "submit", "accept"])

        # Accepting a finding does not rewrite the measurements behind it.
        bias = m.CheckResult.all_objects.filter(run_id=run_id, check_key="demographic_parity").first()
        self.assertEqual(bias.state, "review_required")

    def test_cancel_queued_run(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        run_id = self._start_run(owner, system, "v1")
        cancelled = owner.post(f"/api/v1/ai/runs/{run_id}/cancel/")
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.run_worker()
        self.assertEqual(owner.get(f"/api/v1/ai/runs/{run_id}/").json()["status"], "cancelled")
        self.assertEqual(m.CheckResult.all_objects.filter(run_id=run_id).count(), 0)

    def test_bad_config_is_rejected_with_actionable_message(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        mv = m.ModelVersion.all_objects.get(system=system, version_label="v1")
        ref = m.Dataset.all_objects.get(system=system, role="reference", name__contains="(v1")
        response = owner.post(
            "/api/v1/ai/runs/",
            {"system": str(system.id), "model_version": str(mv.id), "reference_dataset": str(ref.id),
             "config": {"prediction_column": "nope", "favourable_label": "1", "group_columns": ["gender"]}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("nope", str(response.json()))
