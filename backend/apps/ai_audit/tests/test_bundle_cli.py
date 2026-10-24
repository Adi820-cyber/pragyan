import importlib.util
import json
import tempfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from apps.ai_audit import models as m
from apps.ai_audit.services import explain
from apps.ai_audit.tests.base import AuditTestCase

CLI_PATH = Path(__file__).resolve().parents[4] / "tools" / "reskure_audit_cli" / "reskure_audit.py"


def load_cli():
    spec = importlib.util.spec_from_file_location("reskure_audit", CLI_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LocalBundleTests(AuditTestCase):
    def make_bundle(self):
        rng = np.random.default_rng(0)
        X = pd.DataFrame(rng.normal(size=(300, 3)), columns=["a", "b", "c"])
        y = (X["a"] + rng.normal(0, 0.3, 300) > 0).astype(int)
        model = RandomForestClassifier(n_estimators=15, max_depth=4, random_state=0).fit(X, y)
        tmp = Path(tempfile.mkdtemp())
        joblib.dump(model, tmp / "model.joblib")
        X.assign(pred=model.predict(X), g=rng.choice(["x", "y"], 300)).to_csv(tmp / "data.csv", index=False)
        code = load_cli().main(["explain", "--model", str(tmp / "model.joblib"), "--data", str(tmp / "data.csv"),
                                "--features", "a,b,c", "--out", str(tmp / "bundle.json")])
        self.assertEqual(code, 0)
        return json.loads((tmp / "bundle.json").read_text()), tmp / "data.csv"

    def test_cli_output_passes_server_validation(self):
        bundle, _ = self.make_bundle()
        explain.validate_bundle(bundle)
        self.assertEqual(bundle["global_importance"][0]["feature"], "a")
        self.assertEqual(bundle["producer"]["tool"], "reskure-audit")

    def test_bundle_upload_and_run_marks_origin(self):
        bundle, data_path = self.make_bundle()
        owner = self.client_for("owner_a")
        system = owner.post("/api/v1/ai/systems/", {"name": "Own model", "purpose": "Scoring", "jurisdictions": ["DPDP"], "system_type": "tabular"}, format="json").json()
        mv = owner.post("/api/v1/ai/model-versions/", {"system": system["id"], "version_label": "v1", "source": "local_bundle",
                                                      "favourable_label": "1"}, format="json")
        self.assertEqual(mv.status_code, 201, mv.content)
        mv_id = mv.json()["id"]

        # A run before any bundle exists reports explainability as not assessed, not as a pass.
        with open(data_path, "rb") as handle:
            ds = owner.post("/api/v1/ai/datasets/", {"system": system["id"], "role": "reference", "name": "ref", "file": handle}, format="multipart")
        self.assertEqual(ds.status_code, 201, ds.content)
        run_body = {"system": system["id"], "model_version": mv_id, "reference_dataset": ds.json()["id"],
                    "config": {"prediction_column": "pred", "favourable_label": "1", "group_columns": ["g"],
                               "feature_columns": ["a", "b", "c"], "checks": ["explainability", "bias", "privacy"], "bootstrap": 20}}
        first = owner.post("/api/v1/ai/runs/", run_body, format="json").json()["id"]
        self.run_worker()
        expl = owner.get(f"/api/v1/ai/runs/{first}/results/?category=explainability").json()
        self.assertEqual([r["state"] for r in expl], ["not_applicable"])

        # Invalid bundles are rejected; a valid one is accepted and used.
        bad = owner.post("/api/v1/ai/bundles/", {"model_version": mv_id, "payload": {"schema_version": 9}}, format="json")
        self.assertEqual(bad.status_code, 400)
        good = owner.post("/api/v1/ai/bundles/", {"model_version": mv_id, "payload": bundle}, format="json")
        self.assertEqual(good.status_code, 201, good.content)

        second = owner.post("/api/v1/ai/runs/", run_body, format="json").json()["id"]
        self.run_worker()
        expl = owner.get(f"/api/v1/ai/runs/{second}/results/?category=explainability").json()
        self.assertTrue(expl)
        self.assertTrue(all(r["origin"] == "local_bundle" for r in expl))
        self.assertTrue(any(r["check_key"] == "provenance" for r in expl))
        # A current dataset was not provided, so drift is simply not part of this run.
        self.assertEqual(owner.get(f"/api/v1/ai/runs/{second}/").json()["status"], "completed")

    def test_other_tenant_cannot_upload_a_bundle_for_my_model(self):
        owner = self.client_for("owner_a")
        system = owner.post("/api/v1/ai/systems/", {"name": "S", "purpose": "p", "system_type": "tabular"}, format="json").json()
        mv = owner.post("/api/v1/ai/model-versions/", {"system": system["id"], "version_label": "v1", "source": "local_bundle"}, format="json").json()
        bundle, _ = self.make_bundle()
        other = self.client_for("owner_b")
        self.assertEqual(other.post("/api/v1/ai/bundles/", {"model_version": mv["id"], "payload": bundle}, format="json").status_code, 404)
        self.assertEqual(m.ExplanationBundle.all_objects.count(), 0)
