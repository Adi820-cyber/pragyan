"""Input validation: CSV loading, schema summaries and run-config checks.

Every rejection carries an actionable message. Nothing here fabricates a pass.
"""
import csv
import io
from typing import Any, Optional

import numpy as np
import pandas as pd

from apps.ai_audit.services.common import CONTINUOUS_MIN_UNIQUE, DEFAULT_MIN_GROUP_SIZE


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

    groups = list(cfg.get("group_columns") or [])
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
                f"favourable_label '{cfg['favourable_label']}' never appears in '{pred}'. Values seen: {sorted(values)[:10]}."
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

    cfg["min_group_size"] = int(cfg.get("min_group_size") or DEFAULT_MIN_GROUP_SIZE)
    if cfg["min_group_size"] < 1:
        problems.append("min_group_size must be at least 1.")
    cfg.setdefault("seed", 42)
    cfg.setdefault("bootstrap", 300)
    if not 0 <= int(cfg["bootstrap"]) <= 2000:
        problems.append("bootstrap must be between 0 and 2000.")

    for key, value in (cfg.get("thresholds") or {}).items():
        try:
            float(value)
        except (TypeError, ValueError):
            problems.append(f"Threshold '{key}' must be a number.")

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
