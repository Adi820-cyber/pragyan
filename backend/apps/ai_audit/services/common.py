"""Shared types and default policy for audit checks."""
from dataclasses import dataclass, field
from typing import Any, Optional

# Default policy. Every value can be overridden per run; the values used and the
# rationale are stored with the run so a result can be reproduced and defended.
DEFAULT_THRESHOLDS = {
    "demographic_parity_difference": 0.10,
    "selection_rate_ratio_min": 0.80,
    "equalized_odds_difference": 0.10,
    "drift_ks": 0.10,
    "drift_js": 0.10,
    "missingness_change": 0.05,
    "unseen_category_share": 0.01,
    "performance_drop": 0.05,
    "proxy_eta": 0.30,
    "pii_value_match_share": 0.50,
    # LLM systems
    "llm_refusal_gap": 0.05,
    "llm_score_gap_d": 0.20,
    "llm_length_ratio_min": 0.80,
    "llm_min_grounded": 0.70,
    "llm_unsupported_number_rate": 0.05,
    "llm_min_citation_share": 0.80,
    "llm_min_review_share": 0.10,
    "llm_rubber_stamp_override": 0.01,
    "llm_high_override": 0.30,
    # Data rights
    "rights_min_on_time": 0.90,
}
DEFAULT_MIN_GROUP_SIZE = 30
DEFAULT_BOOTSTRAP = 300
DEFAULT_SEED = 42
MAX_EXPLAIN_ROWS = 500
CONTINUOUS_MIN_UNIQUE = 20

THRESHOLD_RATIONALE = (
    "Defaults are screening heuristics chosen for early warning, not legal tests. "
    "A ratio below 0.80 echoes the commonly cited four-fifths rule, which is not a universal fairness standard."
)

NO_ALERT = "no_alert"
REVIEW = "review_required"
INSUFFICIENT = "insufficient_evidence"
NOT_APPLICABLE = "not_applicable"
ERROR = "error"


@dataclass
class Result:
    """One measurement produced by a check, before it is persisted as a CheckResult."""

    category: str
    check_key: str
    metric: str
    state: str
    subject: str = ""
    value: Optional[float] = None
    unit: str = ""
    support_n: Optional[int] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    threshold: Optional[float] = None
    summary: str = ""
    detail: dict[str, Any] = field(default_factory=dict)
    origin: str = "server"
    is_finding_candidate: bool = False


def merged_thresholds(config: dict) -> dict:
    out = dict(DEFAULT_THRESHOLDS)
    for key, value in (config.get("thresholds") or {}).items():
        if key in out:
            number = float(value)
            if number != number or number in (float("inf"), float("-inf")):  # NaN / infinity would disable alerts
                raise ValueError(f"Threshold '{key}' must be a finite number.")
            out[key] = number
    return out


def fmt_pct(x: float) -> str:
    if 0 < x < 0.001:
        return "<0.1%"
    return f"{x * 100:.1f}%"
