import numpy as np
import pandas as pd
from django.test import SimpleTestCase

from apps.ai_audit.services import drift, explain, fairness, privacy
from apps.ai_audit.services.validation import AuditInputError, binary_indicator, load_csv, validate_run_config


def cfg(**overrides):
    base = {
        "prediction_column": "pred", "label_column": "y", "group_columns": ["g"], "favourable_label": "1",
        "min_group_size": 30, "bootstrap": 50, "seed": 1, "feature_columns": [],
    }
    base.update(overrides)
    return base


def hand_fixture() -> pd.DataFrame:
    """Two groups of 100 with known rates.

    A: selection 0.5, TPR 40/50 = 0.8, FPR 10/50 = 0.2
    B: selection 0.2, TPR 15/50 = 0.3, FPR 5/50  = 0.1
    Expected: DPD 0.3, ratio 0.4, TPR gap 0.5, FPR gap 0.1, equalized odds 0.5
    """
    rows = []
    for g, tp, fp in (("A", 40, 10), ("B", 15, 5)):
        rows += [(g, 1, 1)] * tp + [(g, 1, 0)] * (50 - tp) + [(g, 0, 1)] * fp + [(g, 0, 0)] * (50 - fp)
    return pd.DataFrame(rows, columns=["g", "y", "pred"])


def by(results, check_key, metric=None, subject=None):
    return [r for r in results if r.check_key == check_key and (metric is None or r.metric == metric)
            and (subject is None or r.subject == subject)]


class FairnessTests(SimpleTestCase):
    def test_matches_hand_calculation(self):
        res = fairness.run_bias_checks(hand_fixture(), cfg())
        dpd = by(res, "demographic_parity")[0]
        self.assertAlmostEqual(dpd.value, 0.3)
        self.assertEqual(dpd.state, "review_required")
        self.assertEqual(dpd.support_n, 200)
        self.assertIsNotNone(dpd.ci_low)
        self.assertLess(dpd.ci_low, 0.3)
        self.assertGreater(dpd.ci_high, 0.3)
        self.assertAlmostEqual(by(res, "selection_rate_ratio")[0].value, 0.4)
        eod = by(res, "equalized_odds")[0]
        self.assertAlmostEqual(eod.value, 0.5)
        self.assertAlmostEqual(eod.detail["tpr_gap"], 0.5)
        self.assertAlmostEqual(eod.detail["fpr_gap"], 0.1)
        self.assertAlmostEqual(by(res, "group_selection_rate", subject="g=A")[0].value, 0.5)
        self.assertAlmostEqual(by(res, "group_true_positive_rate", subject="g=B")[0].value, 0.3)

    def test_agrees_with_fairlearn(self):
        from fairlearn.metrics import demographic_parity_difference, demographic_parity_ratio, equalized_odds_difference

        df = hand_fixture()
        res = fairness.run_bias_checks(df, cfg())
        self.assertAlmostEqual(by(res, "demographic_parity")[0].value,
                               demographic_parity_difference(df.y, df.pred, sensitive_features=df.g))
        self.assertAlmostEqual(by(res, "selection_rate_ratio")[0].value,
                               demographic_parity_ratio(df.y, df.pred, sensitive_features=df.g))
        self.assertAlmostEqual(by(res, "equalized_odds")[0].value,
                               equalized_odds_difference(df.y, df.pred, sensitive_features=df.g))

    def test_random_data_agrees_with_fairlearn(self):
        from fairlearn.metrics import demographic_parity_difference, equalized_odds_difference

        rng = np.random.default_rng(3)
        df = pd.DataFrame({"g": rng.choice(["a", "b", "c"], 900), "y": rng.integers(0, 2, 900), "pred": rng.integers(0, 2, 900)})
        res = fairness.run_bias_checks(df, cfg())
        self.assertAlmostEqual(by(res, "demographic_parity")[0].value, demographic_parity_difference(df.y, df.pred, sensitive_features=df.g))
        self.assertAlmostEqual(by(res, "equalized_odds")[0].value, equalized_odds_difference(df.y, df.pred, sensitive_features=df.g))

    def test_no_group_column_is_not_applicable_not_a_pass(self):
        res = fairness.run_bias_checks(hand_fixture(), cfg(group_columns=[]))
        self.assertEqual([r.state for r in res], ["not_applicable"])

    def test_missing_labels_skip_error_rates_only(self):
        res = fairness.run_bias_checks(hand_fixture(), cfg(label_column=None))
        self.assertEqual(by(res, "equalized_odds")[0].state, "not_applicable")
        self.assertEqual(by(res, "demographic_parity")[0].state, "review_required")

    def test_zero_denominators_are_insufficient_not_zero(self):
        df = hand_fixture()
        df["pred"] = 0  # nobody selected: ratio denominator is zero
        res = fairness.run_bias_checks(df, cfg())
        ratio = by(res, "selection_rate_ratio")[0]
        self.assertEqual(ratio.state, "insufficient_evidence")
        self.assertIsNone(ratio.value)

        df = hand_fixture()
        df["y"] = 0  # no positive outcomes anywhere: TPR undefined
        res = fairness.run_bias_checks(df, cfg())
        self.assertEqual(by(res, "equalized_odds")[0].state, "insufficient_evidence")
        tpr = by(res, "group_true_positive_rate", subject="g=A")[0]
        self.assertEqual(tpr.state, "insufficient_evidence")
        self.assertIsNone(tpr.value)

    def test_small_groups_are_flagged(self):
        df = pd.concat([hand_fixture(), pd.DataFrame({"g": ["C"] * 10, "y": [1] * 10, "pred": [1] * 10})], ignore_index=True)
        res = fairness.run_bias_checks(df, cfg())
        small = by(res, "group_selection_rate", subject="g=C")[0]
        self.assertEqual(small.state, "insufficient_evidence")
        # The tiny group does not distort the gap between the two reliable groups.
        self.assertAlmostEqual(by(res, "demographic_parity")[0].value, 0.3)

    def test_single_reliable_group_cannot_be_compared(self):
        df = pd.DataFrame({"g": ["A"] * 100 + ["B"] * 5, "y": [1] * 105, "pred": [1] * 105})
        res = fairness.run_bias_checks(df, cfg())
        self.assertEqual(by(res, "demographic_parity")[0].state, "insufficient_evidence")

    def test_bootstrap_is_reproducible(self):
        a = fairness.run_bias_checks(hand_fixture(), cfg(seed=7))
        b = fairness.run_bias_checks(hand_fixture(), cfg(seed=7))
        self.assertEqual(by(a, "demographic_parity")[0].ci_low, by(b, "demographic_parity")[0].ci_low)

    def test_label_encodings(self):
        s = pd.Series([1, 0, 1.0, True, "1", None])
        self.assertEqual(binary_indicator(s, "1").tolist()[:5], [1.0, 0.0, 1.0, 1.0, 1.0])
        self.assertTrue(np.isnan(binary_indicator(s, "1").iloc[5]))
        # "0" can be the favourable label (for example "no default").
        self.assertEqual(binary_indicator(pd.Series([0, 1]), "0").tolist(), [1.0, 0.0])


class DriftTests(SimpleTestCase):
    def frame(self, seed, shift=0.0, n=2000, cats=("a", "b", "c")):
        rng = np.random.default_rng(seed)
        return pd.DataFrame({
            "x": rng.normal(shift, 1, n), "cat": rng.choice(list(cats), n), "pred": rng.integers(0, 2, n),
            "y": rng.integers(0, 2, n),
        })

    def config(self):
        return cfg(feature_columns=["x", "cat"], group_columns=[])

    def test_stable_data_has_no_alert(self):
        res = drift.run_drift_checks(self.frame(1), self.frame(2), self.config())
        feats = [r for r in res if r.check_key == "feature_distribution"]
        self.assertTrue(feats)
        self.assertTrue(all(r.state == "no_alert" for r in feats), [(r.subject, r.value) for r in feats])
        self.assertTrue(all(r.support_n == 2000 for r in feats))

    def test_shifted_feature_alerts_with_sample_sizes(self):
        res = drift.run_drift_checks(self.frame(1), self.frame(2, shift=1.0), self.config())
        x = next(r for r in res if r.check_key == "feature_distribution" and r.subject == "x")
        self.assertEqual(x.state, "review_required")
        self.assertGreater(x.value, 0.3)
        self.assertIn("n=2000", x.summary)
        cat = next(r for r in res if r.check_key == "feature_distribution" and r.subject == "cat")
        self.assertEqual(cat.state, "no_alert")

    def test_new_category_and_schema_change(self):
        cur = self.frame(2, cats=("a", "b", "c", "z")).drop(columns=["y"])
        res = drift.run_drift_checks(self.frame(1), cur, self.config())
        self.assertTrue(any(r.check_key == "unseen_categories" and r.subject == "cat" for r in res))
        schema = next(r for r in res if r.check_key == "schema")
        self.assertEqual(schema.state, "review_required")
        self.assertIn("y", schema.detail["removed"])

    def test_tiny_samples_are_insufficient(self):
        res = drift.run_drift_checks(self.frame(1, n=10), self.frame(2, n=10), self.config())
        x = next(r for r in res if r.check_key == "feature_distribution" and r.subject == "x")
        self.assertEqual(x.state, "insufficient_evidence")

    def test_performance_not_claimed_without_labels(self):
        cur = self.frame(2).drop(columns=["y"])
        res = drift.run_drift_checks(self.frame(1), cur, self.config())
        perf = next(r for r in res if r.check_key == "performance")
        self.assertEqual(perf.state, "not_applicable")

    def test_missingness_change(self):
        cur = self.frame(2)
        cur.loc[:600, "x"] = np.nan
        res = drift.run_drift_checks(self.frame(1), cur, self.config())
        self.assertTrue(any(r.check_key == "missingness" and r.subject == "x" for r in res))


def with_check_digit(body: str) -> str:
    for d in range(10):
        if privacy.verhoeff_valid(body + str(d)):
            return body + str(d)
    raise AssertionError


class PrivacyTests(SimpleTestCase):
    def test_aadhaar_checksum_rejects_order_ids(self):
        valid = with_check_digit("23456789012")
        invalid = valid[:-1] + str((int(valid[-1]) + 1) % 10)
        self.assertTrue(privacy.is_aadhaar(valid))
        self.assertFalse(privacy.is_aadhaar(invalid))
        df = pd.DataFrame({"order_id": [invalid] * 50})
        self.assertFalse([f for f in privacy.scan_dataframe(df) if f["kind"] == "aadhaar"])
        df = pd.DataFrame({"uid": [valid] * 50})
        self.assertTrue([f for f in privacy.scan_dataframe(df) if f["kind"] == "aadhaar"])

    def test_detectors_and_masking(self):
        df = pd.DataFrame({
            "contact": [f"user{i}@example.org" for i in range(40)],
            "mobile": [f"98765432{i:02d}" for i in range(40)],
            "pan": ["ABCDE1234F"] * 40,
            "note": ["hello world"] * 40,
        })
        found = {(f["column"], f["kind"]) for f in privacy.scan_dataframe(df)}
        self.assertIn(("contact", "email"), found)
        self.assertIn(("mobile", "phone"), found)
        self.assertIn(("pan", "pan"), found)
        self.assertFalse([f for f in privacy.scan_dataframe(df) if f["column"] == "note"])
        self.assertEqual(privacy.mask_value("email", "ravi@example.org"), "r***@e***.org")

    def test_no_raw_values_in_results(self):
        df = pd.DataFrame({"email": [f"secret{i}@example.org" for i in range(60)], "x": range(60)})
        res = privacy.run_privacy_checks({"reference": df}, cfg(feature_columns=["x"]))
        blob = repr([(r.summary, r.detail) for r in res])
        self.assertNotIn("secret1@", blob)
        self.assertIn("***", blob)

    def test_pii_as_model_input_is_flagged(self):
        df = pd.DataFrame({"email": [f"a{i}@example.org" for i in range(60)], "x": range(60)})
        res = privacy.run_privacy_checks({"reference": df}, cfg(feature_columns=["email", "x"]))
        minim = next(r for r in res if r.check_key == "minimisation")
        self.assertEqual(minim.state, "review_required")

    def test_name_only_match_is_marked_likely(self):
        df = pd.DataFrame({"full_name": ["Alice", "Bob"] * 30})
        found = privacy.scan_dataframe(df)
        self.assertEqual(found[0]["confidence"], "likely")

    def test_retention_not_checked_unless_declared(self):
        res = privacy.run_privacy_checks({"reference": pd.DataFrame({"x": range(60)})}, cfg())
        self.assertEqual(next(r for r in res if r.check_key == "retention").state, "not_applicable")


class ExplainTests(SimpleTestCase):
    def test_shap_is_additive_and_bounded(self):
        from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier

        rng = np.random.default_rng(0)
        X = pd.DataFrame(rng.normal(size=(800, 4)), columns=list("abcd"))
        y = (X["a"] + 0.5 * X["b"] + rng.normal(0, 0.3, 800) > 0).astype(int)
        for model, unit in ((GradientBoostingClassifier(n_estimators=30, random_state=0), "log-odds"),
                            (RandomForestClassifier(n_estimators=20, max_depth=4, random_state=0), "probability")):
            model.fit(X, y)
            exp = explain.explain_tree_model(model, X, max_rows=500)
            self.assertEqual(exp["output_unit"], unit)
            self.assertLessEqual(exp["additivity_max_error"], explain.ADDITIVITY_TOLERANCE)
            self.assertEqual(exp["n_rows"], 500)
            self.assertEqual(exp["global_importance"][0]["feature"], "a")

    def test_eta(self):
        g = pd.Series(["x"] * 50 + ["y"] * 50)
        self.assertGreater(explain.eta(pd.Series([0.0] * 50 + [1.0] * 50), g), 0.99)
        self.assertLess(explain.eta(pd.Series(np.random.default_rng(1).normal(size=100)), g), 0.3)

    def good_bundle(self):
        return {
            "schema_version": 1, "output_unit": "log-odds", "n_rows": 100, "base_value": -1.0, "additivity_max_error": 1e-9,
            "features": ["a", "b"], "global_importance": [{"feature": "a", "mean_abs_shap": 0.5}],
            "local_explanations": [{"row_index": 0, "output": 0.2, "contributions": {"a": 0.1, "b": 0.1}}],
            "producer": {"tool": "reskure-audit", "version": "1.0"},
        }

    def test_bundle_validation(self):
        explain.validate_bundle(self.good_bundle())
        for mutate in (
            lambda b: b.update(schema_version=2),
            lambda b: b.update(output_unit="percent"),
            lambda b: b.update(producer={}),
            lambda b: b.update(features=[]),
            lambda b: b["global_importance"].append({"feature": "zzz", "mean_abs_shap": 1}),
            lambda b: b["local_explanations"][0]["contributions"].update(unknown=1),
            lambda b: b["local_explanations"][0]["contributions"].update(a=float("nan")),
            lambda b: b.update(base_value="x"),
        ):
            bundle = self.good_bundle()
            mutate(bundle)
            with self.assertRaises(AuditInputError):
                explain.validate_bundle(bundle)
        with self.assertRaises(AuditInputError):
            explain.validate_bundle([])

    def test_bundle_results_are_marked_as_supplied(self):
        res = explain.run_explainability_bundle(self.good_bundle(), pd.DataFrame({"a": range(50), "b": range(50)}), cfg())
        self.assertTrue(all(r.origin == "local_bundle" for r in res))
        self.assertTrue(any(r.check_key == "provenance" for r in res))


class ValidationTests(SimpleTestCase):
    def test_csv_loading_errors(self):
        with self.assertRaises(AuditInputError):
            load_csv(b"a,b\n1,2\n", max_rows=0)
        with self.assertRaises(AuditInputError):
            load_csv(b"a,b\n1,2\n", max_rows=10, max_bytes=3)
        with self.assertRaises(AuditInputError):
            load_csv(b",b\n1,2\n", max_rows=10)
        self.assertEqual(len(load_csv("\ufeffa,b\n1,2\n".encode("utf-8"), max_rows=10)), 1)

    def test_config_problems_are_all_listed(self):
        df = hand_fixture()
        with self.assertRaises(AuditInputError) as ctx:
            validate_run_config(cfg(prediction_column="nope", group_columns=["missing"], favourable_label=""), df, None)
        text = " ".join(ctx.exception.problems)
        self.assertIn("nope", text)
        self.assertIn("missing", text)
        self.assertIn("favourable_label", text)

    def test_favourable_label_must_exist_in_predictions(self):
        with self.assertRaises(AuditInputError) as ctx:
            validate_run_config(cfg(favourable_label="yes"), hand_fixture(), None)
        self.assertIn("never appears", str(ctx.exception))
