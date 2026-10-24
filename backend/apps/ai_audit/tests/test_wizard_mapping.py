import pandas as pd
from django.test import SimpleTestCase

from apps.ai_audit.services.demo import _compas_config
from apps.ai_audit.services.validation import AuditInputError, validate_run_config


def frame():
    return pd.DataFrame({
        "case_id": range(100), "pred": [0, 1] * 50, "actual": [1, 0] * 50, "sex": ["F", "M"] * 50,
    })


def problems_for(cfg):
    with SimpleTestCase().assertRaises(AuditInputError) as ctx:
        validate_run_config(cfg, frame(), None)
    return " ".join(ctx.exception.problems)


class WizardMappingTests(SimpleTestCase):
    def test_compas_sample_config_is_valid_for_every_version(self):
        for pred in ("pred_tool", "pred_v1", "pred_v2"):
            cfg = _compas_config(pred, ["age"])
            self.assertEqual(cfg["prediction_column"], pred)
            self.assertEqual(cfg["label_column"], "no_two_year_recid")
            self.assertEqual(cfg["group_columns"], ["race", "sex"])
            self.assertIn("case_id", cfg["id_columns"])
            self.assertIn("screening_date", cfg["id_columns"])
            self.assertFalse(set(cfg["group_columns"]) & set(cfg["id_columns"]))

    def test_id_column_as_prediction_gives_readable_error(self):
        text = problems_for({"prediction_column": "case_id", "favourable_label": "1", "group_columns": []})
        self.assertIn("not a yes/no column", text)
        self.assertNotIn("config:", text)

    def test_prediction_and_label_must_differ(self):
        self.assertIn("must be different", problems_for({"prediction_column": "pred", "label_column": "pred", "favourable_label": "1"}))

    def test_group_and_id_overlap_rejected(self):
        text = problems_for({"prediction_column": "pred", "favourable_label": "1", "group_columns": ["sex"], "id_columns": ["sex"]})
        self.assertIn("both as a group", text)
