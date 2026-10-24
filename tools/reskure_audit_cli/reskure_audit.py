#!/usr/bin/env python3
"""Reskure local audit tool.

Runs SHAP explanations for YOUR scikit-learn tree model inside YOUR environment
and writes a result bundle (JSON). Your model file never leaves your machine;
only the bundle is uploaded.

    python reskure_audit.py explain --model model.joblib --data features.csv \
        --out bundle.json [--features a,b,c] [--max-rows 500]
    python reskure_audit.py upload  --bundle bundle.json --server http://localhost:8000 \
        --token <API token> --tenant <tenant id> --model-version <model version id>

Security note: loading a joblib/pickle file runs code. Only load model files you
created or fully trust. The Reskure server never loads model files.

Requires: pandas, numpy, scikit-learn, shap, joblib.
Supported models: scikit-learn tree ensembles (GradientBoosting, RandomForest, DecisionTree, ExtraTrees)
for binary classification.
"""
import argparse
import json
import platform
import sys

SCHEMA_VERSION = 1
TOOL_NAME = "reskure-audit"
TOOL_VERSION = "1.0.0"
TOLERANCE = 1e-5


def explain(args) -> int:
    import joblib
    import numpy as np
    import pandas as pd
    import shap
    import sklearn

    model = joblib.load(args.model)
    df = pd.read_csv(args.data)
    if args.features:
        features = [f.strip() for f in args.features.split(",") if f.strip()]
    elif hasattr(model, "feature_names_in_"):
        features = list(model.feature_names_in_)
    else:
        print("Could not tell which columns are model inputs. Pass --features a,b,c", file=sys.stderr)
        return 2
    missing = [f for f in features if f not in df.columns]
    if missing:
        print(f"Columns missing from the data file: {missing}", file=sys.stderr)
        return 2

    X = df[features]
    if len(X) > args.max_rows:
        X = X.sample(args.max_rows, random_state=42)
    X = X.reset_index(drop=True)

    explainer = shap.TreeExplainer(model)
    values = explainer.shap_values(X)
    if isinstance(values, list):
        values = values[-1]
    values = np.asarray(values)
    if values.ndim == 3:
        values = values[:, :, -1]
    base = float(np.asarray(explainer.expected_value).reshape(-1)[-1])

    if model.__class__.__name__ == "GradientBoostingClassifier":
        output = np.asarray(model.decision_function(X), dtype=float)
        unit = "log-odds"
    else:
        output = np.asarray(model.predict_proba(X)[:, 1], dtype=float)
        unit = "probability"

    err = float(np.max(np.abs(base + values.sum(axis=1) - output)))
    mean_abs = np.abs(values).mean(axis=0)
    order = np.argsort(-mean_abs)
    ranked = np.argsort(output)
    picks = []
    for q in (0.02, 0.25, 0.5, 0.75, 0.98):
        idx = int(ranked[min(len(ranked) - 1, int(q * (len(ranked) - 1)))])
        if idx not in picks:
            picks.append(idx)

    def plain(v):
        return v.item() if hasattr(v, "item") else v

    bundle = {
        "schema_version": SCHEMA_VERSION,
        "output_unit": unit,
        "n_rows": int(len(X)),
        "base_value": base,
        "additivity_max_error": err,
        "features": features,
        "global_importance": [{"feature": features[j], "mean_abs_shap": float(mean_abs[j])} for j in order],
        "local_explanations": [
            {
                "row_index": int(i),
                "output": float(output[i]),
                "feature_values": {f: plain(X.iloc[i][f]) for f in features},
                "contributions": {f: float(values[i, j]) for j, f in enumerate(features)},
            }
            for i in picks
        ],
        "producer": {
            "tool": TOOL_NAME,
            "version": TOOL_VERSION,
            "python": platform.python_version(),
            "shap": shap.__version__,
            "scikit-learn": sklearn.__version__,
            "model_class": model.__class__.__name__,
        },
    }
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(bundle, handle, indent=2)
    status = "OK" if err <= TOLERANCE else "WARNING: explanations do not add up to the model output"
    print(f"Wrote {args.out}: {len(X)} rows, {len(features)} features, additivity error {err:.2e} ({status})")
    return 0 if err <= TOLERANCE else 1


def upload(args) -> int:
    import urllib.error
    import urllib.request

    with open(args.bundle, encoding="utf-8") as handle:
        payload = json.load(handle)
    body = json.dumps({"model_version": args.model_version, "payload": payload}).encode()
    request = urllib.request.Request(
        args.server.rstrip("/") + "/api/v1/ai/bundles/",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Token {args.token}",
            "X-Tenant-ID": args.tenant,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            print("Uploaded:", response.read().decode())
        return 0
    except urllib.error.HTTPError as exc:
        print(f"Upload failed ({exc.code}): {exc.read().decode()}", file=sys.stderr)
        return 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Reskure local audit tool")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("explain", help="Compute SHAP explanations locally and write a bundle")
    p.add_argument("--model", required=True)
    p.add_argument("--data", required=True)
    p.add_argument("--out", default="bundle.json")
    p.add_argument("--features")
    p.add_argument("--max-rows", type=int, default=500)
    p.set_defaults(func=explain)

    u = sub.add_parser("upload", help="Upload a bundle to a Reskure server")
    u.add_argument("--bundle", required=True)
    u.add_argument("--server", required=True)
    u.add_argument("--token", required=True)
    u.add_argument("--tenant", required=True)
    u.add_argument("--model-version", required=True)
    u.set_defaults(func=upload)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
