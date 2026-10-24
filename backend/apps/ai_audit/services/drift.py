"""Reference-versus-current comparison.

Reports data and prediction *change*. It does not claim concept drift or
performance loss unless comparable outcomes are present and measured.
"""
import numpy as np
import pandas as pd
from scipy import stats
from scipy.spatial.distance import jensenshannon

from apps.ai_audit.services.common import (
    INSUFFICIENT,
    NO_ALERT,
    NOT_APPLICABLE,
    REVIEW,
    Result,
    fmt_pct,
    merged_thresholds,
)
from apps.ai_audit.services.validation import binary_indicator, column_kind, schema_of

CATEGORY = "drift"
MIN_SAMPLES = 30
MAX_HISTOGRAM_BINS = 20


def ks_statistic(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    res = stats.ks_2samp(a, b)
    return float(res.statistic), float(res.pvalue)


def js_distance(ref: pd.Series, cur: pd.Series) -> tuple[float, dict, dict]:
    """Jensen-Shannon distance (base 2, so bounded 0..1) on aligned category frequencies."""
    ref_s = ref.dropna().astype(str)
    cur_s = cur.dropna().astype(str)
    cats = sorted(set(ref_s.unique()) | set(cur_s.unique()))
    p = ref_s.value_counts(normalize=True).reindex(cats, fill_value=0.0).to_numpy()
    q = cur_s.value_counts(normalize=True).reindex(cats, fill_value=0.0).to_numpy()
    dist = float(jensenshannon(p, q, base=2))
    return dist, dict(zip(cats, p.tolist())), dict(zip(cats, q.tolist()))


def histogram_pair(ref: np.ndarray, cur: np.ndarray, bins: int = 12) -> dict:
    lo = float(min(ref.min(), cur.min()))
    hi = float(max(ref.max(), cur.max()))
    if lo == hi:
        hi = lo + 1.0
    edges = np.linspace(lo, hi, bins + 1)
    rh, _ = np.histogram(ref, bins=edges)
    ch, _ = np.histogram(cur, bins=edges)
    return {
        "edges": [round(float(e), 6) for e in edges],
        "reference": (rh / max(rh.sum(), 1)).round(6).tolist(),
        "current": (ch / max(ch.sum(), 1)).round(6).tolist(),
    }


def _compare_column(name: str, ref: pd.Series, cur: pd.Series, th: dict, key_prefix: str) -> Result:
    kind = column_kind(ref)
    ref_n, cur_n = int(ref.notna().sum()), int(cur.notna().sum())
    if min(ref_n, cur_n) < MIN_SAMPLES:
        return Result(
            CATEGORY, f"{key_prefix}_distribution", "distribution_distance", INSUFFICIENT, subject=name,
            support_n=min(ref_n, cur_n),
            summary=f"Fewer than {MIN_SAMPLES} non-missing values in one dataset (reference {ref_n}, current {cur_n}); change in '{name}' cannot be assessed.",
            detail={"reference_n": ref_n, "current_n": cur_n},
        )

    if kind == "continuous" and pd.api.types.is_numeric_dtype(cur):
        a = ref.dropna().to_numpy(dtype=float)
        b = cur.dropna().to_numpy(dtype=float)
        stat, p_value = ks_statistic(a, b)
        thr = th["drift_ks"]
        state = REVIEW if stat > thr else NO_ALERT
        return Result(
            CATEGORY, f"{key_prefix}_distribution", "ks_statistic", state, subject=name, value=stat, unit="ks",
            support_n=min(ref_n, cur_n), threshold=thr,
            summary=(
                f"'{name}' differs between reference and current data (KS statistic {stat:.3f}; review threshold {thr:.2f}; "
                f"reference n={ref_n}, current n={cur_n}). Mean moved from {a.mean():.2f} to {b.mean():.2f}."
                if state == REVIEW else
                f"'{name}' shows no alert-level change (KS statistic {stat:.3f}; threshold {thr:.2f}; reference n={ref_n}, current n={cur_n})."
            ),
            detail={
                "method": "two-sample Kolmogorov-Smirnov", "p_value": p_value, "reference_n": ref_n, "current_n": cur_n,
                "reference_mean": float(a.mean()), "current_mean": float(b.mean()),
                "histogram": histogram_pair(a, b), "kind": kind,
            },
            is_finding_candidate=state == REVIEW and key_prefix == "feature",
        )

    dist, p, q = js_distance(ref, cur)
    thr = th["drift_js"]
    state = REVIEW if dist > thr else NO_ALERT
    top = sorted(p.keys(), key=lambda c: -abs(q.get(c, 0) - p.get(c, 0)))[:6]
    return Result(
        CATEGORY, f"{key_prefix}_distribution", "js_distance", state, subject=name, value=dist, unit="js",
        support_n=min(ref_n, cur_n), threshold=thr,
        summary=(
            f"The mix of values in '{name}' changed (Jensen-Shannon distance {dist:.3f}; review threshold {thr:.2f}; "
            f"reference n={ref_n}, current n={cur_n})."
            if state == REVIEW else
            f"'{name}' shows no alert-level change in its value mix (JS distance {dist:.3f}; threshold {thr:.2f}; reference n={ref_n}, current n={cur_n})."
        ),
        detail={
            "method": "Jensen-Shannon distance (base 2)", "reference_n": ref_n, "current_n": cur_n, "kind": kind,
            "categories": [{"value": c, "reference": p.get(c, 0.0), "current": q.get(c, 0.0)} for c in top],
        },
        is_finding_candidate=state == REVIEW and key_prefix == "feature",
    )


def run_drift_checks(ref: pd.DataFrame, cur: pd.DataFrame, cfg: dict) -> list[Result]:
    th = merged_thresholds(cfg)
    results: list[Result] = []

    # 1. Schema ---------------------------------------------------------------
    ref_schema = {c["name"]: c for c in schema_of(ref)}
    cur_schema = {c["name"]: c for c in schema_of(cur)}
    added = sorted(set(cur_schema) - set(ref_schema))
    removed = sorted(set(ref_schema) - set(cur_schema))
    changed = sorted(
        c for c in set(ref_schema) & set(cur_schema)
        if (ref_schema[c]["kind"] == "categorical") != (cur_schema[c]["kind"] == "categorical")
    )
    schema_problem = bool(added or removed or changed)
    results.append(
        Result(
            CATEGORY, "schema", "schema_changes", REVIEW if schema_problem else NO_ALERT, subject="all columns",
            value=float(len(added) + len(removed) + len(changed)), unit="columns", support_n=len(ref_schema),
            summary=(
                f"Column set or type changed: added {added or 'none'}, removed {removed or 'none'}, type changed {changed or 'none'}."
                if schema_problem else "Reference and current datasets have the same columns and types."
            ),
            detail={"added": added, "removed": removed, "type_changed": changed},
            is_finding_candidate=schema_problem,
        )
    )

    features = [f for f in cfg["feature_columns"] if f in ref.columns and f in cur.columns]
    pred_col = cfg["prediction_column"]

    # 2. Missingness + unseen categories -------------------------------------
    for f in features:
        delta = float(cur[f].isna().mean() - ref[f].isna().mean())
        thr = th["missingness_change"]
        if abs(delta) > thr:
            results.append(
                Result(
                    CATEGORY, "missingness", "missing_share_change", REVIEW, subject=f, value=delta, unit="share",
                    support_n=min(len(ref), len(cur)), threshold=thr,
                    summary=f"The share of missing values in '{f}' changed by {delta * 100:+.1f} points.",
                    detail={"reference_missing": float(ref[f].isna().mean()), "current_missing": float(cur[f].isna().mean())},
                    is_finding_candidate=True,
                )
            )
        if column_kind(ref[f]) != "continuous":
            seen = set(ref[f].dropna().astype(str).unique())
            unseen_mask = cur[f].notna() & ~cur[f].astype(str).isin(seen)
            share = float(unseen_mask.mean())
            if share > th["unseen_category_share"]:
                new_vals = sorted(cur.loc[unseen_mask, f].astype(str).unique())[:10]
                results.append(
                    Result(
                        CATEGORY, "unseen_categories", "unseen_category_share", REVIEW, subject=f, value=share, unit="share",
                        support_n=int(unseen_mask.sum()), threshold=th["unseen_category_share"],
                        summary=f"{fmt_pct(share)} of current rows have values of '{f}' not present in the reference data (for example {new_vals[:3]}).",
                        detail={"new_values": new_vals},
                        is_finding_candidate=True,
                    )
                )

    # 3. Feature distributions ---------------------------------------------
    for f in features:
        results.append(_compare_column(f, ref[f], cur[f], th, "feature"))

    # 4. Prediction distribution ---------------------------------------------
    if pred_col in ref.columns and pred_col in cur.columns:
        r = _compare_column(pred_col, ref[pred_col], cur[pred_col], th, "prediction")
        r.is_finding_candidate = r.state == REVIEW
        results.append(r)
        fav = cfg["favourable_label"]
        ref_rate = float(binary_indicator(ref[pred_col], fav).mean())
        cur_rate = float(binary_indicator(cur[pred_col], fav).mean())
        results.append(
            Result(
                CATEGORY, "prediction_rate", "favourable_rate_change", NO_ALERT, subject=pred_col,
                value=cur_rate - ref_rate, unit="share", support_n=min(len(ref), len(cur)),
                summary=f"The favourable-outcome rate moved from {fmt_pct(ref_rate)} to {fmt_pct(cur_rate)}.",
                detail={"reference_rate": ref_rate, "current_rate": cur_rate},
            )
        )

    # 5. Performance, only when outcomes exist in both -------------------------
    label = cfg.get("label_column")
    if label and label in ref.columns and label in cur.columns and cur[label].notna().sum() >= MIN_SAMPLES:
        fav = cfg["favourable_label"]

        def accuracy(df):
            p = binary_indicator(df[pred_col], fav)
            y = binary_indicator(df[label], fav)
            ok = p.notna() & y.notna()
            return float((p[ok] == y[ok]).mean()), int(ok.sum())

        a_ref, n_ref = accuracy(ref)
        a_cur, n_cur = accuracy(cur)
        drop = a_ref - a_cur
        thr = th["performance_drop"]
        state = REVIEW if drop > thr else NO_ALERT
        results.append(
            Result(
                CATEGORY, "performance", "accuracy_change", state, subject=pred_col, value=a_cur - a_ref, unit="share",
                support_n=min(n_ref, n_cur), threshold=-thr,
                summary=(
                    f"Accuracy fell from {fmt_pct(a_ref)} to {fmt_pct(a_cur)} where outcomes are known. Review how the model performs on the new data."
                    if state == REVIEW else
                    f"Accuracy moved from {fmt_pct(a_ref)} to {fmt_pct(a_cur)} where outcomes are known."
                ),
                detail={"reference_accuracy": a_ref, "current_accuracy": a_cur, "reference_n": n_ref, "current_n": n_cur},
                is_finding_candidate=state == REVIEW,
            )
        )
    else:
        results.append(
            Result(
                CATEGORY, "performance", "accuracy_change", NOT_APPLICABLE, subject=pred_col,
                summary="Outcome labels are not available in both datasets, so model performance change was not measured. Input and prediction change above is a warning signal only.",
            )
        )
    return results
