"""Group outcome and error-rate checks.

All rates are computed from explicit counts so zero denominators are visible and
become "insufficient evidence" instead of 0. The numbers are validated against
Fairlearn's MetricFrame in the test suite.
"""
import math
from typing import Optional

import numpy as np
import pandas as pd

from apps.ai_audit.services.common import (
    INSUFFICIENT,
    NO_ALERT,
    NOT_APPLICABLE,
    REVIEW,
    Result,
    fmt_pct,
    merged_thresholds,
)
from apps.ai_audit.services.validation import binary_indicator

CATEGORY = "bias"


def wilson_interval(successes: float, n: float, z: float = 1.96) -> tuple[Optional[float], Optional[float]]:
    if n <= 0:
        return None, None
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def group_counts(pred: np.ndarray, y: Optional[np.ndarray], codes: np.ndarray, k: int) -> dict[str, np.ndarray]:
    """Per-group counts. `y` may be None (no outcome labels). Arrays are length k."""
    n = np.bincount(codes, minlength=k).astype(float)
    sel = np.bincount(codes, weights=pred, minlength=k)
    out = {"n": n, "selected": sel}
    if y is not None:
        pos = np.bincount(codes, weights=y, minlength=k)
        neg = n - pos
        tp = np.bincount(codes, weights=pred * y, minlength=k)
        fp = np.bincount(codes, weights=pred * (1 - y), minlength=k)
        correct = np.bincount(codes, weights=(pred == y).astype(float), minlength=k)
        out.update({"pos": pos, "neg": neg, "tp": tp, "fp": fp, "correct": correct})
    return out


def _safe_div(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    out = np.full(a.shape, np.nan)
    np.divide(a, b, out=out, where=b > 0)
    return out


def aggregates(counts: dict, eligible: np.ndarray, min_support: int, with_labels: bool) -> dict:
    """Gap statistics over the fixed eligible group set."""
    sel_rate = _safe_div(counts["selected"], counts["n"])
    vals = sel_rate[eligible]
    vals = vals[~np.isnan(vals)]
    res: dict = {"dpd": np.nan, "ratio": np.nan, "tpr_gap": np.nan, "fpr_gap": np.nan, "eod": np.nan}
    if len(vals) >= 2:
        res["dpd"] = float(vals.max() - vals.min())
        res["ratio"] = float(vals.min() / vals.max()) if vals.max() > 0 else np.nan
    if with_labels:
        tpr = _safe_div(counts["tp"], counts["pos"])
        fpr = _safe_div(counts["fp"], counts["neg"])
        tpr_ok = eligible & (counts["pos"] >= min_support) & ~np.isnan(tpr)
        fpr_ok = eligible & (counts["neg"] >= min_support) & ~np.isnan(fpr)
        if tpr_ok.sum() >= 2:
            res["tpr_gap"] = float(tpr[tpr_ok].max() - tpr[tpr_ok].min())
        if fpr_ok.sum() >= 2:
            res["fpr_gap"] = float(fpr[fpr_ok].max() - fpr[fpr_ok].min())
        gaps = [g for g in (res["tpr_gap"], res["fpr_gap"]) if not np.isnan(g)]
        if len(gaps) == 2:
            res["eod"] = max(gaps)
    return res


def bootstrap_ci(pred, y, codes, k, eligible, min_support, with_labels, n_boot, seed) -> dict[str, tuple]:
    if n_boot <= 0:
        return {}
    rng = np.random.default_rng(seed)
    n = len(pred)
    samples: dict[str, list] = {"dpd": [], "ratio": [], "eod": []}
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        c = group_counts(pred[idx], None if y is None else y[idx], codes[idx], k)
        a = aggregates(c, eligible, min_support, with_labels)
        for key in samples:
            if not np.isnan(a[key]):
                samples[key].append(a[key])
    out = {}
    for key, values in samples.items():
        if len(values) >= max(20, n_boot // 2):
            lo, hi = np.percentile(values, [2.5, 97.5])
            out[key] = (float(lo), float(hi))
    return out


def run_bias_checks(ref: pd.DataFrame, cfg: dict) -> list[Result]:
    groups = cfg.get("group_columns") or []
    if not groups:
        return [
            Result(
                CATEGORY, "group_fairness", "group_checks", NOT_APPLICABLE,
                summary="No group column was declared, so group-fairness checks were not run. Sensitive attributes are never inferred.",
            )
        ]

    th = merged_thresholds(cfg)
    min_n = int(cfg["min_group_size"])
    fav = cfg["favourable_label"]
    pred_all = binary_indicator(ref[cfg["prediction_column"]], fav)
    label_col = cfg.get("label_column")
    y_all = binary_indicator(ref[label_col], fav) if label_col else None
    results: list[Result] = []

    for gcol in groups:
        g_series = ref[gcol]
        keep = pred_all.notna() & g_series.notna()
        missing_group = int((~g_series.notna()).sum())
        sub = ref[keep]
        pred = pred_all[keep].to_numpy(dtype=float)
        categories = sorted(sub[gcol].map(str).unique())
        code_map = {c: i for i, c in enumerate(categories)}
        codes = sub[gcol].map(str).map(code_map).to_numpy(dtype=int)
        k = len(categories)

        has_labels = y_all is not None
        if has_labels:
            y_sub = y_all[keep]
            label_ok = y_sub.notna().to_numpy()
            # Error-rate metrics use only rows with a known outcome.
            y_arr = y_sub.fillna(0).to_numpy(dtype=float)
        counts_sel = group_counts(pred, None, codes, k)

        eligible = counts_sel["n"] >= min_n
        n_total = int(len(pred))

        base_detail = {"group_column": gcol, "missing_group_rows": missing_group, "min_group_size": min_n}

        # ---- per-group selection rates -----------------------------------
        for i, cat in enumerate(categories):
            n_g = int(counts_sel["n"][i])
            rate = counts_sel["selected"][i] / n_g if n_g else None
            lo, hi = wilson_interval(counts_sel["selected"][i], n_g)
            small = n_g < min_n
            results.append(
                Result(
                    CATEGORY, "group_selection_rate", "selection_rate",
                    INSUFFICIENT if small else NO_ALERT,
                    subject=f"{gcol}={cat}", value=rate, unit="share", support_n=n_g, ci_low=lo, ci_high=hi,
                    summary=(
                        f"Only {n_g} rows in {gcol}={cat}; below the minimum of {min_n}, so this rate is not reliable."
                        if small else f"{fmt_pct(rate)} of {n_g} rows in {gcol}={cat} received the favourable outcome."
                    ),
                    detail={**base_detail, "selected": int(counts_sel["selected"][i]), "interval": "wilson_95"},
                )
            )

        # ---- error rates by group (needs outcomes) -------------------------
        counts_lab = None
        if has_labels:
            lab_codes = codes[label_ok]
            counts_lab = group_counts(pred[label_ok], y_arr[label_ok], lab_codes, k)
            for i, cat in enumerate(categories):
                for metric, num, den_key in (("true_positive_rate", "tp", "pos"), ("false_positive_rate", "fp", "neg")):
                    den = int(counts_lab[den_key][i])
                    small = den < min_n
                    rate = counts_lab[num][i] / den if den else None
                    lo, hi = wilson_interval(counts_lab[num][i], den)
                    results.append(
                        Result(
                            CATEGORY, f"group_{metric}", metric,
                            INSUFFICIENT if (den == 0 or small) else NO_ALERT,
                            subject=f"{gcol}={cat}", value=rate, unit="share", support_n=den, ci_low=lo, ci_high=hi,
                            summary=(
                                f"Not enough {'positive' if den_key == 'pos' else 'negative'} outcomes in {gcol}={cat} ({den}) to estimate this rate."
                                if (den == 0 or small) else
                                f"{metric.replace('_', ' ').capitalize()} for {gcol}={cat} is {fmt_pct(rate)} (based on {den} rows)."
                            ),
                            detail={**base_detail, "interval": "wilson_95"},
                        )
                    )

        # ---- aggregate gaps -------------------------------------------------
        n_elig = int(eligible.sum())
        agg_src = counts_sel
        if has_labels:
            agg_src = {**counts_sel, **{key: np.zeros(k) for key in ("pos", "neg", "tp", "fp", "correct")}}
            # Recompute the label-based counts on the full group index space.
            lab = group_counts(pred[label_ok], y_arr[label_ok], codes[label_ok], k)
            agg_src.update({key: lab[key] for key in ("pos", "neg", "tp", "fp", "correct")})
        agg = aggregates(agg_src, eligible, min_n, has_labels)
        # Bootstrap intervals cover the selection-rate gap statistics (they need no outcome labels).
        ci = (
            bootstrap_ci(pred, None, codes, k, eligible, min_n, False, int(cfg["bootstrap"]), int(cfg["seed"]))
            if n_elig >= 2 else {}
        )

        sel_rates = counts_sel["selected"] / np.maximum(counts_sel["n"], 1)
        elig_idx = [i for i in range(k) if eligible[i]]
        if n_elig >= 2:
            hi_i = max(elig_idx, key=lambda i: sel_rates[i])
            lo_i = min(elig_idx, key=lambda i: sel_rates[i])
            hi_txt = f"{gcol}={categories[hi_i]}: {fmt_pct(sel_rates[hi_i])}"
            lo_txt = f"{gcol}={categories[lo_i]}: {fmt_pct(sel_rates[lo_i])}"
        else:
            hi_txt = lo_txt = ""

        def insufficient(metric, reason, key):
            results.append(Result(CATEGORY, key, metric, INSUFFICIENT, subject=gcol, support_n=n_total, summary=reason, detail=dict(base_detail)))

        few = f"Fewer than two {gcol} groups have at least {min_n} rows, so group gaps cannot be assessed."

        # Demographic parity difference
        if n_elig < 2:
            insufficient("demographic_parity_difference", few, "demographic_parity")
            insufficient("selection_rate_ratio", few, "selection_rate_ratio")
        else:
            dpd = agg["dpd"]
            thr = th["demographic_parity_difference"]
            state = REVIEW if dpd > thr else NO_ALERT
            lo_ci, hi_ci = ci.get("dpd", (None, None))
            results.append(
                Result(
                    CATEGORY, "demographic_parity", "demographic_parity_difference", state, subject=gcol,
                    value=dpd, unit="share", support_n=n_total, ci_low=lo_ci, ci_high=hi_ci, threshold=thr,
                    summary=(
                        f"Selection rates differ by {dpd * 100:.1f} percentage points across {gcol} groups "
                        f"(highest {hi_txt}; lowest {lo_txt}). Review threshold is {thr * 100:.0f} points."
                        + (" Review the data and decision policy." if state == REVIEW else "")
                    ),
                    detail={**base_detail, "bootstrap": int(cfg["bootstrap"]), "seed": int(cfg["seed"]),
                            "eligible_groups": [categories[i] for i in elig_idx]},
                    is_finding_candidate=state == REVIEW,
                )
            )
            ratio = agg["ratio"]
            if np.isnan(ratio):
                insufficient("selection_rate_ratio", "No group received the favourable outcome, so a ratio cannot be computed.", "selection_rate_ratio")
            else:
                rthr = th["selection_rate_ratio_min"]
                rstate = REVIEW if ratio < rthr else NO_ALERT
                rlo, rhi = ci.get("ratio", (None, None))
                results.append(
                    Result(
                        CATEGORY, "selection_rate_ratio", "selection_rate_ratio", rstate, subject=gcol,
                        value=ratio, unit="ratio", support_n=n_total, ci_low=rlo, ci_high=rhi, threshold=rthr,
                        summary=(
                            f"The lowest selection rate is {ratio:.2f} times the highest across {gcol} groups. "
                            f"Screening threshold is {rthr:.2f}; this is a heuristic, not a legal test."
                        ),
                        detail={**base_detail},
                        is_finding_candidate=rstate == REVIEW,
                    )
                )

        # Equalized odds
        if not has_labels:
            results.append(
                Result(CATEGORY, "equalized_odds", "equalized_odds_difference", NOT_APPLICABLE, subject=gcol,
                       summary="No actual-outcome column was provided, so error-rate gaps cannot be assessed.",
                       detail=dict(base_detail))
            )
        elif np.isnan(agg["eod"]):
            insufficient(
                "equalized_odds_difference",
                f"Fewer than two {gcol} groups have at least {min_n} positive and {min_n} negative outcomes; error-rate gaps cannot be assessed.",
                "equalized_odds",
            )
        else:
            ethr = th["equalized_odds_difference"]
            estate = REVIEW if agg["eod"] > ethr else NO_ALERT
            results.append(
                Result(
                    CATEGORY, "equalized_odds", "equalized_odds_difference", estate, subject=gcol,
                    value=agg["eod"], unit="share", support_n=int(label_ok.sum()), threshold=ethr,
                    summary=(
                        f"The larger of the true-positive-rate gap ({agg['tpr_gap'] * 100:.1f} points) and the "
                        f"false-positive-rate gap ({agg['fpr_gap'] * 100:.1f} points) across {gcol} groups is "
                        f"{agg['eod'] * 100:.1f} points. Review threshold is {ethr * 100:.0f} points."
                    ),
                    detail={**base_detail, "tpr_gap": agg["tpr_gap"], "fpr_gap": agg["fpr_gap"],
                            "rows_without_outcome": int((~label_ok).sum())},
                    is_finding_candidate=estate == REVIEW,
                )
            )

    return results
