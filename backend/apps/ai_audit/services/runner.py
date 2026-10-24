"""Orchestrates one AuditRun: load inputs, run the four checks, persist results and findings."""
import platform
import time
import traceback
from collections import defaultdict
from typing import Callable

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.ai_audit.models import AuditRun, CheckResult, ExplanationBundle, Finding, FindingEvent
from apps.ai_audit.services import controls as controls_service
from apps.ai_audit.services import drift, explain, fairness, governance, llm, privacy
from apps.ai_audit.services.report import snapshot_context
from apps.ai_audit.services.common import (
    DEFAULT_THRESHOLDS,
    ERROR,
    NOT_APPLICABLE,
    REVIEW,
    THRESHOLD_RATIONALE,
    Result,
)
from apps.ai_audit.services.validation import AuditInputError, load_csv, validate_llm_config, validate_run_config

TABULAR_CHECKS = ["bias", "drift", "explainability", "privacy", "governance"]
LLM_CHECKS = ["bias", "drift", "grounding", "privacy", "governance"]
ALL_CHECKS = sorted(set(TABULAR_CHECKS) | set(LLM_CHECKS))


class RunCancelled(Exception):
    pass


NEXT_STEPS = {
    ("bias", "demographic_parity"): "Check whether the outcome gap reflects the data or the decision policy. Look at which inputs differ most between groups.",
    ("bias", "selection_rate_ratio"): "Treat this as a screening signal. Confirm with your reviewer whether it matters for this decision.",
    ("bias", "equalized_odds"): "Compare error types by group. Decide which error is costlier for people affected and review the threshold.",
    ("drift", "feature_distribution"): "Find out what changed in the incoming data. Check whether the model still performs on it before relying on its outputs.",
    ("drift", "prediction_distribution"): "Check whether the shift in outputs is expected. If labels arrive later, measure performance on the new data.",
    ("drift", "schema"): "Confirm the data pipeline change was intended and the model inputs still mean the same thing.",
    ("drift", "missingness"): "Find the source of the missing values and decide how the model should treat them.",
    ("drift", "unseen_categories"): "Decide how the model should treat new categories, and whether retraining is needed.",
    ("drift", "performance"): "Review model performance on the new data and decide whether to retrain or adjust the threshold.",
    ("explainability", "proxy_screen"): "Ask whether this feature is justified for the decision. If not, test the model without it on the same held-out data.",
    ("privacy", "personal_data_indicators"): "Confirm what the column holds. Remove it from data shared for audit and from model inputs unless it is necessary and justified.",
    ("privacy", "minimisation"): "Document why each personal field is necessary, or remove it from the model inputs.",
    ("privacy", "retention"): "Delete rows past the retention period or record the reason to keep them.",
    ("privacy", "personal_data_in_text"): "Stop personal data entering prompts where it is not needed, and add output filtering. Confirm the vendor contract covers what is sent.",
    ("bias", "refusal_gap"): "Read a sample of refused requests from each group. Check whether the system treats similar requests differently.",
    ("bias", "response_length_gap"): "Compare answers to equivalent questions across groups. Look for less help being given to one group.",
    ("bias", "score_gap"): "Check how scores are produced. If a judge model or reviewer scored these, test the judge for the same gap.",
    ("grounding", "groundedness"): "Read the lowest-overlap outputs against their sources. Tighten retrieval or instructions so answers stay within the sources.",
    ("grounding", "unsupported_numbers"): "Check each flagged figure against the original document before any report is released.",
    ("grounding", "citations"): "Require the system to cite a source for each claim, and reject outputs that do not.",
    ("governance", "human_oversight"): "Decide what level of human review fits the risk, and make sure reviewers have time and authority to reject outputs.",
    ("governance", "vendor_dependency"): "Fix each gap with the vendor: sign data processing terms, confirm training and retention settings, and record an exit plan.",
    ("governance", "vendor_register"): "List every vendor, cloud service and model provider this system depends on, and what data each receives.",
    ("governance", "vendor_concentration"): "Record a fallback: a second provider, a self-hosted option, or a tested way to export your data and prompts.",
    ("governance", "data_rights"): "Set up the procedure, name an owner, publish the request channel and test it with a sample request.",
}


def library_versions() -> dict:
    import numpy
    import pandas
    import scipy
    import sklearn

    versions = {
        "python": platform.python_version(),
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
        "scipy": scipy.__version__,
        "scikit-learn": sklearn.__version__,
    }
    try:
        import shap

        versions["shap"] = shap.__version__
    except Exception:  # pragma: no cover
        pass
    try:
        import fairlearn

        versions["fairlearn"] = fairlearn.__version__
    except Exception:  # pragma: no cover
        pass
    return versions


def _read_dataset(dataset) -> "pd.DataFrame":  # noqa: F821
    with dataset.file.open("rb") as handle:
        data = handle.read()
    return load_csv(data, max_rows=settings.MAX_DATASET_ROWS, max_bytes=settings.MAX_UPLOAD_BYTES)


def _touch(run_id, progress: int, message: str) -> None:
    AuditRun.all_objects.filter(id=run_id).update(progress=progress, progress_message=message, heartbeat_at=timezone.now())


def _guard(run_id, deadline: float) -> None:
    if AuditRun.all_objects.filter(id=run_id, cancel_requested=True).exists():
        raise RunCancelled()
    if time.monotonic() > deadline:
        raise TimeoutError(f"The run exceeded the {int(settings.AUDIT_RUN_TIMEOUT_SECONDS)} second limit.")


def _safe(category: str, check_key: str, fn: Callable[[], list[Result]]) -> list[Result]:
    try:
        return fn()
    except (RunCancelled, TimeoutError):
        raise
    except AuditInputError as exc:
        return [Result(category, check_key, "check", ERROR, summary="; ".join(exc.problems))]
    except Exception as exc:  # a failing check must never look like a pass
        return [Result(category, check_key, "check", ERROR,
                       summary=f"The {category} check failed: {type(exc).__name__}: {exc}",
                       detail={"trace": traceback.format_exc(limit=3)})]


def execute(run_id) -> None:
    """Run an AuditRun that has been claimed (status == running)."""
    run = AuditRun.all_objects.select_related("system", "model_version", "reference_dataset", "current_dataset").get(id=run_id)
    deadline = time.monotonic() + float(settings.AUDIT_RUN_TIMEOUT_SECONDS)
    try:
        _touch(run_id, 5, "Loading datasets")
        ref = _read_dataset(run.reference_dataset)
        cur = _read_dataset(run.current_dataset) if run.current_dataset_id else None

        is_llm = run.system.system_type == "llm"
        cfg = validate_llm_config(run.config, ref, cur) if is_llm else validate_run_config(run.config, ref, cur)
        cfg.setdefault("thresholds", {})
        cfg["effective_thresholds"] = {**DEFAULT_THRESHOLDS, **{k: float(v) for k, v in cfg["thresholds"].items() if k in DEFAULT_THRESHOLDS}}
        cfg.setdefault("thresholds_rationale", THRESHOLD_RATIONALE)
        cfg["system_type"] = run.system.system_type
        if is_llm:
            cfg["require_citations"] = bool(cfg.get("require_citations") or run.system.requires_citations)
        allowed = LLM_CHECKS if is_llm else TABULAR_CHECKS
        checks = [c for c in (cfg.get("checks") or allowed) if c in allowed]
        cfg["checks"] = checks

        packs = {pid: controls_service.load_pack(pid)["version"] for pid in controls_service.pack_ids_for_system(run.system)}
        AuditRun.all_objects.filter(id=run_id).update(config=cfg, library_versions=library_versions(), control_pack_versions=packs)

        results: list[Result] = []

        _guard(run_id, deadline)
        if "bias" in checks:
            _touch(run_id, 20, "Checking gaps between groups")
            results += _safe("bias", "group_fairness", lambda: llm.run_llm_bias(ref, cfg) if is_llm else fairness.run_bias_checks(ref, cfg))

        _guard(run_id, deadline)
        if "drift" in checks:
            _touch(run_id, 40, "Comparing reference and current data")
            if cur is None:
                results.append(Result("drift", "comparison", "distribution_distance", NOT_APPLICABLE,
                                      summary="No current dataset was provided, so there is nothing to compare against the reference."))
            else:
                results += _safe("drift", "comparison", lambda: llm.run_llm_drift(ref, cur, cfg) if is_llm else drift.run_drift_checks(ref, cur, cfg))

        _guard(run_id, deadline)
        if "explainability" in checks:
            _touch(run_id, 55, "Computing explanations")
            results += _safe("explainability", "explanations", lambda: _explain(run, ref, cfg))
        if "grounding" in checks:
            _touch(run_id, 55, "Comparing outputs with their sources")
            results += _safe("grounding", "groundedness", lambda: llm.run_llm_grounding(ref, cfg, "reference"))
            if cur is not None:
                results += _safe("grounding", "groundedness", lambda: llm.run_llm_grounding(cur, cfg, "current"))

        _guard(run_id, deadline)
        if "privacy" in checks:
            _touch(run_id, 75, "Scanning for personal data")
            frames = {"reference": ref}
            if cur is not None:
                frames["current"] = cur
            results += _safe("privacy", "personal_data",
                             lambda: llm.run_llm_privacy(frames, cfg) if is_llm else privacy.run_privacy_checks(frames, cfg))

        _guard(run_id, deadline)
        if "governance" in checks:
            _touch(run_id, 90, "Checking vendors, data rights and oversight")
            results += _safe("governance", "vendors_rights", lambda: _governance(run, ref, cfg, is_llm))
        _guard(run_id, deadline)
        _persist(run, results)
    except RunCancelled:
        AuditRun.all_objects.filter(id=run_id).update(
            status="cancelled", progress_message="Cancelled", finished_at=timezone.now()
        )
    except Exception as exc:
        message = "; ".join(exc.problems) if isinstance(exc, AuditInputError) else f"{type(exc).__name__}: {exc}"
        AuditRun.all_objects.filter(id=run_id).update(
            status="failed", error=message[:2000], progress_message="Failed", finished_at=timezone.now()
        )


def _governance(run: AuditRun, ref, cfg: dict, is_llm: bool) -> list[Result]:
    system = run.system
    deps = [governance.dependency_dict(d) for d in system.dependencies.all()]
    procs = [governance.process_dict(p) for p in system.rights_processes.select_related("owner")]
    out = governance.run_vendor_checks(deps, system.jurisdictions)
    out += governance.run_rights_checks(procs, system.jurisdictions, system.automated_decision, cfg)
    if is_llm:
        out += llm.run_llm_oversight(ref, cfg)
    return out


def _explain(run: AuditRun, ref, cfg: dict) -> list[Result]:
    mv = run.model_version
    if mv.source == "server_sample":
        return explain.run_explainability_sample(mv.sample_key, ref, cfg)
    if mv.source == "local_bundle":
        qs = ExplanationBundle.all_objects.filter(model_version=mv)
        if cfg.get("explanation_bundle_id"):
            qs = qs.filter(id=cfg["explanation_bundle_id"])
        bundle = qs.order_by("-created_at").first()
        if bundle is None:
            return [explain.not_assessed_result(
                "No explanation bundle has been uploaded for this model version. Run the local audit tool and upload its result file."
            )]
        return explain.run_explainability_bundle(bundle.payload, ref, cfg)
    return [explain.not_assessed_result(
        "No supported model or explanation bundle was provided. Explanations cannot be computed from predictions alone."
    )]


# --------------------------------------------------------------------------------------
def _severity(result: Result) -> str:
    if result.detail.get("high_severity") or result.detail.get("surfaced_rows"):
        return "HIGH"
    if result.category == "grounding" and result.check_key == "unsupported_numbers":
        return "HIGH"
    if result.category == "privacy":
        if result.detail.get("confidence") == "likely":
            return "LOW"
        return "HIGH" if result.detail.get("used_as_model_input") or result.check_key == "minimisation" else "MEDIUM"
    if result.category == "bias" and result.value is not None and result.threshold:
        if result.check_key == "selection_rate_ratio":
            return "HIGH" if result.value < 0.5 else "MEDIUM"
        return "HIGH" if result.value > 2 * result.threshold else "MEDIUM"
    return "MEDIUM"


def _group_key(r: Result) -> tuple:
    if r.category in ("bias", "privacy", "governance") and r.check_key != "minimisation":
        return (r.category, r.check_key, r.subject)
    return (r.category, r.check_key)


def _title(key: tuple, rows: list[Result]) -> str:
    cat, check = key[0], key[1]
    subject = key[2] if len(key) > 2 else ""
    if cat == "bias":
        label = {
            "demographic_parity": "Outcome gap", "selection_rate_ratio": "Low selection-rate ratio", "equalized_odds": "Error-rate gap",
            "refusal_gap": "Refusal gap", "response_length_gap": "Answer-length gap", "score_gap": "Quality-score gap",
        }.get(check, "Group gap")
        return f"{label} across {subject}"
    if cat == "drift":
        if check == "feature_distribution":
            noun = "input" if rows and rows[0].detail.get("kind") != "text" else "text"
            return f"Data changed: {len(rows)} measure{'s' if len(rows) != 1 else ''}"
        return {
            "prediction_distribution": "Model outputs shifted", "schema": "Data columns or types changed",
            "missingness": "Missing-value rate changed", "unseen_categories": "New category values appeared",
            "performance": "Accuracy fell on current data",
        }.get(check, "Data drift")
    if cat == "explainability":
        return "Influential feature may act as a proxy for a group"
    if cat == "grounding":
        return {"groundedness": "Outputs stray from their sources", "unsupported_numbers": "Figures not found in the sources",
                "citations": "Outputs do not cite sources"}.get(check, "Grounding review")
    if cat == "privacy":
        if check == "personal_data_indicators":
            return f"Personal data in {subject.split(':', 1)[-1]}"
        if check == "personal_data_in_text":
            return f"Personal data in {subject.replace(':', ' ')}"
        return {"minimisation": "Personal data used as model input", "retention": "Data held past retention period"}.get(check, "Privacy review")
    if cat == "governance":
        if check == "vendor_dependency":
            return f"Vendor gaps: {subject}"
        if check == "vendor_register":
            return "No vendors or processors recorded"
        if check == "vendor_concentration":
            return f"Single critical provider: {subject}"
        if check == "data_rights":
            from apps.ai_audit.services.governance import RIGHT_LABEL
            return f"Data rights: {RIGHT_LABEL.get(subject, subject)}"
        if check == "human_oversight":
            return "Human oversight needs attention"
    return f"{cat} review"

def _persist(run: AuditRun, results: list[Result]) -> None:
    with transaction.atomic():
        rows = [
            CheckResult(
                tenant_id=run.tenant_id, run=run, category=r.category, check_key=r.check_key, subject=r.subject,
                metric=r.metric, value=r.value, unit=r.unit, support_n=r.support_n, ci_low=r.ci_low, ci_high=r.ci_high,
                threshold=r.threshold, state=r.state, summary=r.summary, detail=r.detail, origin=r.origin,
                is_finding_candidate=r.is_finding_candidate and r.state == REVIEW,
            )
            for r in results
        ]
        CheckResult.all_objects.bulk_create(rows)

        stored = list(CheckResult.all_objects.filter(run=run, is_finding_candidate=True))
        by_key: dict[tuple, list] = defaultdict(list)
        for res in stored:
            r = Result(res.category, res.check_key, res.metric, res.state, subject=res.subject, value=res.value,
                       threshold=res.threshold, summary=res.summary, detail=res.detail)
            by_key[_group_key(r)].append((r, res))

        for key, pairs in by_key.items():
            rs = [p[0] for p in pairs]
            worst = max(rs, key=lambda r: {"LOW": 0, "MEDIUM": 1, "HIGH": 2}[_severity(r)])
            text = " ".join(dict.fromkeys(r.summary for r in rs[:6]))
            if len(rs) > 6:
                text += f" (and {len(rs) - 6} more; see the audit details.)"
            finding = Finding.all_objects.create(
                tenant_id=run.tenant_id, system=run.system, run=run, category=key[0],
                fingerprint=":".join(str(k) for k in key), title=_title(key, rs), plain_language=text,
                next_step=NEXT_STEPS.get((key[0], key[1]), "Review the evidence and decide on an action."),
                severity=_severity(worst), owner=run.system.owner,
            )
            finding.results.set([p[1] for p in pairs])
            FindingEvent.all_objects.create(tenant_id=run.tenant_id, finding=finding, actor=None, action="created",
                                            to_status="open", comment="Created from audit run.")

        AuditRun.all_objects.filter(id=run.id).update(
            status="completed", progress=100, progress_message="Completed", finished_at=timezone.now(), error="",
            context_snapshot=snapshot_context(run),
        )
