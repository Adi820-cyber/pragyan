"""Explainability for supported scikit-learn tree models via SHAP TreeExplainer.

Contributions describe what the model associates with an output; they are not
causal reasons and not a guarantee about how to change an outcome.
"""
from typing import Any, Optional

import numpy as np
import pandas as pd

from apps.ai_audit.services.common import (
    INSUFFICIENT,
    MAX_EXPLAIN_ROWS,
    NO_ALERT,
    NOT_APPLICABLE,
    REVIEW,
    Result,
    merged_thresholds,
)
from apps.ai_audit.services.validation import AuditInputError

CATEGORY = "explainability"
ADDITIVITY_TOLERANCE = 1e-5
BUNDLE_SCHEMA_VERSION = 1
CAUSAL_CAVEAT = "Contributions show what the model associates with this output, not what causes it."


def _positive_class_values(values: Any) -> np.ndarray:
    """SHAP output shape differs across models/versions; return (n_rows, n_features) for the positive class."""
    if isinstance(values, list):
        values = values[-1]
    values = np.asarray(values)
    if values.ndim == 3:
        values = values[:, :, -1]
    return values


def _expected_value(explainer) -> float:
    base = np.asarray(explainer.expected_value)
    return float(base.reshape(-1)[-1])


def explain_tree_model(model: Any, X: pd.DataFrame, seed: int = 42, max_rows: int = MAX_EXPLAIN_ROWS) -> dict:
    """Pure computation shared by the server and tests. Returns plain Python values."""
    import shap  # imported lazily: heavy

    if len(X) > max_rows:
        X = X.sample(max_rows, random_state=seed)
    X = X.reset_index(drop=True)

    explainer = shap.TreeExplainer(model)
    sv = _positive_class_values(explainer.shap_values(X))
    base = _expected_value(explainer)

    if hasattr(model, "decision_function") and model.__class__.__name__ == "GradientBoostingClassifier":
        output = np.asarray(model.decision_function(X), dtype=float)
        unit = "log-odds"
    else:
        output = np.asarray(model.predict_proba(X)[:, 1], dtype=float)
        unit = "probability"

    reconstructed = base + sv.sum(axis=1)
    add_err = float(np.max(np.abs(reconstructed - output)))

    features = list(X.columns)
    mean_abs = np.abs(sv).mean(axis=0)
    order = np.argsort(-mean_abs)
    quantiles = [0.02, 0.25, 0.5, 0.75, 0.98]
    ranked = np.argsort(output)
    picks = []
    for q in quantiles:
        idx = int(ranked[min(len(ranked) - 1, int(q * (len(ranked) - 1)))])
        if idx not in picks:
            picks.append(idx)

    local = [
        {
            "row_index": int(i),
            "output": float(output[i]),
            "base_value": base,
            "feature_values": {f: _plain(X.iloc[i][f]) for f in features},
            "contributions": {f: float(sv[i, j]) for j, f in enumerate(features)},
        }
        for i in picks
    ]
    return {
        "n_rows": int(len(X)),
        "features": features,
        "output_unit": unit,
        "base_value": base,
        "additivity_max_error": add_err,
        "global_importance": [{"feature": features[j], "mean_abs_shap": float(mean_abs[j])} for j in order],
        "local_explanations": local,
        "shap_values": sv,  # kept for in-process group analysis, not persisted
        "X": X,
    }


def _plain(v: Any) -> Any:
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    return v


def eta(values: pd.Series, groups: pd.Series) -> Optional[float]:
    """Correlation ratio (0..1): how much of a numeric feature's variance a grouping explains."""
    ok = values.notna() & groups.notna()
    v = values[ok].astype(float)
    g = groups[ok].astype(str)
    if len(v) < 30 or g.nunique() < 2:
        return None
    total = float(((v - v.mean()) ** 2).sum())
    if total == 0:
        return 0.0
    between = float(sum(len(s) * (s.mean() - v.mean()) ** 2 for _, s in v.groupby(g)))
    return float(np.sqrt(between / total))


MAX_SAFE_STRING = 0  # text values are never stored in explanation examples


def safe_feature_values(values: dict, pii_columns: set[str]) -> dict:
    """Keep only numeric / boolean values of columns not flagged as personal data.

    Examples are stored in results and reports, so raw text and identifiers are withheld.
    """
    from apps.ai_audit.services.privacy import NAME_HINTS

    out: dict = {}
    for name, value in (values or {}).items():
        flagged = name in pii_columns or any(p.search(str(name)) for p in NAME_HINTS.values())
        if flagged:
            out[name] = "(withheld: personal data)"
        elif isinstance(value, bool) or isinstance(value, (int, float)):
            out[name] = value
        else:
            out[name] = "(text withheld)"
    return out


def recompute_additivity(local: list[dict], base_value: float) -> Optional[float]:
    """Largest |base + sum(contributions) - output| over the example rows. None if there are none."""
    errors = []
    for item in local:
        contributions = item.get("contributions") or {}
        base = float(item.get("base_value", base_value))
        errors.append(abs(base + sum(float(v) for v in contributions.values()) - float(item["output"])))
    return max(errors) if errors else None


def _results_from_explanation(exp: dict, cfg: dict, df_for_groups: Optional[pd.DataFrame], origin: str) -> list[Result]:
    from apps.ai_audit.services.privacy import scan_dataframe

    pii_columns: set[str] = set()
    if df_for_groups is not None:
        pii_columns = {f["column"] for f in scan_dataframe(df_for_groups, merged_thresholds(cfg)["pii_value_match_share"])}
    exp = {
        **exp,
        "local_explanations": [
            {**ex, "feature_values": safe_feature_values(ex.get("feature_values", {}), pii_columns)}
            for ex in exp.get("local_explanations", [])
        ],
    }
    th = merged_thresholds(cfg)
    unit = exp["output_unit"]
    results: list[Result] = []
    n = exp["n_rows"]

    add_ok = exp["additivity_max_error"] <= ADDITIVITY_TOLERANCE
    results.append(
        Result(
            CATEGORY, "additivity", "additivity_max_error", NO_ALERT if add_ok else "error",
            subject="shap self-check", value=exp["additivity_max_error"], unit=unit, support_n=n, threshold=ADDITIVITY_TOLERANCE,
            summary=(
                f"Base value plus contributions reproduces the model output within {exp['additivity_max_error']:.2e} ({unit}) on {n} rows."
                if add_ok else
                f"Explanations do not add up to the model output (max error {exp['additivity_max_error']:.2e}). Treat explanations as unreliable."
            ),
            origin=origin,
        )
    )

    group_cols = cfg.get("group_columns") or []
    sv = exp.get("shap_values")
    X = exp.get("X")

    for rank, item in enumerate(exp["global_importance"], start=1):
        feat = item["feature"]
        detail: dict[str, Any] = {"rank": rank, "output_unit": unit, "caveat": CAUSAL_CAVEAT}
        if sv is not None and X is not None and df_for_groups is not None and group_cols:
            gcol = group_cols[0]
            if gcol in df_for_groups.columns and len(df_for_groups) >= len(X):
                # Align by position: the explained rows are a (possibly sampled) copy of df_for_groups features.
                groups = df_for_groups[gcol].reset_index(drop=True)
                if len(groups) == len(X):
                    j = exp["features"].index(feat)
                    by_group = pd.Series(sv[:, j]).groupby(groups.astype(str)).mean()
                    detail["mean_signed_contribution_by_group"] = {gcol: {k: float(v) for k, v in by_group.items()}}
        results.append(
            Result(
                CATEGORY, "global_importance", "mean_abs_shap", NO_ALERT, subject=feat, value=item["mean_abs_shap"], unit=unit,
                support_n=n,
                summary=f"'{feat}' ranks #{rank} in influence on the model output (average absolute contribution {item['mean_abs_shap']:.3f} {unit}).",
                detail=detail, origin=origin,
            )
        )

    # Proxy screen: influential features strongly associated with a declared group.
    if group_cols and df_for_groups is not None:
        top = [i["feature"] for i in exp["global_importance"][:5]]
        proxy_found = False
        for gcol in group_cols:
            if gcol not in df_for_groups.columns:
                continue
            for feat in top:
                if feat not in df_for_groups.columns or not pd.api.types.is_numeric_dtype(df_for_groups[feat]):
                    continue
                e = eta(df_for_groups[feat], df_for_groups[gcol])
                if e is None:
                    continue
                state = REVIEW if e >= th["proxy_eta"] else NO_ALERT
                proxy_found |= state == REVIEW
                if state == REVIEW:
                    results.append(
                        Result(
                            CATEGORY, "proxy_screen", "group_association", REVIEW, subject=f"{feat} ~ {gcol}", value=e,
                            unit="eta", support_n=len(df_for_groups), threshold=th["proxy_eta"],
                            summary=(
                                f"'{feat}' is among the most influential features and is strongly associated with '{gcol}' "
                                f"(correlation ratio {e:.2f}). It may act as a proxy; review whether it is justified."
                            ),
                            detail={"feature": feat, "group_column": gcol, "caveat": "Association, not proof of unfair treatment."},
                            origin=origin, is_finding_candidate=True,
                        )
                    )
        if not proxy_found:
            results.append(
                Result(
                    CATEGORY, "proxy_screen", "group_association", NO_ALERT, subject="top features",
                    summary="None of the five most influential numeric features is strongly associated with a declared group.",
                    origin=origin,
                )
            )

    results.append(
        Result(
            CATEGORY, "local_explanations", "example_decisions", NO_ALERT, subject="examples", value=float(len(exp["local_explanations"])),
            unit="rows", support_n=n,
            summary="Example decisions with per-feature contributions are included. " + CAUSAL_CAVEAT,
            detail={"output_unit": unit, "base_value": exp["base_value"], "examples": exp["local_explanations"]},
            origin=origin,
        )
    )
    return results


def run_explainability_sample(sample_key: str, ref: pd.DataFrame, cfg: dict) -> list[Result]:
    from apps.ai_audit.sample.registry import features_for, known_keys, model_for

    if sample_key not in known_keys():
        return [Result(CATEGORY, "global_importance", "mean_abs_shap", "error", summary=f"Unknown built-in model '{sample_key}'.")]
    features = features_for(sample_key)
    missing = [f for f in features if f not in ref.columns]
    if missing:
        return [Result(CATEGORY, "global_importance", "mean_abs_shap", "error",
                       summary=f"The reference dataset is missing model inputs: {missing}.")]
    model = model_for(sample_key)
    # Keep group values aligned with the explained rows by sampling the full frame once.
    frame = ref if len(ref) <= MAX_EXPLAIN_ROWS else ref.sample(MAX_EXPLAIN_ROWS, random_state=int(cfg.get("seed", 42)))
    frame = frame.reset_index(drop=True)
    exp = explain_tree_model(model, frame[features], seed=int(cfg.get("seed", 42)))
    return _results_from_explanation(exp, cfg, frame, "server")


def validate_bundle(payload: Any) -> dict:
    """Strict schema check of an externally produced bundle. Bundles are untrusted input."""
    problems: list[str] = []
    if not isinstance(payload, dict):
        raise AuditInputError("The bundle must be a JSON object.")
    if payload.get("schema_version") != BUNDLE_SCHEMA_VERSION:
        problems.append(f"schema_version must be {BUNDLE_SCHEMA_VERSION}.")
    if payload.get("output_unit") not in ("log-odds", "probability"):
        problems.append("output_unit must be 'log-odds' or 'probability'.")
    for key in ("n_rows",):
        if not isinstance(payload.get(key), int) or payload[key] < 1:
            problems.append(f"{key} must be a positive integer.")
    for key in ("base_value", "additivity_max_error"):
        v = payload.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not np.isfinite(v):
            problems.append(f"{key} must be a finite number.")
    features = payload.get("features")
    if not isinstance(features, list) or not features or not all(isinstance(f, str) for f in features):
        problems.append("features must be a non-empty list of strings.")
        features = []
    if len(features) > 500:
        problems.append("features may not exceed 500 entries.")
    gi = payload.get("global_importance")
    if not isinstance(gi, list) or not gi:
        problems.append("global_importance must be a non-empty list.")
    else:
        for item in gi:
            if not (isinstance(item, dict) and item.get("feature") in features
                    and isinstance(item.get("mean_abs_shap"), (int, float)) and np.isfinite(item["mean_abs_shap"])):
                problems.append("global_importance entries need a known 'feature' and a finite 'mean_abs_shap'.")
                break
    local = payload.get("local_explanations", [])
    if not isinstance(local, list) or len(local) > 20:
        problems.append("local_explanations must be a list of at most 20 entries.")
    else:
        for item in local:
            ok = isinstance(item, dict) and isinstance(item.get("contributions"), dict) \
                and set(item["contributions"]) <= set(features) \
                and all(isinstance(v, (int, float)) and np.isfinite(v) for v in item["contributions"].values()) \
                and isinstance(item.get("output"), (int, float))
            if not ok:
                problems.append("Each local explanation needs numeric 'output' and 'contributions' keyed by known features.")
                break
    producer = payload.get("producer")
    if not isinstance(producer, dict) or not producer.get("tool"):
        problems.append("producer.tool is required so the origin of the results is recorded.")
    if problems:
        raise AuditInputError(problems)
    return payload


def run_explainability_bundle(payload: dict, ref: pd.DataFrame, cfg: dict) -> list[Result]:
    payload = validate_bundle(payload)
    # Never trust the bundle's own claim: recompute the self-check from the numbers it contains.
    claimed = float(payload["additivity_max_error"])
    recomputed = recompute_additivity(payload.get("local_explanations", []), float(payload["base_value"]))
    effective_error = claimed if recomputed is None else max(claimed, recomputed)
    exp = {
        "n_rows": payload["n_rows"],
        "features": payload["features"],
        "output_unit": payload["output_unit"],
        "base_value": float(payload["base_value"]),
        "additivity_max_error": effective_error,
        "global_importance": sorted(payload["global_importance"], key=lambda i: -i["mean_abs_shap"]),
        "local_explanations": payload.get("local_explanations", []),
    }
    results = _results_from_explanation(exp, cfg, ref, "local_bundle")
    for r in results:
        if r.check_key == "additivity":
            r.detail.update({"claimed_error": claimed, "recomputed_on_examples": recomputed,
                             "verified_rows": len(payload.get("local_explanations", []))})
            if recomputed is not None and recomputed > ADDITIVITY_TOLERANCE >= claimed:
                r.summary = (
                    f"The bundle claimed an error of {claimed:.1e}, but its own example rows do not add up "
                    f"(error {recomputed:.1e}). Treat these explanations as unreliable."
                )
            elif r.state == NO_ALERT:
                r.summary += f" Re-checked by the server on {len(payload.get('local_explanations', []))} example rows from the bundle."
    producer = payload["producer"]
    results.append(
        Result(
            CATEGORY, "provenance", "bundle_origin", NO_ALERT, subject="local audit tool",
            summary=(
                f"Explanations were computed in the organisation's own environment by {producer.get('tool')} "
                f"{producer.get('version', '')}. The server did not recompute them."
            ).replace("  ", " "),
            detail={"producer": producer}, origin="local_bundle",
        )
    )
    return results


def not_assessed_result(reason: str) -> Result:
    return Result(CATEGORY, "global_importance", "mean_abs_shap", NOT_APPLICABLE, summary=reason)
