from datetime import date, timedelta

from django.test import SimpleTestCase

from apps.ai_audit.services import governance

TODAY = date(2026, 10, 24)


def vendor(**kw):
    base = {
        "name": "ExampleAI", "role": "model_provider", "personal_data_shared": True, "outside_india": False, "outside_eea": False,
        "transfer_mechanism": "", "contract_in_place": True, "trains_on_customer_data": "no", "retention_days": 30,
        "subprocessors_listed": True, "exit_plan": True, "criticality": "medium", "last_reviewed": TODAY - timedelta(days=30), "region": "India",
    }
    base.update(kw)
    return base


def process(right="access", **kw):
    base = {"right": right, "procedure_exists": True, "owner_name": "Asha", "channel": "privacy@example.org",
            "last_tested": TODAY - timedelta(days=30), "requests_12m": 0, "closed_on_time_12m": 0}
    base.update(kw)
    return base


def by(res, check_key, subject=None, metric=None):
    return [r for r in res if r.check_key == check_key and (subject is None or r.subject == subject) and (metric is None or r.metric == metric)]


class VendorTests(SimpleTestCase):
    def test_no_vendors_recorded_is_a_gap_not_a_pass(self):
        res = governance.run_vendor_checks([], ["DPDP"], TODAY)
        self.assertEqual(res[0].state, "insufficient_evidence")
        self.assertTrue(res[0].is_finding_candidate)

    def test_clean_vendor_has_no_alert(self):
        res = governance.run_vendor_checks([vendor()], ["DPDP", "GDPR"], TODAY)
        self.assertEqual(by(res, "vendor_dependency")[0].state, "no_alert")

    def test_missing_contract_and_training_are_high_severity(self):
        res = governance.run_vendor_checks([vendor(contract_in_place=False, trains_on_customer_data="yes")], [], TODAY)
        r = by(res, "vendor_dependency")[0]
        self.assertEqual(r.state, "review_required")
        self.assertTrue(r.detail["high_severity"])
        self.assertIn("without a contract", r.summary)
        self.assertIn("trains on your data", r.summary)

    def test_unknowns_are_insufficient_evidence(self):
        res = governance.run_vendor_checks([vendor(trains_on_customer_data="unknown", retention_days=None, subprocessors_listed=False)], [], TODAY)
        r = by(res, "vendor_dependency")[0]
        self.assertEqual(r.state, "insufficient_evidence")
        self.assertIn("how long the vendor keeps the data", r.summary)

    def test_transfer_rules_depend_on_selected_law(self):
        v = vendor(outside_eea=True, outside_india=True)
        gdpr = by(governance.run_vendor_checks([v], ["GDPR"], TODAY), "vendor_dependency")[0]
        self.assertIn("Chapter V", gdpr.summary)
        dpdp = by(governance.run_vendor_checks([v], ["DPDP"], TODAY), "vendor_dependency")[0]
        self.assertIn("leaves India", dpdp.summary)
        none = by(governance.run_vendor_checks([v], [], TODAY), "vendor_dependency")[0]
        self.assertEqual(none.state, "no_alert")
        ok = by(governance.run_vendor_checks([vendor(outside_eea=True, transfer_mechanism="SCCs")], ["GDPR"], TODAY), "vendor_dependency")[0]
        self.assertEqual(ok.state, "no_alert")

    def test_stale_or_missing_reviews_and_exit_plans(self):
        stale = by(governance.run_vendor_checks([vendor(last_reviewed=TODAY - timedelta(days=500))], [], TODAY), "vendor_dependency")[0]
        self.assertEqual(stale.state, "review_required")
        never = by(governance.run_vendor_checks([vendor(last_reviewed=None)], [], TODAY), "vendor_dependency")[0]
        self.assertIn("never been reviewed", never.summary)
        res = governance.run_vendor_checks([vendor(criticality="high", exit_plan=False)], [], TODAY)
        self.assertIn("exit plan", by(res, "vendor_dependency")[0].summary)
        self.assertEqual(by(res, "vendor_concentration")[0].state, "review_required")


class RightsTests(SimpleTestCase):
    def test_not_assessed_without_a_privacy_law(self):
        res = governance.run_rights_checks([], [], False, today=TODAY)
        self.assertEqual(res[0].state, "not_applicable")

    def test_every_required_right_is_checked_and_missing_ones_alert(self):
        res = governance.run_rights_checks([process("access")], ["DPDP"], False, today=TODAY)
        subjects = {r.subject for r in res}
        self.assertEqual(subjects, {"access", "correction", "erasure", "grievance", "withdraw_consent"})
        self.assertEqual(by(res, "data_rights", "access")[0].state, "no_alert")
        self.assertEqual(by(res, "data_rights", "erasure")[0].state, "review_required")

    def test_human_review_is_required_only_for_automated_decisions(self):
        procs = [process(r) for r in ("access", "correction", "erasure", "grievance", "withdraw_consent")]
        self.assertNotIn("human_review", {r.subject for r in governance.run_rights_checks(procs, ["GDPR"], False, today=TODAY)})
        res = governance.run_rights_checks(procs, ["GDPR"], True, today=TODAY)
        r = by(res, "data_rights", "human_review")[0]
        self.assertEqual(r.state, "review_required")
        self.assertTrue(r.detail["high_severity"])

    def test_owner_channel_and_testing_gaps(self):
        res = governance.run_rights_checks([process("access", owner_name="", channel="", last_tested=None)], ["DPDP"], False, today=TODAY)
        text = by(res, "data_rights", "access")[0].summary
        self.assertIn("no named owner", text)
        self.assertIn("no request channel", text)
        self.assertIn("never been tested", text)

    def test_on_time_rate_uses_counts_with_interval(self):
        res = governance.run_rights_checks([process("access", requests_12m=10, closed_on_time_12m=6)], ["DPDP"], False, today=TODAY)
        rate = by(res, "data_rights", "access", "requests_on_time")[0]
        self.assertAlmostEqual(rate.value, 0.6)
        self.assertEqual(rate.state, "review_required")
        self.assertLess(rate.ci_low, 0.6)
        few = governance.run_rights_checks([process("access", requests_12m=2, closed_on_time_12m=0)], ["DPDP"], False, today=TODAY)
        self.assertEqual(by(few, "data_rights", "access", "requests_on_time")[0].state, "insufficient_evidence")
