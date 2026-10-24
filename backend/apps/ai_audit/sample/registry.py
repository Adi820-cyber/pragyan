"""One place to look up the built-in sample models, whichever scenario they belong to."""
from sklearn.ensemble import GradientBoostingClassifier

from apps.ai_audit.sample import compas, generate


def known_keys() -> list[str]:
    return sorted(set(generate.SAMPLE_MODELS) | set(compas.SAMPLE_MODELS))


def features_for(key: str) -> list[str]:
    if key in generate.SAMPLE_MODELS:
        return list(generate.SAMPLE_MODELS[key])
    if key in compas.SAMPLE_MODELS:
        return list(compas.SAMPLE_MODELS[key])
    raise KeyError(f"Unknown sample model '{key}'.")


def model_for(key: str) -> GradientBoostingClassifier:
    if key in generate.SAMPLE_MODELS:
        return generate.get_model(key)
    if key in compas.SAMPLE_MODELS:
        return compas.get_model(key)
    raise KeyError(f"Unknown sample model '{key}'.")
