"""Checks for LLM / generative systems, computed locally with no model or API calls.

Input is a log of interactions: a prompt, the system's output, and optionally the source
context it was given, a quality score, citations and human-review columns.

Nothing here judges whether an answer is "true". It measures things that can be measured
deterministically and says plainly what each measure does not show:

* refusal, response-length and score gaps between groups of users or topics
* change in prompts and outputs between a reference period and a current period
* lexical groundedness: how much of an output's content is found in its source context, and
  whether it states numbers that appear nowhere in its sources
* citation coverage, and how often a human reviewed and changed the output

Raw prompts and outputs are never copied into results; only counts, shares and row positions.
"""
import re
from typing import Optional

import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, CountVectorizer

from apps.ai_audit.services import drift as drift_service
from apps.ai_audit.services import fairness
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

MAX_ROWS = 50_000
MIN_SAMPLES = 30

REFUSAL_RE = re.compile(
    r"\b(i can(?:'|’)?t|i cannot|i(?:'|’)m sorry|i am sorry|i(?:'|’)m unable|i am unable|unable to (?:help|assist|provide)"
    r"|as an ai|i won(?:'|’)t be able|cannot (?:help|assist)|can(?:'|’)t (?:help|assist))\b",
    re.I,
)
CITATION_RE = re.compile(r"\[\d+\]|\(source[s]?:|\bsource[s]?:|\baccording to\b", re.I)
WORD_RE = re.compile(r"[a-z][a-z\-']{3,}")
NUM_RE = re.compile(r"(?<![\w.])-?\d[\d,]*(?:\.\d+)?%?")


def is_refusal(text: str) -> bool:
    return bool(REFUSAL_RE.search(text[:200]))


def content_tokens(text: str) -> set[str]:
    return {w for w in WORD_RE.findall(text.lower()) if w not in ENGLISH_STOP_WORDS}


CITATION_MARK_RE = re.compile(r"\[\d+\]|^\s*\d+[.)]\s", re.M)


def numbers_in(text: str) -> set[float]:
    """Figures stated in text. Citation markers such as [1] and list numbering are not figures."""
    out: set[float] = set()
    for raw in NUM_RE.findall(CITATION_MARK_RE.sub(" ", text)):
        try:
            out.add(round(float(raw.replace(",", "").rstrip("%")), 4))
        except ValueError:
            continue
    return out


def derive(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Per-row measurements. Same index as `df`."""
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=int(cfg.get("seed", 42)))
    out_text = df[cfg["output_column"]].fillna("").astype(str)
    prompt_text = df[cfg["prompt_column"]].fillna("").astype(str) if cfg.get("prompt_column") else pd.Series("", index=df.index)
    ctx_col = cfg.get("context_column")
    ctx_text = df[ctx_col].fillna("").astype(str) if ctx_col else None

    result = pd.DataFrame(index=df.index)
    result["response_words"] = out_text.str.split().str.len().astype(float)
    result["prompt_words"] = prompt_text.str.split().str.len().astype(float)

    if cfg.get("refusal_column"):
        result["refused"] = binary_indicator(df[cfg["refusal_column"]], "1").fillna(0.0)
    else:
        result["refused"] = out_text.map(is_refusal).astype(float)

    if cfg.get("citations_column"):
        result["has_citation"] = df[cfg["citations_column"]].fillna("").astype(str).str.strip().ne("").astype(float)
    else:
        result["has_citation"] = out_text.map(lambda t: bool(CITATION_RE.search(t))).astype(float)

    grounded, unsupported, has_numbers = [], [], []
    for idx in df.index:
        out = out_text.at[idx]
        out_tokens = content_tokens(out)
        out_numbers = numbers_in(out)
        has_numbers.append(1.0 if out_numbers else 0.0)
        if ctx_text is None:
            grounded.append(np.nan)
            unsupported.append(np.nan)
            continue
        ctx = ctx_text.at[idx]
        grounded.append(len(out_tokens & content_tokens(ctx)) / len(out_tokens) if out_tokens else np.nan)
        allowed = numbers_in(ctx) | numbers_in(prompt_text.at[idx])
        unsupported.append(float(len(out_numbers - allowed)))
    result["grounded"] = grounded
    result["unsupported_numbers"] = unsupported
    result["has_numbers"] = has_numbers
    if cfg.get("score_column"):
        result["score"] = pd.to_numeric(df[cfg["score_column"]], errors="coerce")
    return result


# ----------------------------------------------------------------------------- bias
def _std_gap(values: np.ndarray, codes: np.ndarray, k: int, eligible: np.ndarray) -> float:
    """(max group mean - min group mean) / standard deviation, over eligible groups. NaN if undefined."""
    mask = eligible[codes] & ~np.isnan(values)
    if mask.sum() < 2:
        return float("nan")
    v, c = values[mask], codes[mask]
    n = np.bincount(c, minlength=k).astype(float)
    sums = np.bincount(c, weights=v, minlength=k)
    means = np.divide(sums, n, out=np.full(k, np.nan), where=n > 0)
    ok = eligible & ~np.isnan(means)
    sd = v.std(ddof=1) if len(v) > 1 else 0.0
    if ok.sum() < 2 or sd == 0:
        return float("nan")
    return float((np.nanmax(means[ok]) - np.nanmin(means[ok])) / sd)


def _bootstrap(stat, n: int, n_boot: int, seed: int) -> Optional[tuple[float, float]]:
    if n_boot <= 0:
        return None
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n_boot):
        v = stat(rng.integers(0, n, n))
        if not np.isnan(v):
            vals.append(v)
    if len(vals) < max(20, n_boot // 2):
        return None
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return float(lo), float(hi)


def run_llm_bias(df: pd.DataFrame, cfg: dict) -> list[Result]:
    groups = cfg.get("group_columns") or []
    if not groups:
        return [Result("bias", "group_fairness", "group_checks", NOT_APPLICABLE,
                       summary="No group column was declared, so gaps between groups of users or topics were not assessed.")]
    th = merged_thresholds(cfg)
    min_n = int(cfg["min_group_size"])
    n_boot, seed = int(cfg["bootstrap"]), int(cfg["seed"])
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=seed)
    derived = derive(df, cfg)
    results: list[Result] = []

    for gcol in groups:
        keep = df[gcol].notna().to_numpy()
        sub = derived[keep]
        cats = sorted(df.loc[keep, gcol].astype(str).unique())
        codes = df.loc[keep, gcol].astype(str).map({c: i for i, c in enumerate(cats)}).to_numpy(dtype=int)
        k = len(cats)
        base = {"group_column": gcol, "min_group_size": min_n, "missing_group_rows": int((~keep).sum())}
        refused = sub["refused"].to_numpy(dtype=float)
        answered = 1.0 - refused
        counts = fairness.group_counts(answered, None, codes, k)
        eligible = counts["n"] >= min_n
        n_elig = int(eligible.sum())

        for i, cat in enumerate(cats):
            n_g = int(counts["n"][i])
            n_ref = n_g - int(counts["selected"][i])
            lo, hi = fairness.wilson_interval(n_ref, n_g)
            small = n_g < min_n
            results.append(Result(
                "bias", "group_refusal_rate", "refusal_rate", INSUFFICIENT if small else NO_ALERT,
                subject=f"{gcol}={cat}", value=n_ref / n_g if n_g else None, unit="share", support_n=n_g, ci_low=lo, ci_high=hi,
                summary=(f"Only {n_g} interactions in {gcol}={cat}; below the minimum of {min_n}."
                         if small else f"{fmt_pct(n_ref / n_g)} of {n_g} interactions in {gcol}={cat} were refused or deflected."),
                detail={**base, "interval": "wilson_95"},
            ))

        if n_elig < 2:
            results.append(Result("bias", "refusal_gap", "refusal_rate_gap", INSUFFICIENT, subject=gcol, support_n=len(sub),
                                  summary=f"Fewer than two {gcol} groups have at least {min_n} interactions, so gaps cannot be assessed.",
                                  detail=base))
            continue

        agg = fairness.aggregates(counts, eligible, min_n, False)
        ci = fairness.bootstrap_ci(answered, None, codes, k, eligible, min_n, False, n_boot, seed).get("dpd", (None, None))
        rates = {cats[i]: 1 - counts["selected"][i] / counts["n"][i] for i in range(k) if eligible[i]}
        hi_c, lo_c = max(rates, key=rates.get), min(rates, key=rates.get)
        thr = th["llm_refusal_gap"]
        state = REVIEW if agg["dpd"] > thr else NO_ALERT
        results.append(Result(
            "bias", "refusal_gap", "refusal_rate_gap", state, subject=gcol, value=agg["dpd"], unit="share", support_n=len(sub),
            ci_low=ci[0], ci_high=ci[1], threshold=thr,
            summary=(f"The system refuses or deflects {agg['dpd'] * 100:.1f} percentage points more for {gcol}={hi_c} "
                     f"({fmt_pct(rates[hi_c])}) than for {gcol}={lo_c} ({fmt_pct(rates[lo_c])}). Review threshold is {thr * 100:.0f} points."
                     + (" Check whether the difference reflects the topics asked or unequal treatment." if state == REVIEW else "")),
            detail={**base, "highest": hi_c, "lowest": lo_c}, is_finding_candidate=state == REVIEW,
        ))

        # Service quality proxy: how long the answers are.
        words = sub["response_words"].to_numpy(dtype=float)
        medians = {cats[i]: float(np.nanmedian(words[codes == i])) for i in range(k) if eligible[i] and (codes == i).any()}
        if len(medians) >= 2 and max(medians.values()) > 0:
            ratio = min(medians.values()) / max(medians.values())
            lo_g, hi_g = min(medians, key=medians.get), max(medians, key=medians.get)
            rstate = REVIEW if ratio < th["llm_length_ratio_min"] else NO_ALERT
            results.append(Result(
                "bias", "response_length_gap", "response_length_ratio", rstate, subject=gcol, value=ratio, unit="ratio",
                support_n=len(sub), threshold=th["llm_length_ratio_min"],
                summary=(f"Median answers for {gcol}={lo_g} are {ratio:.2f} times as long as for {gcol}={hi_g} "
                         f"({medians[lo_g]:.0f} vs {medians[hi_g]:.0f} words). Shorter answers can mean less help; length alone does not show quality."),
                detail={**base, "medians": medians}, is_finding_candidate=rstate == REVIEW,
            ))

        # Quality score gap, if the log carries a score.
        if cfg.get("score_column"):
            scores = sub["score"].to_numpy(dtype=float)
            d = _std_gap(scores, codes, k, eligible)
            if np.isnan(d):
                results.append(Result("bias", "score_gap", "score_gap_d", INSUFFICIENT, subject=gcol, support_n=int((~np.isnan(scores)).sum()),
                                      summary=f"Not enough scored interactions per {gcol} group to compare scores.", detail=base))
            else:
                ci_d = _bootstrap(lambda idx: _std_gap(scores[idx], codes[idx], k, eligible), len(scores), min(n_boot, 200), seed)
                sstate = REVIEW if d > th["llm_score_gap_d"] else NO_ALERT
                results.append(Result(
                    "bias", "score_gap", "score_gap_d", sstate, subject=gcol, value=d, unit="sd", support_n=int((~np.isnan(scores)).sum()),
                    ci_low=ci_d[0] if ci_d else None, ci_high=ci_d[1] if ci_d else None, threshold=th["llm_score_gap_d"],
                    summary=(f"Average quality scores differ by {d:.2f} standard deviations across {gcol} groups. "
                             f"Review threshold is {th['llm_score_gap_d']:.2f}. Scores from human or automated judges can carry their own bias."),
                    detail=base, is_finding_candidate=sstate == REVIEW,
                ))
    return results


# ----------------------------------------------------------------------------- drift
def _vocab_distance(ref_text: pd.Series, cur_text: pd.Series, name: str, th: float) -> Result:
    ref_text, cur_text = ref_text.fillna("").astype(str), cur_text.fillna("").astype(str)
    if min(len(ref_text), len(cur_text)) < MIN_SAMPLES:
        return Result("drift", "feature_distribution", "js_distance", INSUFFICIENT, subject=name,
                      support_n=min(len(ref_text), len(cur_text)),
                      summary=f"Fewer than {MIN_SAMPLES} interactions in one period, so change in {name} cannot be assessed.")
    vec = CountVectorizer(stop_words="english", max_features=3000, min_df=2, token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z\-']{2,}\b")
    try:
        vec.fit(pd.concat([ref_text, cur_text]))
    except ValueError:  # empty vocabulary
        return Result("drift", "feature_distribution", "js_distance", INSUFFICIENT, subject=name,
                      summary=f"No usable words found in {name}.")
    terms = vec.get_feature_names_out()
    p = np.asarray(vec.transform(ref_text).sum(axis=0)).ravel().astype(float)
    q = np.asarray(vec.transform(cur_text).sum(axis=0)).ravel().astype(float)
    if p.sum() == 0 or q.sum() == 0:
        return Result("drift", "feature_distribution", "js_distance", INSUFFICIENT, subject=name, summary=f"No usable words found in {name}.")
    p, q = p / p.sum(), q / q.sum()
    dist = float(jensenshannon(p, q, base=2))
    top = np.argsort(-np.abs(q - p))[:8]
    state = REVIEW if dist > th else NO_ALERT
    return Result(
        "drift", "feature_distribution", "js_distance", state, subject=name, value=dist, unit="js",
        support_n=min(len(ref_text), len(cur_text)), threshold=th,
        summary=(f"The vocabulary of {name} changed between periods (Jensen-Shannon distance {dist:.3f}; review threshold {th:.2f}; "
                 f"reference n={len(ref_text)}, current n={len(cur_text)}). Most shifted words: "
                 f"{', '.join(terms[top[:4]])}.") if state == REVIEW else
                (f"The vocabulary of {name} shows no alert-level change (distance {dist:.3f}; threshold {th:.2f}; "
                 f"reference n={len(ref_text)}, current n={len(cur_text)})."),
        detail={"method": "Jensen-Shannon distance on word frequencies", "reference_n": len(ref_text), "current_n": len(cur_text),
                "categories": [{"value": str(terms[i]), "reference": float(p[i]), "current": float(q[i])} for i in top],
                "kind": "text"},
        is_finding_candidate=state == REVIEW,
    )


def run_llm_drift(ref: pd.DataFrame, cur: pd.DataFrame, cfg: dict) -> list[Result]:
    th = merged_thresholds(cfg)
    a, b = derive(ref, cfg), derive(cur, cfg)
    results: list[Result] = []
    for col, label in (("response_words", "response_length_words"), ("prompt_words", "prompt_length_words"),
                       ("refused", "refusal"), ("grounded", "groundedness"), ("score", "quality_score")):
        if col not in a.columns or col not in b.columns:
            continue
        if col == "grounded" and (a[col].notna().sum() < MIN_SAMPLES or b[col].notna().sum() < MIN_SAMPLES):
            continue
        r = drift_service._compare_column(label, a[col], b[col], th, "feature")
        results.append(r)
    results.append(_vocab_distance(ref[cfg["prompt_column"]], cur[cfg["prompt_column"]], "prompt_topics", th["drift_js"])
                   if cfg.get("prompt_column") else
                   Result("drift", "feature_distribution", "js_distance", NOT_APPLICABLE, subject="prompt_topics",
                          summary="No prompt column was mapped, so change in what users ask was not assessed."))
    results.append(_vocab_distance(ref[cfg["output_column"]], cur[cfg["output_column"]], "response_vocabulary", th["drift_js"]))
    ref_rate, cur_rate = float(a["refused"].mean()), float(b["refused"].mean())
    results.append(Result("drift", "prediction_rate", "refusal_rate_change", NO_ALERT, subject="refusal", value=cur_rate - ref_rate,
                          unit="share", support_n=min(len(a), len(b)),
                          summary=f"The refusal rate moved from {fmt_pct(ref_rate)} to {fmt_pct(cur_rate)}.",
                          detail={"reference_rate": ref_rate, "current_rate": cur_rate}))
    results.append(Result("drift", "performance", "accuracy_change", NOT_APPLICABLE, subject="answer quality",
                          summary="Answer correctness is not measurable from logs alone. Use the quality score or a reviewer sample to compare periods."))
    return results


# ------------------------------------------------------------------------ grounding
def run_llm_grounding(df: pd.DataFrame, cfg: dict, label: str = "") -> list[Result]:
    """Groundedness, unsupported figures and citation coverage. `label` names the period (reference / current)."""
    th = merged_thresholds(cfg)
    seed, n_boot = int(cfg["seed"]), int(cfg["bootstrap"])
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=seed)
    d = derive(df, cfg)
    results: list[Result] = []

    if not cfg.get("context_column"):
        results.append(Result(
            "grounding", "groundedness", "mean_groundedness", NOT_APPLICABLE,
            summary="No source or context column was mapped, so outputs cannot be compared with their sources. "
                    "If answers are meant to rest on documents, log the retrieved text with each answer.",
        ))
    else:
        g = d["grounded"].to_numpy(dtype=float)
        g = g[~np.isnan(g)]
        if len(g) < MIN_SAMPLES:
            results.append(Result("grounding", "groundedness", "mean_groundedness", INSUFFICIENT, support_n=len(g),
                                  summary=f"Only {len(g)} outputs could be compared with a source; at least {MIN_SAMPLES} are needed."))
        else:
            mean = float(g.mean())
            ci = _bootstrap(lambda idx: float(g[idx].mean()), len(g), min(n_boot, 300), seed)
            thr = th["llm_min_grounded"]
            state = REVIEW if mean < thr else NO_ALERT
            low_share = float((g < 0.5).mean())
            worst_positions = [int(i) for i in np.argsort(d["grounded"].fillna(2).to_numpy())[:10]]
            results.append(Result(
                "grounding", "groundedness", "mean_groundedness", state, value=mean, unit="share", support_n=len(g),
                ci_low=ci[0] if ci else None, ci_high=ci[1] if ci else None, threshold=thr,
                summary=(f"On average {fmt_pct(mean)} of the content words in an output also appear in its source ({len(g)} outputs). "
                         f"{fmt_pct(low_share)} of outputs have under half their content in the source. "
                         "This is a lexical overlap measure: it flags outputs to read, and does not prove they are true or false."),
                detail={"low_overlap_share": low_share, "lowest_rows": worst_positions,
                        "note": "Row positions only. Look the rows up in your own log; text is not stored here."},
                is_finding_candidate=state == REVIEW,
            ))
            numeric = d[d["has_numbers"] == 1.0]
            if len(numeric) < MIN_SAMPLES:
                results.append(Result("grounding", "unsupported_numbers", "unsupported_number_rate", INSUFFICIENT, support_n=len(numeric),
                                      summary="Too few outputs contain numbers to assess unsupported figures."))
            else:
                bad = int((numeric["unsupported_numbers"] > 0).sum())
                rate = bad / len(numeric)
                lo, hi = fairness.wilson_interval(bad, len(numeric))
                nstate = REVIEW if rate > th["llm_unsupported_number_rate"] else NO_ALERT
                results.append(Result(
                    "grounding", "unsupported_numbers", "unsupported_number_rate", nstate, value=rate, unit="share",
                    support_n=len(numeric), ci_low=lo, ci_high=hi, threshold=th["llm_unsupported_number_rate"],
                    summary=(f"{fmt_pct(rate)} of the {len(numeric)} outputs that state numbers include at least one figure "
                             "that appears in neither the source nor the prompt. Check these against the original documents."),
                    detail={"outputs_with_unsupported_numbers": bad, "outputs_with_numbers": int(len(numeric))},
                    is_finding_candidate=nstate == REVIEW,
                ))

    cited = d["has_citation"].to_numpy(dtype=float)
    share = float(cited.mean()) if len(cited) else 0.0
    lo, hi = fairness.wilson_interval(float(cited.sum()), len(cited))
    if cfg.get("require_citations"):
        cstate = REVIEW if share < th["llm_min_citation_share"] else NO_ALERT
        results.append(Result(
            "grounding", "citations", "citation_share", cstate, value=share, unit="share", support_n=len(cited), ci_low=lo, ci_high=hi,
            threshold=th["llm_min_citation_share"],
            summary=f"{fmt_pct(share)} of outputs cite a source. This system is meant to cite its sources; the policy minimum is {fmt_pct(th['llm_min_citation_share'])}.",
            is_finding_candidate=cstate == REVIEW,
        ))
    else:
        results.append(Result("grounding", "citations", "citation_share", NO_ALERT, value=share, unit="share", support_n=len(cited),
                              ci_low=lo, ci_high=hi,
                              summary=f"{fmt_pct(share)} of outputs contain a citation or source reference. Citations were not required for this system."))
    for r in results:
        r.subject = label or r.subject
        if label:
            r.summary = f"[{label}] {r.summary}"
    return results


# --------------------------------------------------------------------------- privacy
def run_llm_privacy(frames: dict[str, pd.DataFrame], cfg: dict) -> list[Result]:
    """Personal data in prompts, outputs and retrieved context, plus any structured identifier columns."""
    from apps.ai_audit.services import privacy

    text_cols = [c for c in (cfg.get("prompt_column"), cfg.get("output_column"), cfg.get("context_column")) if c]
    results: list[Result] = []
    labels = {cfg.get("prompt_column"): "prompts", cfg.get("output_column"): "outputs", cfg.get("context_column"): "source context"}

    for role, df in frames.items():
        clean = 0
        for col in text_cols:
            refs = [df[c] for c in (cfg.get("prompt_column"), cfg.get("context_column")) if c and c != col] if col == cfg["output_column"] else None
            info = privacy.scan_text_column(df[col], refs, int(cfg.get("seed", 42)))
            if info["rows_with_pii"] == 0:
                clean += 1
                continue
            share = info["rows_with_pii"] / max(info["scanned_rows"], 1)
            what = labels[col]
            kinds = ", ".join(f"{k} in {n}" for k, n in sorted(info["kinds"].items()))
            text = (f"{fmt_pct(share)} of {what} in the {role} data contain personal data ({kinds} rows)."
                    if col != cfg["output_column"] else
                    f"{fmt_pct(share)} of outputs in the {role} data contain personal data ({kinds} rows).")
            if col == cfg["output_column"] and info["surfaced_rows"]:
                text += (f" In {info['surfaced_rows']} of them the data was not in the prompt or source, so the system surfaced it on its own.")
            elif col == cfg.get("prompt_column"):
                text += " These prompts are sent to your model provider; confirm a lawful basis and a vendor contract that covers them."
            results.append(Result(
                "privacy", "personal_data_in_text", "pii_text_rows", REVIEW, subject=f"{role}:{col}", value=share, unit="share",
                support_n=info["scanned_rows"], summary=text, is_finding_candidate=True,
                detail={"column": col, "dataset_role": role, "text_role": what, "kinds": info["kinds"], "rows_with_pii": info["rows_with_pii"],
                        "surfaced_rows": info["surfaced_rows"], "masked_samples": info["masked_samples"], "confidence": "detected",
                        "label": "personal data in free text", "scanned_values": info["scanned_rows"]},
            ))
        if clean == len(text_cols):
            results.append(Result("privacy", "personal_data_in_text", "pii_text_rows", NO_ALERT, subject=role, value=0.0, unit="share",
                                  support_n=len(df),
                                  summary=f"No personal-data patterns were found in the text of the {role} data. Detectors can miss data; this is not proof none is present."))
        structured = df.drop(columns=[c for c in text_cols if c in df.columns])
        if len(structured.columns):
            for r in privacy.run_privacy_checks({role: structured}, cfg):
                if r.check_key not in ("minimisation", "retention"):
                    results.append(r)
    # Retention is checked once on the reference data, if declared.
    results += [r for r in privacy.run_privacy_checks({"reference": frames["reference"]}, cfg) if r.check_key == "retention"]
    return results


# ------------------------------------------------------------------------- oversight
def run_llm_oversight(df: pd.DataFrame, cfg: dict) -> list[Result]:
    th = merged_thresholds(cfg)
    rev_col, ovr_col = cfg.get("human_reviewed_column"), cfg.get("human_override_column")
    if not rev_col:
        return [Result("governance", "human_oversight", "review_coverage", NOT_APPLICABLE, subject="human review",
                       summary="No human-review column was mapped, so how often a person checks outputs was not measured. "
                               "Record whether each output was reviewed.")]
    reviewed = binary_indicator(df[rev_col], "1").fillna(0.0).to_numpy()
    n = len(reviewed)
    n_rev = int(reviewed.sum())
    lo, hi = fairness.wilson_interval(n_rev, n)
    state = REVIEW if n_rev / n < th["llm_min_review_share"] else NO_ALERT
    results = [Result(
        "governance", "human_oversight", "review_coverage", state, subject="human review", value=n_rev / n, unit="share", support_n=n,
        ci_low=lo, ci_high=hi, threshold=th["llm_min_review_share"],
        summary=(f"A person reviewed {fmt_pct(n_rev / n)} of {n} outputs. The policy minimum is {fmt_pct(th['llm_min_review_share'])}. "
                 "Confirm the level of review fits the risk of the decisions these outputs inform."),
        is_finding_candidate=state == REVIEW,
    )]
    if ovr_col:
        override = binary_indicator(df[ovr_col], "1").fillna(0.0).to_numpy()
        changed = int(override[reviewed == 1].sum())
        if n_rev < MIN_SAMPLES:
            results.append(Result("governance", "human_oversight", "override_rate", INSUFFICIENT, subject="human review", support_n=n_rev,
                                  summary=f"Only {n_rev} reviewed outputs; at least {MIN_SAMPLES} are needed to assess how often reviewers change them."))
        else:
            rate = changed / n_rev
            lo, hi = fairness.wilson_interval(changed, n_rev)
            rubber = n_rev >= 100 and rate < th["llm_rubber_stamp_override"]
            high = rate > th["llm_high_override"]
            ostate = REVIEW if (rubber or high) else NO_ALERT
            if rubber:
                text = (f"Reviewers changed {fmt_pct(rate)} of {n_rev} reviewed outputs. Almost no changes can mean review is a formality. "
                        "Check that reviewers can and do reject outputs.")
            elif high:
                text = (f"Reviewers changed {fmt_pct(rate)} of {n_rev} reviewed outputs. Frequent corrections point to a quality problem in the system.")
            else:
                text = f"Reviewers changed {fmt_pct(rate)} of {n_rev} reviewed outputs."
            results.append(Result("governance", "human_oversight", "override_rate", ostate, subject="human review", value=rate, unit="share",
                                  support_n=n_rev, ci_low=lo, ci_high=hi, summary=text, is_finding_candidate=ostate == REVIEW))
    return results
