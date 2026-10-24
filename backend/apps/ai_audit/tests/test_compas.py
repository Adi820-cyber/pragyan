import json
import urllib.error
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

from apps.ai_audit import models as m
from apps.ai_audit.sample import compas
from apps.ai_audit.services.demo import seed_compas
from apps.ai_audit.tests.base import AuditTestCase


def fake_compas_csv(path: Path, n=900) -> Path:
    """A file with COMPAS's real column layout but generated values. Used only to test the loader offline."""
    rng = np.random.default_rng(0)
    race = rng.choice(["African-American", "Caucasian", "Hispanic", "Asian"], n, p=[0.5, 0.35, 0.12, 0.03])
    priors = rng.poisson(np.where(race == "African-American", 4, 2))
    decile = np.clip(rng.normal(3 + 0.4 * priors, 2), 1, 10).round().astype(int)
    recid = (rng.random(n) < 0.3 + 0.03 * priors).astype(int)
    dates = pd.to_datetime("2013-01-01") + pd.to_timedelta(rng.integers(0, 730, n), unit="D")
    df = pd.DataFrame({
        "id": np.arange(1, n + 1), "name": [f"Person Name {i}" for i in range(n)], "first": "A", "last": "B",
        "compas_screening_date": dates.strftime("%Y-%m-%d"), "sex": rng.choice(["Male", "Female"], n, p=[0.8, 0.2]),
        "dob": "1990-01-01", "age": rng.integers(18, 70, n), "race": race, "juv_fel_count": 0, "juv_misd_count": 0,
        "juv_other_count": 0, "priors_count": priors, "days_b_screening_arrest": 0, "is_recid": recid,
        "c_charge_degree": rng.choice(["F", "M"], n), "c_case_number": "13000001CF10A", "score_text": "Low",
        "decile_score": decile, "two_year_recid": recid,
    })
    # Pad to the size check used for real downloads.
    df["padding"] = "x" * 1200
    df.to_csv(path, index=False)
    return path


class CompasLoaderTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        compas.get_model.cache_clear()
        self.src = fake_compas_csv(Path(self._media) / "fake_compas.csv")

    def tearDown(self):
        compas.get_model.cache_clear()
        super().tearDown()

    def test_clean_drops_direct_identifiers_and_builds_time_split(self):
        path = compas.ensure_file(str(self.src))
        scenario = compas.build_scenario(path)
        for name in ("reference", "current"):
            cols = set(scenario[name].columns)
            self.assertTrue(cols.isdisjoint({"name", "first", "last", "dob", "c_case_number"}), cols & {"name", "dob"})
            self.assertTrue({"race", "sex", "pred_tool", "pred_v1", "pred_v2", "no_two_year_recid"} <= cols)
        self.assertTrue(scenario["reference"]["screening_date"].str.startswith("2013").all())
        self.assertTrue(scenario["current"]["screening_date"].str.startswith("2014").all())
        self.assertTrue(set(scenario["reference"]["pred_tool"].unique()) <= {0, 1})

    def test_tool_prediction_is_the_published_decile_threshold(self):
        df = compas.load_clean(compas.ensure_file(str(self.src)))
        self.assertTrue(((df.decile_score < 5).astype(int) == df.pred_tool).all())

    def test_missing_download_explains_what_to_do(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
            target = compas.cache_path()
            if target.exists():
                target.unlink()
            with self.assertRaises(compas.RealDataUnavailable) as ctx:
                compas.ensure_file()
        self.assertIn("--compas-file", str(ctx.exception))

    def test_seeded_real_data_system_can_be_audited_end_to_end(self):
        system = seed_compas(self.members["owner_a"].tenant, self.members["owner_a"], str(self.src))
        self.assertEqual(system.system_type, "tabular")
        self.assertEqual(set(m.ModelVersion.all_objects.filter(system=system).values_list("version_label", flat=True)), {"tool", "v1", "v2"})
        ref = m.Dataset.all_objects.get(system=system, role="reference")
        cur = m.Dataset.all_objects.get(system=system, role="current")
        self.assertTrue(ref.is_sample)
        self.assertIn("ProPublica", ref.source_note)

        owner = self.client_for("owner_a")
        for label in ("tool", "v1"):
            mv = m.ModelVersion.all_objects.get(system=system, version_label=label)
            config = {**ref.sample_config["by_version"][label], "bootstrap": 50}
            run = owner.post("/api/v1/ai/runs/", {"system": str(system.id), "model_version": str(mv.id), "reference_dataset": str(ref.id),
                                                  "current_dataset": str(cur.id), "config": config}, format="json")
            self.assertEqual(run.status_code, 201, run.content)
            self.run_worker()
            run_id = run.json()["id"]
            body = owner.get(f"/api/v1/ai/runs/{run_id}/").json()
            self.assertEqual(body["status"], "completed", body.get("error"))
            bias = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=bias").json()
            groups = {r["subject"] for r in bias if r["check_key"] == "group_selection_rate"}
            self.assertIn("race=African-American", groups)
            self.assertIn("sex=Female", groups)
            expl = owner.get(f"/api/v1/ai/runs/{run_id}/results/?category=explainability").json()
            if label == "tool":
                # The deployed tool has no model we can open: explanations are reported as not assessed.
                self.assertEqual([r["state"] for r in expl], ["not_applicable"])
            else:
                self.assertEqual(next(r for r in expl if r["check_key"] == "additivity")["state"], "no_alert")
            # Direct identifiers never reach any stored result.
            self.assertNotIn("Person Name", json.dumps(bias))
