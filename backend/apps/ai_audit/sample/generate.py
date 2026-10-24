"""Deterministic synthetic "HireLens" hiring-screen scenario.

No real personal data. Everything is generated from a fixed seed so audits are
reproducible.

* Historical labels depend on `city_tier`, and `city_tier` is strongly
  associated with `gender`. Model v1 learns this and shows a selection-rate gap.
* Model v2 drops `city_tier`, evaluated on the same held-out data.
* The "current" dataset comes from a new campus-hiring channel: more
  experience, so incoming data shifts.
* `email` and `phone` columns hold fake values to exercise the PII scan.
"""
from functools import lru_cache

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier

SEED = 42
FEATURES_V1 = ["years_experience", "skill_test_score", "education_level", "city_tier", "referral", "gap_months"]
FEATURES_V2 = [f for f in FEATURES_V1 if f != "city_tier"]
SAMPLE_MODELS = {
    "hirelens_v1": FEATURES_V1,
    "hirelens_v2": FEATURES_V2,
}
N_TRAIN, N_REFERENCE, N_CURRENT = 6000, 3000, 3000


def _fake_contacts(rng: np.random.Generator, n: int, start_id: int):
    ids = np.arange(start_id, start_id + n)
    emails = [f"applicant{i}@example.org" for i in ids]
    first_digit = rng.integers(6, 10, n)
    rest = rng.integers(0, 10**9, n)
    phones = [f"{d}{r:09d}" for d, r in zip(first_digit, rest)]
    return ids, emails, phones


def generate_applicants(n: int, seed: int, start_id: int, campus_channel: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    gender = rng.choice(["F", "M"], size=n, p=[0.45, 0.55])
    is_f = gender == "F"
    tier = np.where(
        is_f,
        rng.choice([1, 2, 3], size=n, p=[0.10, 0.25, 0.65]),
        rng.choice([1, 2, 3], size=n, p=[0.50, 0.35, 0.15]),
    )
    # The campus channel brings in people with more experience and fewer referrals.
    exp_shape, exp_scale = (2.2, 2.4) if not campus_channel else (3.2, 2.4)
    years_experience = np.clip(rng.gamma(exp_shape, exp_scale, n), 0, 25).round(1)
    skill = np.clip(rng.normal(60, 15, n), 0, 100).round(1)
    education = rng.choice([1, 2, 3, 4], size=n, p=[0.15, 0.45, 0.30, 0.10])
    referral = rng.binomial(1, 0.30 if not campus_channel else 0.12, n)
    gap = np.clip(rng.exponential(5, n), 0, 48).round(0)

    # Historical decisions favoured applicants from better-served city tiers.
    logit = (
        -5.0 + 0.045 * skill + 0.18 * years_experience + 0.35 * education + 0.7 * referral
        - 0.03 * gap - 1.3 * (tier - 1) + rng.normal(0, 0.6, n)
    )
    hired = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)

    ids, emails, phones = _fake_contacts(rng, n, start_id)
    return pd.DataFrame(
        {
            "applicant_id": ids,
            "email": emails,
            "phone": phones,
            "gender": gender,
            "years_experience": years_experience,
            "skill_test_score": skill,
            "education_level": education,
            "city_tier": tier,
            "referral": referral,
            "gap_months": gap,
            "hired_actual": hired,
        }
    )


@lru_cache(maxsize=4)
def _training_data() -> pd.DataFrame:
    return generate_applicants(N_TRAIN, seed=SEED, start_id=100000)


@lru_cache(maxsize=4)
def get_model(key: str) -> GradientBoostingClassifier:
    if key not in SAMPLE_MODELS:
        raise KeyError(f"Unknown sample model '{key}'.")
    train = _training_data()
    model = GradientBoostingClassifier(n_estimators=80, max_depth=3, random_state=SEED)
    model.fit(train[SAMPLE_MODELS[key]], train["hired_actual"])
    return model


def with_predictions(df: pd.DataFrame, key: str) -> pd.DataFrame:
    model = get_model(key)
    out = df.copy()
    out["prediction"] = model.predict(df[SAMPLE_MODELS[key]]).astype(int)
    return out


def reference_frame() -> pd.DataFrame:
    return generate_applicants(N_REFERENCE, seed=SEED + 1, start_id=200000)


def current_frame() -> pd.DataFrame:
    return generate_applicants(N_CURRENT, seed=SEED + 2, start_id=300000, campus_channel=True)


def build_scenario() -> dict[str, pd.DataFrame]:
    """Four CSV-ready frames: reference/current predictions for model v1 and v2."""
    ref, cur = reference_frame(), current_frame()
    return {
        "reference_v1": with_predictions(ref, "hirelens_v1"),
        "current_v1": with_predictions(cur, "hirelens_v1"),
        "reference_v2": with_predictions(ref, "hirelens_v2"),
        "current_v2": with_predictions(cur, "hirelens_v2"),
    }
