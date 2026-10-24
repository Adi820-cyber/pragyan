"""Real-data sample: Kaggle & UCI German Credit Risk Dataset (Prof. Hofmann).

1,000 real banking loan applicants evaluated for credit risk.
Used globally as a standard benchmark for algorithmic fairness and credit risk audits.
Sensitive protected attributes:
- sex (male vs female)
- age_group (under_25 vs 25_and_over)
- foreign_worker (yes vs no)
Target: credit_risk (1 = Good credit risk / approved, 0 = Bad credit risk / rejected)
"""
import io
import shutil
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from django.conf import settings
from sklearn.ensemble import GradientBoostingClassifier

URL = "https://raw.githubusercontent.com/selva86/datasets/master/GermanCredit.csv"
SOURCE_NOTE = "Kaggle & UCI German Credit Risk Dataset (Prof. Hofmann, University of Hamburg)"
FILENAME = "german_credit.csv"
SEED = 42

FEATURES_V1 = ["duration", "amount", "installment_rate", "present_residence", "age", "number_credits", "people_liable", "is_male", "is_foreign_worker"]
FEATURES_V2 = ["duration", "amount", "installment_rate", "present_residence", "number_credits", "people_liable"]
SAMPLE_MODELS = {"german_credit_v1": FEATURES_V1, "german_credit_v2": FEATURES_V2}

KEEP = [
    "applicant_id", "duration", "amount", "installment_rate", "present_residence", "age",
    "number_credits", "people_liable", "sex", "age_group", "foreign_worker",
    "is_male", "is_foreign_worker",
    "status", "credit_history", "purpose", "savings", "employment_duration", "housing", "job"
]


class RealDataUnavailable(RuntimeError):
    pass


def cache_path() -> Path:
    return Path(settings.PRIVATE_MEDIA_ROOT) / "sample_cache" / FILENAME


def ensure_file(explicit: Optional[str] = None) -> Path:
    target = cache_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    if explicit:
        src = Path(explicit)
        if not src.is_file():
            raise RealDataUnavailable(f"File not found: {src}")
        shutil.copyfile(src, target)
        return target
    if target.is_file() and target.stat().st_size > 10_000:
        return target
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RealDataUnavailable(f"Could not download German Credit data ({exc}). Place file at {target}.")
    target.write_bytes(data)
    return target


def load_clean(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["applicant_id"] = [f"APP-{i+1:04d}" for i in range(len(df))]
    df["is_male"] = df["personal_status_sex"].apply(lambda x: 1 if str(x).startswith("male") else 0)
    df["sex"] = df["personal_status_sex"].apply(lambda x: "male" if str(x).startswith("male") else "female")
    df["age_group"] = df["age"].apply(lambda x: "under_25" if x < 25 else "25_and_over")
    df["is_foreign_worker"] = (df["foreign_worker"] == "yes").astype(int)
    return df


def split(df: pd.DataFrame):
    """Split into reference (first 600 records) and current monitoring (remaining 400)."""
    return df.iloc[:600].copy(), df.iloc[600:].copy()


@lru_cache(maxsize=2)
def get_model(key: str) -> GradientBoostingClassifier:
    train, _ = split(load_clean(ensure_file()))
    model = GradientBoostingClassifier(n_estimators=60, max_depth=3, random_state=SEED)
    model.fit(train[SAMPLE_MODELS[key]], train["credit_risk"])
    return model


def build_scenario(path: Path) -> dict[str, pd.DataFrame]:
    df = load_clean(path)
    ref, cur = split(df)
    m1, m2 = get_model("german_credit_v1"), get_model("german_credit_v2")
    out = {}
    for name, frame in (("reference", ref), ("current", cur)):
        f = frame.copy()
        f["pred_v1"] = m1.predict(f[FEATURES_V1]).astype(int)
        f["pred_v2"] = m2.predict(f[FEATURES_V2]).astype(int)
        out[name] = f[KEEP + ["pred_v1", "pred_v2", "credit_risk"]].reset_index(drop=True)
    return out
