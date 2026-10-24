"""Real-data sample: ProPublica's COMPAS two-year recidivism data (Broward County, Florida, 2013-2014).

The file is downloaded on demand and cached under the private media folder. It is not stored in
this repository, because ProPublica's redistribution terms are not stated alongside the data;
see https://github.com/propublica/compas-analysis for the source and its terms.

What makes it a good audit sample:
* it contains the scores a real, deployed risk tool gave to real defendants ("decile_score"),
* the real outcome two years later,
* race and sex, so group gaps are measurable,
* real screening dates, so reference-vs-current drift is real time (2013 vs 2014), not injected.

Direct identifiers in the source file (names, dates of birth, case numbers) are dropped on load.
"""
import shutil
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from django.conf import settings
from sklearn.ensemble import GradientBoostingClassifier

URL = "https://raw.githubusercontent.com/propublica/compas-analysis/master/compas-scores-two-years.csv"
SOURCE_NOTE = "ProPublica COMPAS two-year recidivism data, Broward County FL 2013-2014 (github.com/propublica/compas-analysis)"
FILENAME = "compas-scores-two-years.csv"
SEED = 42

FEATURES_V1 = ["age", "priors_count", "juv_fel_count", "juv_misd_count", "juv_other_count", "felony", "sex_male"]
FEATURES_V2 = ["age", "juv_fel_count", "juv_misd_count", "juv_other_count", "felony"]
SAMPLE_MODELS = {"compas_v1": FEATURES_V1, "compas_v2": FEATURES_V2}
KEEP = ["case_id", "screening_date", "sex", "race", "age", "priors_count", "juv_fel_count", "juv_misd_count", "juv_other_count",
        "felony", "sex_male", "decile_score"]


class RealDataUnavailable(RuntimeError):
    pass


def cache_path() -> Path:
    return Path(settings.PRIVATE_MEDIA_ROOT) / "sample_cache" / FILENAME


def ensure_file(explicit: Optional[str] = None) -> Path:
    """Return the cached CSV, copying a user-supplied file or downloading it if needed."""
    target = cache_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    if explicit:
        src = Path(explicit)
        if not src.is_file():
            raise RealDataUnavailable(f"File not found: {src}")
        shutil.copyfile(src, target)
        return target
    if target.is_file() and target.stat().st_size > 1_000_000:
        return target
    try:
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RealDataUnavailable(
            f"Could not download the COMPAS data ({exc}). Download {URL} yourself and run the seed command with "
            f"--compas-file <path>, or place the file at {target}."
        )
    if b"compas_screening_date" not in data[:2000] or len(data) < 1_000_000:
        raise RealDataUnavailable(f"The downloaded file from {URL} does not look like the COMPAS data.")
    target.write_bytes(data)
    return target


def load_clean(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    # The standard ProPublica filters for comparable records.
    df = df[(df.days_b_screening_arrest <= 30) & (df.days_b_screening_arrest >= -30) & (df.is_recid != -1)
            & (df.c_charge_degree != "O") & (df.score_text != "N/A")].copy()
    df["case_id"] = df["id"].astype(int)
    df["screening_date"] = pd.to_datetime(df["compas_screening_date"])
    df["sex_male"] = (df["sex"] == "Male").astype(int)
    df["felony"] = (df["c_charge_degree"] == "F").astype(int)
    df["no_two_year_recid"] = 1 - df["two_year_recid"].astype(int)
    df["pred_tool"] = (df["decile_score"] < 5).astype(int)  # 1 = rated low risk = the favourable outcome
    return df


def split(df: pd.DataFrame):
    """Training and held-out reference from 2013; current is 2014. Fixed seed."""
    y13 = df[df["screening_date"].dt.year == 2013].sample(frac=1, random_state=SEED)
    cut = len(y13) // 2
    return y13.iloc[:cut], y13.iloc[cut:], df[df["screening_date"].dt.year == 2014]


@lru_cache(maxsize=2)
def get_model(key: str) -> GradientBoostingClassifier:
    train, _, _ = split(load_clean(ensure_file()))
    model = GradientBoostingClassifier(n_estimators=80, max_depth=3, random_state=SEED)
    model.fit(train[SAMPLE_MODELS[key]], train["no_two_year_recid"])
    return model


def build_scenario(path: Path) -> dict[str, pd.DataFrame]:
    df = load_clean(path)
    _, ref, cur = split(df)
    m1, m2 = get_model("compas_v1"), get_model("compas_v2")
    out = {}
    for name, frame in (("reference", ref), ("current", cur)):
        f = frame.copy()
        f["pred_v1"] = m1.predict(f[FEATURES_V1]).astype(int)
        f["pred_v2"] = m2.predict(f[FEATURES_V2]).astype(int)
        f["screening_date"] = f["screening_date"].dt.strftime("%Y-%m-%d")
        out[name] = f[KEEP + ["pred_tool", "pred_v1", "pred_v2", "no_two_year_recid"]].reset_index(drop=True)
    return out
