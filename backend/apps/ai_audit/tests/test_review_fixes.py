import io

import pandas as pd

from apps.ai_audit import models as m
from apps.ai_audit.services import explain, fairness, privacy
from apps.ai_audit.services.common import merged_thresholds
from apps.ai_audit.services.validation import AuditInputError, validate_run_config
from apps.ai_audit.tests.base import AuditTestCase
from apps.ai_audit.tests.test_checks import cfg, hand_fixture
from apps.ai_audit.tests.test_e2e import EndToEndAuditTests


class InputSafetyTests(AuditTestCase):
    def test_nan_and_out_of_range_thresholds_are_rejected(self):
        for bad in (float("nan"), float("inf"), -0.1, 1.5, "abc"):
            with self.assertRaises(AuditInputError, msg=str(bad)):
                validate_run_config(cfg(thresholds={"demographic_parity_difference": bad}), hand_fixture(), None)
        with self.assertRaises(AuditInputError):
            validate_run_config(cfg(thresholds={"not_a_threshold": 0.1}), hand_fixture(), None)
        with self.assertRaises(ValueError):
            merged_thresholds({"thresholds": {"drift_ks": float("nan")}})

    def test_nan_threshold_cannot_switch_alerts_off(self):
        # Even if a NaN reached the check, a clear 30-point gap must not read as "no alert".
        res = fairness.run_bias_checks(hand_fixture(), cfg())
        self.assertEqual(next(r for r in res if r.check_key == "demographic_parity").state, "review_required")

    def test_multiclass_predictions_are_rejected_not_collapsed(self):
        df = pd.DataFrame({"g": ["a", "b"] * 30, "pred": ["yes", "no", "other"] * 20, "y": [1, 0] * 30})
        with self.assertRaises(AuditInputError) as ctx:
            validate_run_config(cfg(favourable_label="yes"), df, None)
        self.assertIn("multi-class", str(ctx.exception))

    def test_retention_settings_are_validated(self):
        with self.assertRaises(AuditInputError):
            validate_run_config(cfg(retention_days=30), hand_fixture(), None)  # no date column
        with self.assertRaises(AuditInputError):
            validate_run_config(cfg(retention_days="soon", retention_date_column="g"), hand_fixture(), None)

    def test_unreadable_retention_dates_are_insufficient_not_clear(self):
        df = pd.DataFrame({"created": ["not a date"] * 40, "x": range(40)})
        res = privacy.run_privacy_checks({"reference": df}, cfg(retention_days=30, retention_date_column="created"))
        retention = next(r for r in res if r.check_key == "retention")
        self.assertEqual(retention.state, "insufficient_evidence")
        self.assertIn("0 of 40", retention.summary)

        ok = pd.DataFrame({"created": ["2020-01-01"] * 40, "x": range(40)})
        res = privacy.run_privacy_checks({"reference": ok}, cfg(retention_days=30, retention_date_column="created"))
        self.assertEqual(next(r for r in res if r.check_key == "retention").state, "review_required")


class BundleTrustTests(AuditTestCase):
    def bundle(self, **overrides):
        base = {
            "schema_version": 1, "output_unit": "log-odds", "n_rows": 100, "base_value": -1.0, "additivity_max_error": 0.0,
            "features": ["a", "b"], "global_importance": [{"feature": "a", "mean_abs_shap": 0.5}],
            "local_explanations": [{"row_index": 0, "output": 0.2, "contributions": {"a": 0.6, "b": 0.6},
                                    "feature_values": {"a": 1.5, "email": "ravi@example.org", "b": "free text"}}],
            "producer": {"tool": "reskure-audit", "version": "1.0"},
        }
        base.update(overrides)
        return base

    def test_claimed_self_check_is_recomputed(self):
        # -1.0 + 0.6 + 0.6 = 0.2, so this bundle is consistent.
        res = explain.run_explainability_bundle(self.bundle(), pd.DataFrame({"a": range(50), "b": range(50)}), cfg())
        self.assertEqual(next(r for r in res if r.check_key == "additivity").state, "no_alert")

        lying = self.bundle(local_explanations=[{"row_index": 0, "output": 5.0, "contributions": {"a": 0.6, "b": 0.6}}])
        res = explain.run_explainability_bundle(lying, pd.DataFrame({"a": range(50), "b": range(50)}), cfg())
        check = next(r for r in res if r.check_key == "additivity")
        self.assertEqual(check.state, "error")
        self.assertIn("do not add up", check.summary)
        self.assertEqual(check.detail["claimed_error"], 0.0)

    def test_example_values_never_carry_personal_or_text_data(self):
        frame = pd.DataFrame({"a": range(50), "b": range(50), "email": [f"u{i}@example.org" for i in range(50)]})
        res = explain.run_explainability_bundle(self.bundle(), frame, cfg())
        blob = repr([(r.summary, r.detail) for r in res])
        self.assertNotIn("ravi@example.org", blob)
        self.assertNotIn("free text", blob)
        example = next(r for r in res if r.check_key == "local_explanations").detail["examples"][0]
        self.assertEqual(example["feature_values"]["a"], 1.5)
        self.assertEqual(example["feature_values"]["email"], "(withheld: personal data)")
        self.assertEqual(example["feature_values"]["b"], "(text withheld)")


class HistoryIntegrityTests(AuditTestCase):
    def test_report_uses_the_state_at_audit_time(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")
        run_id = EndToEndAuditTests._start_run(self, owner, system, "v1")
        self.run_worker()
        before = owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        self.assertEqual(before["system"]["name"], system.name)

        # Later edits to the system, model version and a control must not rewrite the old report.
        owner.patch(f"/api/v1/ai/systems/{system.id}/", {"purpose": "Changed after the audit"}, format="json")
        m.AISystem.all_objects.filter(id=system.id).update(name="Renamed later")
        m.ModelVersion.all_objects.filter(system=system, version_label="v1").update(version_label="v1-renamed")
        m.ControlAssessment.all_objects.filter(system=system, control_id="DPDP-01").update(state="gap_identified")

        after = owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        self.assertEqual(after["system"]["name"], before["system"]["name"])
        self.assertEqual(after["system"]["purpose"], before["system"]["purpose"])
        self.assertEqual(after["model_version"]["label"], "v1")
        self.assertEqual(
            next(c for c in after["controls"] if c["control_id"] == "DPDP-01")["state"],
            next(c for c in before["controls"] if c["control_id"] == "DPDP-01")["state"],
        )
        self.assertIsNotNone(after["as_of"])

    def test_editing_a_reviewed_control_voids_the_sign_off(self):
        owner = self.client_for("owner_a")
        reviewer = self.client_for("reviewer_a")
        system = owner.post("/api/v1/ai/systems/", {"name": "S", "purpose": "p", "jurisdictions": ["DPDP"]}, format="json").json()
        rows = owner.get(f"/api/v1/ai/control-assessments/?system={system['id']}").json()["results"]
        a = next(r for r in rows if r["control_id"] == "DPDP-06")
        f = io.BytesIO(b"procedure")
        f.name = "p.txt"
        owner.post(f"/api/v1/ai/control-assessments/{a['id']}/evidence/", {"title": "Procedure", "file": f}, format="multipart")
        ok = reviewer.post(f"/api/v1/ai/control-assessments/{a['id']}/review/", {"decision": "reviewed", "comment": "Adequate"}, format="json")
        self.assertEqual(ok.json()["state"], "reviewed")

        edited = owner.patch(f"/api/v1/ai/control-assessments/{a['id']}/", {"owner_note": "Procedure moved to a new tool"}, format="json")
        self.assertEqual(edited.status_code, 200, edited.content)
        body = edited.json()
        self.assertEqual(body["state"], "evidence_supplied")
        self.assertIsNone(body["reviewer_name"])
        self.assertEqual(body["review_comment"], "")
