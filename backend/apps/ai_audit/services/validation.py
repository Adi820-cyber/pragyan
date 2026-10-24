"""Input validation: CSV loading, schema summaries and run-config checks.

Every rejection carries an actionable message. Nothing here fabricates a pass.
"""
import csv
import io
import math
from typing import Any, Optional

import numpy as np
import pandas as pd

from apps.ai_audit.services.common import CONTINUOUS_MIN_UNIQUE, DEFAULT_MIN_GROUP_SIZE, DEFAULT_THRESHOLDS


class AuditInputError(ValueError):
    """Raised for bad input. `problems` is a list of user-facing messages."""

    def __init__(self, problems):
        if isinstance(problems, str):
            problems = [problems]
        self.problems = list(problems)
        super().__init__("; ".join(self.problems))


def load_csv(data: bytes, max_rows: int, max_bytes: Optional[int] = None) -> pd.DataFrame:
    if max_bytes is not None and len(data) > max_bytes:
        raise AuditInputError(f"File is larger than the {max_bytes // (1024 * 1024)} MB limit.")
    if not data.strip():
        raise AuditInputError("The file is empty.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AuditInputError("The file is not valid UTF-8. Re-export the CSV as UTF-8 and try again.")

    try:
        header = next(csv.reader(io.StringIO(text)))
    except (StopIteration, csv.Error):
        raise AuditInputError("Could not read a header row from the CSV.")
    header = [h.strip() for h in header]
    if any(h == "" for h in header):
        raise AuditInputError("The header row contains an empty column name.")
    duplicates = sorted({h for h in header if header.count(h) > 1})
    if duplicates:
        raise AuditInputError(f"Duplicate column names: {', '.join(duplicates)}. Rename them and re-upload.")

    try:
        df = pd.read_csv(io.StringIO(text), low_memory=False, nrows=max_rows + 1)
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise AuditInputError(f"The CSV could not be parsed: {exc}")
    if len(df) == 0:
        raise AuditInputError("The CSV has a header but no data rows.")
    if len(df) > max_rows:
        raise AuditInputError(f"The file has more than {max_rows:,} rows. Upload a sample or split it.")
    df.columns = [str(c).strip() for c in df.columns]
    return df


def column_kind(series: pd.Series) -> str:
    """'continuous', 'discrete' (numeric with few values) or 'categorical'."""
    if pd.api.types.is_bool_dtype(series):
        return "categorical"
    if pd.api.types.is_numeric_dtype(series):
        return "continuous" if series.nunique(dropna=True) > CONTINUOUS_MIN_UNIQUE else "discrete"
    return "categorical"


def schema_of(df: pd.DataFrame) -> list[dict[str, Any]]:
    out = []
    for name in df.columns:
        s = df[name]
        out.append(
            {
                "name": name,
                "dtype": str(s.dtype),
                "kind": column_kind(s),
                "n_unique": int(s.nunique(dropna=True)),
                "missing_share": round(float(s.isna().mean()), 6),
            }
        )
    return out


def _as_label(value: Any) -> str:
    """Canonical string for comparing labels such as 1, 1.0, True and '1'."""
    if isinstance(value, (bool, np.bool_)):
        return "1" if value else "0"
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        return str(int(value)) if float(value).is_integer() else str(value)
    return str(value).strip()


def binary_indicator(series: pd.Series, favourable_label: str) -> pd.Series:
    """1 where the value equals the favourable label, else 0. Missing values stay NaN."""
    fav = _as_label(favourable_label)
    missing = series.isna().to_numpy()
    out = np.full(len(series), np.nan)
    for i, (value, is_missing) in enumerate(zip(series.to_numpy(dtype=object), missing)):
        if not is_missing:
            out[i] = 1.0 if _as_label(value) == fav else 0.0
    return pd.Series(out, index=series.index)


def _check_ints(cfg: dict, problems: list[str]) -> None:
    for key, default, low, high in (("min_group_size", DEFAULT_MIN_GROUP_SIZE, 1, 1_000_000), ("bootstrap", 300, 0, 2000), ("seed", 42, 0, 2**31 - 1)):
        try:
            cfg[key] = int(cfg.get(key) if cfg.get(key) is not None else default)
        except (TypeError, ValueError):
            problems.append(f"{key} must be a whole number.")
            cfg[key] = default
        if not low <= cfg[key] <= high:
            problems.append(f"{key} must be between {low} and {high}.")


def _check_thresholds(cfg: dict, problems: list[str]) -> None:
    clean_thresholds: dict[str, float] = {}
    for key, value in (cfg.get("thresholds") or {}).items():
        if key not in DEFAULT_THRESHOLDS:
            problems.append(f"Unknown threshold '{key}'. Known thresholds: {sorted(DEFAULT_THRESHOLDS)}.")
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            problems.append(f"Threshold '{key}' must be a number.")
            continue
        # NaN and out-of-range values would silently switch alerts off, so they are rejected.
        if not math.isfinite(number) or not 0 <= number <= 1:
            problems.append(f"Threshold '{key}' must be a finite number between 0 and 1.")
            continue
        clean_thresholds[key] = number
    cfg["thresholds"] = clean_thresholds



def validate_run_config(config: dict, ref: pd.DataFrame, cur: Optional[pd.DataFrame]) -> dict:
    """Return a normalised config or raise AuditInputError listing every problem."""
    problems: list[str] = []
    cfg = dict(config or {})

    def need(col: Optional[str], label: str, df: pd.DataFrame, where: str):
        if col and col not in df.columns:
            problems.append(f"{label} column '{col}' is not in the {where} dataset.")

    pred = cfg.get("prediction_column")
    if not pred:
        problems.append("prediction_column is required.")
    need(pred, "Prediction", ref, "reference")
    if cur is not None:
        need(pred, "Prediction", cur, "current")

    label = cfg.get("label_column") or None
    need(label, "Outcome", ref, "reference")
    if cur is not None and label and label not in cur.columns:
        # Outcome labels are optional on the current dataset (they often arrive late).
        cfg["label_missing_in_current"] = True

    if pred and label and pred == label:
        problems.append("The prediction column and the actual outcome column must be different columns.")

    groups = list(cfg.get("group_columns") or [])
    clash = sorted(set(groups) & set(cfg.get("id_columns") or []))
    if clash:
        problems.append(f"Column(s) {', '.join(clash)} are marked both as a group to compare and as an identifier to exclude. Pick one.")
    for g in groups:
        need(g, "Group", ref, "reference")
    cfg["group_columns"] = groups

    if cfg.get("favourable_label") in (None, ""):
        problems.append("favourable_label is required: say which prediction value is the favourable outcome.")
    cfg["favourable_label"] = _as_label(cfg.get("favourable_label", "1"))

    if pred and pred in ref.columns:
        values = {_as_label(v) for v in ref[pred].dropna().unique()}
        if cfg["favourable_label"] not in values:
            problems.append(
                f"The favourable value '{cfg['favourable_label']}' never appears in the prediction column '{pred}'. "
                f"That column holds: {', '.join(sorted(values)[:6])}{' ...' if len(values) > 6 else ''}. "
                "Pick a column of model decisions and one of its values."
            )

    id_cols = list(cfg.get("id_columns") or [])
    excluded = set(cfg.get("excluded_columns") or []) | set(id_cols)
    special = {c for c in [pred, label] if c}
    features = cfg.get("feature_columns")
    if features:
        for f in features:
            need(f, "Feature", ref, "reference")
            if cur is not None and f not in cur.columns:
                problems.append(f"Feature column '{f}' is missing from the current dataset.")
    else:
        features = [c for c in ref.columns if c not in excluded and c not in special and c not in groups]
        if cur is not None:
            features = [c for c in features if c in cur.columns]
    cfg["feature_columns"] = list(features)
    cfg["id_columns"] = id_cols
    cfg["excluded_columns"] = sorted(excluded)

    _check_ints(cfg, problems)
    _check_thresholds(cfg, problems)

    for col, label_name in ((pred, "Prediction"), (label, "Outcome")):
        for where, frame in (("reference", ref), ("current", cur)):
            if col and frame is not None and col in frame.columns:
                distinct = frame[col].dropna().nunique()
                if distinct > 2:
                    problems.append(
                        f"{label_name} column '{col}' has {distinct} different values in the {where} dataset, so it is not a "
                        "yes/no column (multi-class results, identifiers and scores are not audited). Choose a column with exactly two outcomes."
                    )

    days = cfg.get("retention_days")
    if days not in (None, ""):
        try:
            if int(days) < 1:
                raise ValueError
            cfg["retention_days"] = int(days)
        except (TypeError, ValueError):
            problems.append("retention_days must be a whole number of days, at least 1.")
        if not cfg.get("retention_date_column"):
            problems.append("retention_days needs retention_date_column.")
        else:
            need(cfg["retention_date_column"], "Retention date", ref, "reference")

    if cur is not None and not set(cfg["feature_columns"]) & set(cur.columns):
        problems.append("The reference and current datasets share no feature columns.")

    if problems:
        raise AuditInputError(problems)
    return cfg


def available_checks(cfg: dict, has_current: bool, model_source: str, has_bundle: bool) -> dict[str, dict[str, Any]]:
    """What each category can do with these inputs, for the pre-run preview."""
    bias_ok = bool(cfg.get("group_columns"))
    return {
        "bias": {
            "available": bias_ok,
            "reason": "" if bias_ok else "No group column declared, so group-fairness checks cannot run.",
            "error_rates": bool(cfg.get("label_column")),
        },
        "drift": {
            "available": has_current,
            "reason": "" if has_current else "No current dataset, so there is nothing to compare against the reference.",
        },
        "explainability": {
            "available": model_source == "server_sample" or has_bundle,
            "reason": ""
            if model_source == "server_sample" or has_bundle
            else "No supported model or explanation bundle provided; explanations cannot be computed from predictions alone.",
        },
        "privacy": {"available": True, "reason": ""},
    }


def load_jsonl(data: bytes, max_rows: int, max_bytes: Optional[int] = None) -> pd.DataFrame:
    """One JSON object per line. Nested values are kept as JSON text so every column is flat."""
    import json

    if max_bytes is not None and len(data) > max_bytes:
        raise AuditInputError(f"File is larger than the {max_bytes // (1024 * 1024)} MB limit.")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AuditInputError("The file is not valid UTF-8. Re-export it as UTF-8 and try again.")
    rows = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            raise AuditInputError(f"Line {number} is not valid JSON. Each line must be one JSON object.")
        if not isinstance(record, dict):
            raise AuditInputError(f"Line {number} is not a JSON object.")
        rows.append({k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in record.items()})
        if len(rows) > max_rows:
            raise AuditInputError(f"The file has more than {max_rows:,} rows. Upload a sample or split it.")
    if not rows:
        raise AuditInputError("The file has no records.")
    df = pd.DataFrame(rows)
    df.columns = [str(c).strip() for c in df.columns]
    if df.columns.duplicated().any():
        raise AuditInputError("Duplicate column names after reading the file.")
    return df


def load_table(data: bytes, filename: str, max_rows: int, max_bytes: Optional[int] = None) -> pd.DataFrame:
    if filename.lower().endswith((".jsonl", ".ndjson")):
        return load_jsonl(data, max_rows, max_bytes)
    return load_csv(data, max_rows, max_bytes)


LLM_COLUMN_KEYS = ["prompt_column", "output_column", "context_column", "score_column", "citations_column", "refusal_column",
                   "human_reviewed_column", "human_override_column"]


def validate_llm_config(config: dict, ref: pd.DataFrame, cur: Optional[pd.DataFrame]) -> dict:
    """Normalise a run config for an LLM system or raise AuditInputError listing every problem."""
    problems: list[str] = []
    cfg = dict(config or {})

    if not cfg.get("output_column"):
        problems.append("output_column is required: say which column holds the system's answer.")
    for key in LLM_COLUMN_KEYS:
        col = cfg.get(key) or None
        cfg[key] = col
        if col and col not in ref.columns:
            problems.append(f"{key.replace('_', ' ').capitalize()} '{col}' is not in the reference dataset.")
        elif col and cur is not None and col not in cur.columns and key in ("output_column", "prompt_column"):
            problems.append(f"{key.replace('_', ' ').capitalize()} '{col}' is not in the current dataset.")

    groups = list(cfg.get("group_columns") or [])
    for g in groups:
        if g not in ref.columns:
            problems.append(f"Group column '{g}' is not in the reference dataset.")
    cfg["group_columns"] = groups

    if cfg.get("score_column") and cfg["score_column"] in ref.columns:
        numeric = pd.to_numeric(ref[cfg["score_column"]], errors="coerce")
        if numeric.notna().sum() == 0:
            problems.append(f"Score column '{cfg['score_column']}' has no numeric values.")

    for key in ("human_reviewed_column", "human_override_column"):
        col = cfg.get(key)
        if col and col in ref.columns and ref[col].dropna().nunique() > 2:
            problems.append(f"'{col}' must be a yes/no (two-value) column.")

    cfg["require_citations"] = bool(cfg.get("require_citations", False))
    cfg["id_columns"] = list(cfg.get("id_columns") or [])
    cfg["excluded_columns"] = sorted(set(cfg.get("excluded_columns") or []) | set(cfg["id_columns"]))
    cfg["feature_columns"] = []
    cfg["favourable_label"] = "1"
    _check_ints(cfg, problems)
    _check_thresholds(cfg, problems)

    if problems:
        raise AuditInputError(problems)
    return cfg


def available_llm_checks(cfg: dict, has_current: bool) -> dict[str, dict[str, Any]]:
    has_groups = bool(cfg.get("group_columns"))
    has_context = bool(cfg.get("context_column"))
    return {
        "bias": {"available": has_groups, "reason": "" if has_groups else "No group column declared, so gaps between groups cannot be assessed.",
                 "error_rates": bool(cfg.get("score_column"))},
        "drift": {"available": has_current, "reason": "" if has_current else "No current dataset, so there is nothing to compare against the reference."},
        "grounding": {"available": True, "reason": "" if has_context else
                      "No source or context column mapped: groundedness cannot be measured. Citation coverage is still reported."},
        "privacy": {"available": True, "reason": ""},
        "governance": {"available": True, "reason": ""},
    }