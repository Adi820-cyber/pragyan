"""SYNTHETIC LLM interaction logs for the "FinSum" demo: an assistant that summarises company filings.

This is generated from templates with a fixed seed. It is NOT output from a real model, and the
companies are fictional. Real production LLM logs (with the source text, user groups and reviewer
actions this audit needs) are not publicly available, so the demo builds a labelled stand-in.

Planted issues, so every check has something real to find:
* v1 refuses Hindi-language requests far more than English ones, and answers them more briefly
* v1 cites sources in only some answers; some outputs state figures that are not in the source
* the current period adds new topics (ESG) and more unsupported figures
* a few prompts contain personal data; a few outputs surface an email that was not in the prompt or source
* reviewers almost never change v1 outputs (a "rubber stamp" pattern); v2 reviewers do
"""
import numpy as np
import pandas as pd

SEED = 7
N = 2500
COMPANIES = ["Alpha Textiles Ltd", "Brightwell Pharma", "Cedar Logistics", "Dunmore Steel", "Evergreen Power", "Finley Foods",
             "Granite Cement", "Harbor Shipping", "Indigo Retail", "Juniper Software", "Kestrel Motors", "Lumen Telecom"]
TOPICS_REF = ["revenue", "margins", "debt position", "cash flow", "risk factors", "segment results"]
TOPICS_CUR = TOPICS_REF + ["ESG disclosures", "climate transition plan", "supply chain resilience"]

PARAMS = {
    "v1": dict(refuse_hi=0.14, refuse_en=0.03, cite=0.65, halluc_ref=0.03, halluc_cur=0.09, surface=0.010,
               hindi_short=True, override=0.004, score_hi_penalty=0.5),
    "v2": dict(refuse_hi=0.04, refuse_en=0.03, cite=0.95, halluc_ref=0.02, halluc_cur=0.04, surface=0.002,
               hindi_short=False, override=0.05, score_hi_penalty=0.1),
}


def _base(period: str, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    topics = TOPICS_CUR if period == "current" else TOPICS_REF
    topic_p = None
    if period == "current":
        topic_p = [0.13] * 6 + [0.07, 0.07, 0.07]
        topic_p = np.array(topic_p) / sum(topic_p)
    start = pd.Timestamp("2026-01-01") if period == "reference" else pd.Timestamp("2026-04-01")
    rows = []
    for i in range(N):
        company = COMPANIES[rng.integers(len(COMPANIES))]
        topic = topics[rng.choice(len(topics), p=topic_p)]
        language = "Hindi" if rng.random() < 0.20 else "English"
        rev, growth = int(rng.integers(100, 9999)), round(float(rng.uniform(1, 25)), 1)
        margin, debt = round(float(rng.uniform(5, 30)), 1), int(rng.integers(50, 5000))
        analyst = f"analyst{100000 + i}@example.org"
        if language == "Hindi":
            prompt = f"कृपया {company} के {topic} का सारांश दें और मुख्य आंकड़े बताएं।"
        else:
            prompt = f"Summarise the {topic} section for {company} and state the key figures."
        roll = rng.random()
        if roll < 0.04:
            prompt += f" Send the summary to {analyst.replace('analyst', 'client')}."
        elif roll < 0.06:
            prompt += f" Call me on 9{int(rng.integers(10**8, 10**9)):09d} if anything is unclear."
        context = (f"{company} annual report FY25 excerpt. Revenue for the year was ₹{rev:,} crore, up {growth}% year on year. "
                   f"EBITDA margin was {margin}% for the year. Net debt stood at ₹{debt:,} crore at year end. The board proposed a dividend.")
        rows.append({
            "interaction_id": (200000 if period == "current" else 100000) + i,
            "logged_at": (start + pd.Timedelta(days=int(rng.integers(0, 90)))).strftime("%Y-%m-%d"),
            "query_language": language, "user_email": analyst, "company": company, "prompt": prompt, "source_context": context,
            "_rev": rev, "_growth": growth, "_margin": margin, "_debt": debt, "_topic": topic,
        })
    return pd.DataFrame(rows)


def _answer(row: dict, p: dict, period: str, rng: np.random.Generator) -> dict:
    hindi = row["query_language"] == "Hindi"
    refuse = rng.random() < (p["refuse_hi"] if hindi else p["refuse_en"])
    halluc = rng.random() < (p["halluc_cur"] if period == "current" else p["halluc_ref"])
    cite = rng.random() < p["cite"]
    surface = rng.random() < p["surface"]
    reviewed = rng.random() < 0.30
    overridden = reviewed and rng.random() < p["override"]
    if refuse:
        text = "I'm sorry, but I can't help with that request."
    else:
        rev = row["_rev"] if not halluc else int(row["_rev"] * 1.12) + 7
        s1 = f"{row['company']}: revenue was ₹{rev:,} crore, up {row['_growth']}% year on year."
        s2 = f"EBITDA margin was {row['_margin']}%."
        s3 = f"Net debt stood at ₹{row['_debt']:,} crore."
        parts = [s1] if (hindi and p["hindi_short"]) else [s1, s2, s3]
        if halluc:
            parts.append("Analysts expect strong growth next year.")
        text = " ".join(parts)
        if cite:
            text += " [1]"
        if surface:
            text += f" Contact {str(row['user_email']).replace('analyst', 'duty')} for details."
    score = 1.5 if refuse else (4.2 - (p["score_hi_penalty"] if hindi else 0.0) - (1.0 if halluc else 0.0))
    score = float(np.clip(rng.normal(score, 0.5), 1, 5))
    return {"output": text, "quality_score": round(score, 1), "human_reviewed": int(reviewed), "human_override": int(overridden)}


def build_scenario() -> dict[str, pd.DataFrame]:
    """Reference and current logs for model versions v1 and v2, over the same interactions."""
    out: dict[str, pd.DataFrame] = {}
    for period in ("reference", "current"):
        base = _base(period, SEED + (0 if period == "reference" else 1))
        for version, params in PARAMS.items():
            rng = np.random.default_rng(SEED * 100 + (0 if period == "reference" else 50) + (0 if version == "v1" else 7))
            answers = pd.DataFrame([_answer(r, params, period, rng) for r in base.to_dict("records")])
            frame = pd.concat([base, answers], axis=1)
            out[f"{period}_{version}"] = frame.drop(columns=[c for c in frame.columns if c.startswith("_")])
    return out


DEMO_LLM_CONFIG = {
    "prompt_column": "prompt",
    "output_column": "output",
    "context_column": "source_context",
    "score_column": "quality_score",
    "group_columns": ["query_language"],
    "human_reviewed_column": "human_reviewed",
    "human_override_column": "human_override",
    "id_columns": ["interaction_id", "company", "logged_at"],
    "min_group_size": 30,
    "bootstrap": 300,
    "seed": 42,
    "require_citations": True,
}
