"""Personal-data indicators in datasets.

Detectors are heuristics. They flag *candidates* for human review: they can miss
data and can produce false positives. Matched values are always masked; raw
values never reach logs, results or reports.
"""
import re
from datetime import date, timedelta
from typing import Optional

import pandas as pd

from apps.ai_audit.services.common import (
    INSUFFICIENT,
    NO_ALERT,
    NOT_APPLICABLE,
    REVIEW,
    Result,
    merged_thresholds,
)

CATEGORY = "privacy"
MAX_SCAN_ROWS = 20000

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
PHONE_IN_RE = re.compile(r"^(?:\+91[\-\s]?|91[\-\s]?|0)?[6-9]\d{9}$")
PHONE_E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
IPV4_RE = re.compile(r"^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
AADHAAR_RE = re.compile(r"^[2-9]\d{3}\s?\d{4}\s?\d{4}$")

# Column-name hints produce "likely" findings that need confirmation.
NAME_HINTS = {
    "email": re.compile(r"e[-_ ]?mail", re.I),
    "phone": re.compile(r"phone|mobile|contact[-_ ]?no|msisdn", re.I),
    "aadhaar": re.compile(r"aadhaar|aadhar|uidai", re.I),
    "pan": re.compile(r"\bpan\b|pan[-_ ]?(no|number|card)", re.I),
    "name": re.compile(r"(^|[-_ ])(full[-_ ]?name|first[-_ ]?name|last[-_ ]?name|surname|name)$", re.I),
    "date_of_birth": re.compile(r"dob|date[-_ ]?of[-_ ]?birth|birth[-_ ]?date", re.I),
    "address": re.compile(r"address|street|pincode|postal|zip", re.I),
    "ip_address": re.compile(r"(^|[-_ ])ip([-_ ]?addr(ess)?)?$", re.I),
}

LABELS = {
    "email": "email address",
    "phone": "phone number",
    "aadhaar": "Aadhaar number",
    "pan": "PAN",
    "name": "person name",
    "date_of_birth": "date of birth",
    "address": "address or location detail",
    "ip_address": "IP address",
}

# ---- Verhoeff checksum (Aadhaar) -------------------------------------------
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_valid(number: str) -> bool:
    if not number.isdigit():
        return False
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def is_aadhaar(value: str) -> bool:
    if not AADHAAR_RE.match(value):
        return False
    return verhoeff_valid(re.sub(r"\s", "", value))


# ---- masking ------------------------------------------------------------------
def mask_value(kind: str, value: str) -> str:
    v = str(value)
    if kind == "email" and "@" in v:
        local, domain = v.split("@", 1)
        d0 = domain.split(".")[0]
        return f"{local[:1]}***@{d0[:1]}***.{domain.split('.')[-1]}"
    if len(v) <= 4:
        return "*" * len(v)
    return f"{v[:2]}{'*' * (len(v) - 4)}{v[-2:]}" if kind in ("phone", "aadhaar", "pan") else f"{v[:1]}{'*' * (len(v) - 1)}"


DETECTORS = {
    "email": lambda v: bool(EMAIL_RE.match(v)),
    "phone": lambda v: bool(PHONE_IN_RE.match(v.replace(" ", ""))) or bool(PHONE_E164_RE.match(v.replace(" ", ""))),
    "aadhaar": is_aadhaar,
    "pan": lambda v: bool(PAN_RE.match(v)),
    "ip_address": lambda v: bool(IPV4_RE.match(v)),
}


def scan_dataframe(df: pd.DataFrame, match_share_threshold: float = 0.5, seed: int = 42) -> list[dict]:
    """Return one finding per (column, kind). Raw values are not included."""
    sample = df if len(df) <= MAX_SCAN_ROWS else df.sample(MAX_SCAN_ROWS, random_state=seed)
    findings: list[dict] = []
    for col in df.columns:
        series = sample[col].dropna()
        if series.empty:
            continue
        values = series.astype(str).str.strip()
        values = values[values != ""]
        if values.empty:
            continue
        hit_kinds: set[str] = set()
        for kind, detector in DETECTORS.items():
            matches = values[values.map(detector)]
            share = len(matches) / len(values)
            if share >= match_share_threshold:
                hit_kinds.add(kind)
                findings.append(
                    {
                        "column": col, "kind": kind, "label": LABELS[kind], "confidence": "detected",
                        "match_count": int(len(matches)), "match_share": round(float(share), 4),
                        "scanned_values": int(len(values)),
                        "masked_samples": [mask_value(kind, m) for m in matches.head(3)],
                        "basis": "value pattern" + (" with Verhoeff checksum" if kind == "aadhaar" else ""),
                    }
                )
        for kind, pattern in NAME_HINTS.items():
            if kind in hit_kinds:
                continue
            if pattern.search(str(col)):
                findings.append(
                    {
                        "column": col, "kind": kind, "label": LABELS[kind], "confidence": "likely",
                        "match_count": 0, "match_share": 0.0, "scanned_values": int(len(values)),
                        "masked_samples": [], "basis": "column name only; confirm what this column holds",
                    }
                )
                break
    return findings


def run_privacy_checks(
    datasets: dict[str, pd.DataFrame], cfg: dict, prescan: Optional[dict[str, list[dict]]] = None
) -> list[Result]:
    th = merged_thresholds(cfg)
    features = set(cfg.get("feature_columns") or [])
    declared_id = set(cfg.get("id_columns") or [])
    results: list[Result] = []
    seen: set[tuple[str, str]] = set()

    for role, df in datasets.items():
        findings = scan_dataframe(df, th["pii_value_match_share"], int(cfg.get("seed", 42)))
        if not findings:
            results.append(
                Result(
                    CATEGORY, "personal_data_indicators", "pii_columns", NO_ALERT, subject=role, value=0.0, unit="columns",
                    support_n=len(df),
                    summary=f"No personal-data indicators were detected in the {role} dataset. Detectors can miss data; this is not proof none is present.",
                )
            )
        for f in findings:
            key = (f["column"], f["kind"])
            in_features = f["column"] in features
            needed_note = (
                " It is used as a model input; confirm this is necessary and lawful, and consider removing it."
                if in_features else
                " It is not a model input; consider removing it from the data you share for audit."
            )
            if f["column"] in declared_id and not in_features:
                needed_note = " It is declared as an ID column and is excluded from analysis."
            results.append(
                Result(
                    CATEGORY, "personal_data_indicators", "pii_column", REVIEW, subject=f"{role}:{f['column']}",
                    value=float(f["match_count"]), unit="values", support_n=f["scanned_values"],
                    summary=(
                        f"Column '{f['column']}' in the {role} dataset "
                        f"{'matches the pattern for' if f['confidence'] == 'detected' else 'looks like it holds'} "
                        f"{f['label']} ({'confirmed by value pattern' if f['confidence'] == 'detected' else 'inferred from the name; needs confirmation'})."
                        + needed_note
                    ),
                    detail={**f, "dataset_role": role, "used_as_model_input": in_features},
                    is_finding_candidate=key not in seen and not (f["column"] in declared_id and not in_features),
                )
            )
            seen.add(key)

    # Minimisation: personal data used as a model feature.
    flagged_features = sorted({r.detail["column"] for r in results if r.detail.get("used_as_model_input")})
    results.append(
        Result(
            CATEGORY, "minimisation", "pii_in_model_inputs", REVIEW if flagged_features else NO_ALERT, subject="model inputs",
            value=float(len(flagged_features)), unit="columns",
            summary=(
                f"Personal-data indicators found in model inputs: {flagged_features}. Confirm each is necessary for the stated purpose."
                if flagged_features else "No detected personal-data columns are used as model inputs."
            ),
            detail={"columns": flagged_features},
            is_finding_candidate=bool(flagged_features),
        )
    )

    # Retention
    date_col = cfg.get("retention_date_column")
    days = cfg.get("retention_days")
    ref = datasets.get("reference")
    if date_col and days and ref is not None and date_col in ref.columns:
        parsed = pd.to_datetime(ref[date_col], errors="coerce")
        cutoff = pd.Timestamp(date.today() - timedelta(days=int(days)))
        overdue = int((parsed < cutoff).sum())
        results.append(
            Result(
                CATEGORY, "retention", "rows_past_retention", REVIEW if overdue else NO_ALERT, subject=date_col,
                value=float(overdue), unit="rows", support_n=int(parsed.notna().sum()),
                summary=(
                    f"{overdue} rows are older than the declared {int(days)}-day retention period. Confirm deletion or a documented reason to keep them."
                    if overdue else f"No rows are older than the declared {int(days)}-day retention period."
                ),
                is_finding_candidate=bool(overdue),
            )
        )
    else:
        results.append(
            Result(
                CATEGORY, "retention", "rows_past_retention", NOT_APPLICABLE, subject="retention",
                summary="No retention date column or period was declared, so retention was not checked automatically. Cover it in the controls checklist.",
            )
        )
    return results
