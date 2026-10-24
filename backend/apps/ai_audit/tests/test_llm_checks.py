import numpy as np
import pandas as pd
from django.test import SimpleTestCase

from apps.ai_audit.services import llm, privacy
from apps.ai_audit.services.validation import AuditInputError, validate_llm_config


def cfg(**overrides):
    base = {
        "prompt_column": "prompt", "output_column": "output", "context_column": "context", "score_column": None,
        "group_columns": ["lang"], "min_group_size": 30, "bootstrap": 50, "seed": 1, "require_citations": False,
        "human_reviewed_column": None, "human_override_column": None,
    }
    base.update(overrides)
    return base


REFUSAL = "I'm sorry, but I can't help with that request."


def frame(a_refusals=10, b_refusals=30, n=100):
    rows = []
    for lang, refused in (("A", a_refusals), ("B", b_refusals)):
        for i in range(n):
            rows.append({"lang": lang, "prompt": f"question {i}", "context": "revenue was 500 crore up 12%",
                         "output": REFUSAL if i < refused else "Revenue was 500 crore."})
    return pd.DataFrame(rows)


class TextHelpersTests(SimpleTestCase):
    def test_refusal_detection(self):
        self.assertTrue(llm.is_refusal(REFUSAL))
        self.assertTrue(llm.is_refusal("As an AI, I cannot do that."))
        self.assertFalse(llm.is_refusal("Revenue was 500 crore, and I can show the working."))

    def test_numbers_ignore_citation_markers_and_commas(self):
        self.assertEqual(llm.numbers_in("Revenue was ₹1,250 crore, up 12.5% [1] [23]."), {1250.0, 12.5})
        self.assertEqual(llm.numbers_in("1. First point\n2. Second 40"), {40.0})


class LlmBiasTests(SimpleTestCase):
    def test_refusal_gap_matches_hand_calculation(self):
        res = llm.run_llm_bias(frame(), cfg())
        gap = next(r for r in res if r.check_key == "refusal_gap")
        self.assertAlmostEqual(gap.value, 0.20)  # 30% vs 10%
        self.assertEqual(gap.state, "review_required")
        self.assertEqual(gap.detail["highest"], "B")
        self.assertIsNotNone(gap.ci_low)
        self.assertEqual(next(r for r in res if r.subject == "lang=A" and r.check_key == "group_refusal_rate").value, 0.10)

    def test_no_gap_is_no_alert_and_small_groups_are_insufficient(self):
        res = llm.run_llm_bias(frame(10, 10), cfg())
        self.assertEqual(next(r for r in res if r.check_key == "refusal_gap").state, "no_alert")
        small = llm.run_llm_bias(frame(2, 5, n=10), cfg())
        self.assertEqual(next(r for r in small if r.check_key == "refusal_gap").state, "insufficient_evidence")

    def test_no_group_column_is_not_applicable(self):
        res = llm.run_llm_bias(frame(), cfg(group_columns=[]))
        self.assertEqual([r.state for r in res], ["not_applicable"])

    def test_length_and_score_gaps(self):
        df = frame(0, 0)
        df.loc[df.lang == "B", "output"] = "Short."
        df["score"] = np.where(df.lang == "A", 4.0, 3.0) + np.tile([-0.1, 0.1], 100)
        res = llm.run_llm_bias(df, cfg(score_column="score"))
        ratio = next(r for r in res if r.check_key == "response_length_gap")
        self.assertLess(ratio.value, 0.5)
        self.assertEqual(ratio.state, "review_required")
        score = next(r for r in res if r.check_key == "score_gap")
        self.assertGreater(score.value, 1.0)
        self.assertEqual(score.state, "review_required")


class GroundingTests(SimpleTestCase):
    def frame(self, outputs, contexts=None):
        n = len(outputs)
        return pd.DataFrame({"lang": ["A"] * n, "prompt": ["q"] * n,
                             "context": contexts or ["Revenue was 500 crore up 12 percent for Alpha Textiles."] * n, "output": outputs})

    def test_supported_outputs_score_high_and_invented_figures_are_flagged(self):
        good = ["Alpha Textiles revenue was 500 crore up 12 percent."] * 60
        bad = ["Alpha Textiles revenue was 900 crore up 12 percent."] * 40
        res = llm.run_llm_grounding(self.frame(good + bad), cfg())
        numbers = next(r for r in res if r.check_key == "unsupported_numbers")
        self.assertAlmostEqual(numbers.value, 0.40)
        self.assertEqual(numbers.state, "review_required")
        self.assertEqual(numbers.detail["outputs_with_unsupported_numbers"], 40)
        grounded = next(r for r in res if r.check_key == "groundedness")
        self.assertGreater(grounded.value, 0.8)
        self.assertNotIn("Alpha", repr(grounded.detail))  # row positions only, never text

    def test_ungrounded_text_alerts(self):
        res = llm.run_llm_grounding(self.frame(["Quarterly synergies drive unprecedented momentum across markets."] * 60), cfg())
        self.assertEqual(next(r for r in res if r.check_key == "groundedness").state, "review_required")

    def test_no_context_column_is_not_applicable_and_citations_still_reported(self):
        res = llm.run_llm_grounding(self.frame(["Revenue was 500 crore [1]."] * 40), cfg(context_column=None, require_citations=True))
        self.assertEqual(next(r for r in res if r.check_key == "groundedness").state, "not_applicable")
        self.assertEqual(next(r for r in res if r.check_key == "citations").state, "no_alert")

    def test_missing_citations_alert_when_required(self):
        res = llm.run_llm_grounding(self.frame(["Revenue was 500 crore."] * 40), cfg(require_citations=True))
        citations = next(r for r in res if r.check_key == "citations")
        self.assertEqual(citations.state, "review_required")
        self.assertEqual(citations.value, 0.0)


class LlmDriftTests(SimpleTestCase):
    def frame(self, topic, n=200):
        return pd.DataFrame({"lang": ["A"] * n, "prompt": [f"Summarise the {topic} for company {i % 7}" for i in range(n)],
                             "context": ["x"] * n, "output": [f"Here is the {topic} summary" for _ in range(n)]})

    def test_same_topics_do_not_alert_and_new_topics_do(self):
        same = llm.run_llm_drift(self.frame("revenue"), self.frame("revenue"), cfg())
        vocab = next(r for r in same if r.subject == "prompt_topics")
        self.assertEqual(vocab.state, "no_alert")
        moved = llm.run_llm_drift(self.frame("revenue"), self.frame("climate transition"), cfg())
        vocab = next(r for r in moved if r.subject == "prompt_topics")
        self.assertEqual(vocab.state, "review_required")
        self.assertIn("climate", vocab.summary)

    def test_accuracy_is_never_claimed(self):
        res = llm.run_llm_drift(self.frame("revenue"), self.frame("revenue"), cfg())
        self.assertEqual(next(r for r in res if r.check_key == "performance").state, "not_applicable")


class OversightTests(SimpleTestCase):
    def frame(self, n=400, reviewed=0.5, overridden=0):
        r = np.zeros(n)
        r[: int(n * reviewed)] = 1
        o = np.zeros(n)
        o[:overridden] = 1
        return pd.DataFrame({"output": ["x"] * n, "rev": r, "ovr": o})

    def test_not_measured_without_a_column(self):
        res = llm.run_llm_oversight(self.frame(), cfg())
        self.assertEqual(res[0].state, "not_applicable")

    def test_rubber_stamp_pattern_is_flagged(self):
        res = llm.run_llm_oversight(self.frame(overridden=0), cfg(human_reviewed_column="rev", human_override_column="ovr"))
        override = next(r for r in res if r.metric == "override_rate")
        self.assertEqual(override.state, "review_required")
        self.assertIn("formality", override.summary)

    def test_healthy_review_and_low_coverage(self):
        ok = llm.run_llm_oversight(self.frame(overridden=20), cfg(human_reviewed_column="rev", human_override_column="ovr"))
        self.assertEqual(next(r for r in ok if r.metric == "override_rate").state, "no_alert")
        low = llm.run_llm_oversight(self.frame(reviewed=0.02), cfg(human_reviewed_column="rev"))
        self.assertEqual(low[0].state, "review_required")


class LlmPrivacyTests(SimpleTestCase):
    def test_text_pii_detected_masked_and_surfaced_output_flagged(self):
        df = pd.DataFrame({
            "prompt": ["Send to ravi@example.org please"] * 20 + ["plain question"] * 80,
            "context": ["doc"] * 100,
            "output": ["Done, sent to ravi@example.org"] * 10 + ["Contact priya@example.org"] * 5 + ["fine"] * 85,
        })
        res = llm.run_llm_privacy({"reference": df}, cfg())
        blob = repr([(r.summary, r.detail) for r in res])
        self.assertNotIn("ravi@example.org", blob)
        self.assertNotIn("priya@example.org", blob)
        out = next(r for r in res if r.subject == "reference:output")
        self.assertEqual(out.detail["rows_with_pii"], 15)
        self.assertEqual(out.detail["surfaced_rows"], 5)  # priya was never in the prompt or source
        prompt = next(r for r in res if r.subject == "reference:prompt")
        self.assertEqual(prompt.detail["rows_with_pii"], 20)

    def test_aadhaar_in_text_needs_a_valid_checksum(self):
        valid = "23456789012"
        for d in range(10):
            if privacy.verhoeff_valid(valid + str(d)):
                valid += str(d)
                break
        kinds = {k for k, _ in privacy.find_pii_in_text(f"id {valid}, order 234567890123")}
        self.assertIn("aadhaar", kinds)
        self.assertEqual(sum(1 for k, _ in privacy.find_pii_in_text("order 234567890123") if k == "aadhaar"), 0)


class LlmConfigTests(SimpleTestCase):
    def test_problems_are_listed(self):
        df = frame()
        with self.assertRaises(AuditInputError) as ctx:
            validate_llm_config({"prompt_column": "prompt", "group_columns": ["nope"], "context_column": "ghost"}, df, None)
        text = " ".join(ctx.exception.problems)
        self.assertIn("output_column", text)
        self.assertIn("nope", text)
        self.assertIn("ghost", text)

    def test_yes_no_columns_must_be_binary(self):
        df = frame()
        df["rev"] = np.arange(len(df)) % 5
        with self.assertRaises(AuditInputError):
            validate_llm_config(cfg(human_reviewed_column="rev"), df, None)

    def test_threshold_safety_applies_to_llm_configs(self):
        with self.assertRaises(AuditInputError):
            validate_llm_config(cfg(thresholds={"llm_refusal_gap": float("nan")}), frame(), None)
