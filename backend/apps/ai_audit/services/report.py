"""Audit report (JSON + printable HTML) and run-to-run comparison."""
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.template.loader import render_to_string
from django.utils import timezone

from apps.ai_audit.models import AuditRun, CheckResult, Finding, FindingEvent
from apps.ai_audit.services import controls as controls_service

CATEGORIES = [
    ("bias", "Bias"),
    ("drift", "Drift"),
    ("explainability", "Explainability"),
    ("grounding", "Groundedness and traceability"),
    ("privacy", "Data security and privacy"),
    ("governance", "Vendors, data rights and oversight"),
]
_BY_TYPE = {
    "tabular": ["bias", "drift", "explainability", "privacy", "governance"],
    "llm": ["bias", "drift", "grounding", "privacy", "governance"],
}


def categories_for(system_type: str) -> list[tuple[str, str]]:
    wanted = _BY_TYPE.get(system_type, _BY_TYPE["tabular"])
    return [(k, v) for k, v in CATEGORIES if k in wanted]

STATE_LABELS = {
    "no_alert": "No alert under selected policy",
    "review_required": "Review required",
    "insufficient_evidence": "Insufficient evidence",
    "not_applicable": "Not assessed (not applicable)",
    "error": "Error",
}

LIMITATIONS = [
    "This report presents measurements and declared evidence for human review. It is not a certificate, a legal opinion, or a statement that the system is compliant, fair or safe.",
    "Thresholds are screening policies stored with this run, not legal or universal fairness standards. 'No alert' means no alert under the stated policy.",
    "Group-fairness results depend on the group columns and outcome definitions supplied. Historical outcomes can themselves reflect past bias.",
    "Drift results show change in data or predictions. They are not proof of worse model performance unless outcomes are present and compared.",
    "Explanations describe what the model associates with an output. They are not causal and do not guarantee how to change an outcome.",
    "Personal-data detection is heuristic and can miss data or flag false positives. Control assessments record uploaded evidence and reviewer decisions; the tool cannot verify your infrastructure.",
    "Control wording is a plain-language aid and has not been reviewed by counsel. Confirm applicability with a qualified professional.",
]


def category_coverage(results) -> dict:
    counts: dict[str, int] = {}
    for r in results:
        counts[r.state] = counts.get(r.state, 0) + 1
    if not results:
        status = "not_assessed"
    elif counts.get("error"):
        status = "error"
    elif counts.get("review_required"):
        status = "review_required"
    elif counts.get("no_alert"):
        status = "assessed"
    else:
        status = "not_assessed"
    return {"status": status, "counts": counts, "total": len(results)}


STATUS_LABELS = {
    "assessed": "Assessed: no alert under selected policy",
    "review_required": "Assessed: review required",
    "not_assessed": "Not assessed",
    "error": "Error: check did not complete",
}


SHORT_STATE = {
    "no_alert": "no alert",
    "review_required": "to review",
    "insufficient_evidence": "insufficient evidence",
    "not_applicable": "not assessed",
    "error": "errors",
}


def _count_text(counts: dict) -> str:
    return " · ".join(f"{n} {SHORT_STATE.get(state, state)}" for state, n in counts.items())


def _result_dict(r: CheckResult) -> dict:
    return {
        "category": r.category, "check_key": r.check_key, "subject": r.subject, "metric": r.metric, "value": r.value,
        "unit": r.unit, "support_n": r.support_n, "ci_low": r.ci_low, "ci_high": r.ci_high, "threshold": r.threshold,
        "state": r.state, "state_label": STATE_LABELS.get(r.state, r.state), "summary": r.summary, "detail": r.detail,
        "origin": r.origin,
    }


def snapshot_context(run: AuditRun) -> dict:
    """System, model, dataset and control details as they are now. Stored on the run when it completes."""
    s, mv = run.system, run.model_version
    controls = []
    for a in s.control_assessments.select_related("reviewer").prefetch_related("evidence_files"):
        ctl = controls_service.get_control(a.pack_id, a.control_id) or {}
        controls.append(
            {
                "pack_id": a.pack_id, "pack_version": a.pack_version, "control_id": a.control_id,
                "title": ctl.get("title", a.control_id), "source": ctl.get("source", ""),
                "applicable": a.applicable, "applicability_rationale": a.applicability_rationale,
                "state": a.state, "state_label": a.get_state_display(),
                "evidence": [{"title": e.title, "sha256": e.sha256, "size_bytes": e.size_bytes} for e in a.evidence_files.all()],
                "reviewer": (a.reviewer.full_name or a.reviewer.email) if a.reviewer else None,
                "reviewed_at": a.reviewed_at, "review_comment": a.review_comment,
            }
        )
    datasets = [
        {"role": d.role, "name": d.name, "sha256": d.sha256, "row_count": d.row_count,
         "period_start": d.period_start, "period_end": d.period_end, "is_sample": d.is_sample,
         "is_real_data": d.is_real_data, "source_note": d.source_note}
        for d in (run.reference_dataset, run.current_dataset) if d
    ]
    dependencies = [
        {"name": d.name, "service": d.service, "role": d.get_role_display(), "personal_data_shared": d.personal_data_shared,
         "region": d.region, "contract_in_place": d.contract_in_place, "trains_on_customer_data": d.trains_on_customer_data,
         "retention_days": d.retention_days, "exit_plan": d.exit_plan, "criticality": d.criticality, "last_reviewed": d.last_reviewed}
        for d in s.dependencies.all()
    ]
    rights = [
        {"right": p.get_right_display(), "procedure_exists": p.procedure_exists,
         "owner": (p.owner.full_name or p.owner.email) if p.owner else None, "channel": p.channel, "last_tested": p.last_tested,
         "requests_12m": p.requests_12m, "closed_on_time_12m": p.closed_on_time_12m}
        for p in s.rights_processes.select_related("owner")
    ]
    snapshot = {
        "captured_at": timezone.now(),
        "system": {
            "id": str(s.id), "name": s.name, "purpose": s.purpose, "decision_affected": s.decision_affected,
            "intended_population": s.intended_population, "jurisdictions": s.jurisdictions,
            "automated_decision": s.automated_decision, "system_type": s.system_type,
            "system_type_label": s.get_system_type_display(),
            "owner": (s.owner.full_name or s.owner.email) if s.owner else None,
            "reviewer": (s.reviewer.full_name or s.reviewer.email) if s.reviewer else None,
        },
        "model_version": {"label": mv.version_label, "source": mv.source, "source_label": mv.get_source_display(),
                          "model_type": mv.model_type, "provider": mv.provider, "model_name": mv.model_name,
                          "prompt_version": mv.prompt_version, "feature_columns": mv.feature_columns},
        "datasets": datasets,
        "controls": controls,
        "controls_summary": controls_service.summarise(s),
        "dependencies": dependencies,
        "rights": rights,
    }
    return json.loads(json.dumps(snapshot, cls=DjangoJSONEncoder))

def build_report(run: AuditRun) -> dict:
    results = list(run.results.all())
    cats = categories_for(run.system.system_type)
    by_cat: dict[str, list] = {key: [] for key, _ in cats}
    for r in results:
        by_cat.setdefault(r.category, []).append(r)

    context = run.context_snapshot or snapshot_context(run)
    findings = []
    for f in Finding.all_objects.filter(run=run).select_related("owner", "reviewed_by"):
        findings.append(
            {
                "id": str(f.id), "title": f.title, "category": f.category, "severity": f.severity, "status": f.status,
                "status_label": f.get_status_display(), "plain_language": f.plain_language, "next_step": f.next_step,
                "owner": f.owner.full_name or f.owner.email if f.owner else None, "due_date": f.due_date,
                "remediation_note": f.remediation_note, "review_comment": f.review_comment,
                "reviewed_by": (f.reviewed_by.full_name or f.reviewed_by.email) if f.reviewed_by else None,
                "reviewed_at": f.reviewed_at,
                "history": [
                    {"action": e.action, "from": e.from_status, "to": e.to_status, "comment": e.comment,
                     "actor": (e.actor.full_name or e.actor.email) if e.actor else "system", "at": e.created_at}
                    for e in FindingEvent.all_objects.filter(finding=f).select_related("actor")
                ],
            }
        )

    return {
        "generated_at": timezone.now(),
        "run": {
            "id": str(run.id), "status": run.status, "started_at": run.started_at, "finished_at": run.finished_at,
            "config": run.config, "library_versions": run.library_versions, "control_pack_versions": run.control_pack_versions,
        },
        "as_of": context.get("captured_at"),
        "system": context["system"],
        "model_version": context["model_version"],
        "datasets": context["datasets"],
        "coverage": {
            key: {
                **(cov := category_coverage(by_cat.get(key, []))),
                "label": label,
                "status_label": STATUS_LABELS[cov["status"]],
                "count_text": _count_text(cov["counts"]),
            }
            for key, label in cats
        },
        "categories": [{"key": k, "label": v} for k, v in cats],
        "results": {key: [_result_dict(r) for r in by_cat.get(key, [])] for key, _ in cats},
        "findings": findings,
        "controls": context["controls"],
        "controls_summary": context["controls_summary"],
        "dependencies": context.get("dependencies", []),
        "rights": context.get("rights", []),
        "limitations": LIMITATIONS,
    }


def render_html(report: dict) -> str:
    sections = []
    for item in report["categories"]:
        key, label = item["key"], item["label"]
        sections.append({"key": key, "label": label, "coverage": report["coverage"][key], "results": report["results"][key]})
    explain = report["results"].get("explainability", [])
    importance = [r for r in explain if r["check_key"] == "global_importance" and r["value"] is not None]
    max_imp = max([r["value"] for r in importance], default=1) or 1
    for r in importance:
        r["bar"] = round(100 * r["value"] / max_imp)
    examples = next((r["detail"].get("examples", []) for r in explain if r["check_key"] == "local_explanations"), [])
    for ex in examples:
        top = sorted(ex["contributions"].items(), key=lambda kv: -abs(kv[1]))[:5]
        ex["top"] = [{"feature": k, "value": ex["feature_values"].get(k), "contribution": v} for k, v in top]
    for r in report["results"].get("bias", []):
        if r["metric"] in ("selection_rate", "true_positive_rate", "false_positive_rate") and r["value"] is not None:
            r["bar"] = round(100 * r["value"])
    ctx = {"report": report, "sections": sections, "importance": importance, "examples": examples,
           "status_labels": STATUS_LABELS}
    return render_to_string("ai_audit/report.html", ctx)


# ---------------------------------------------------------------------------
def diff_runs(base: AuditRun, other: AuditRun) -> dict:
    """Compare two runs: what changed in measurements and which findings persist."""
    def index(run):
        return {(r.category, r.check_key, r.subject, r.metric): r for r in run.results.all()}

    a, b = index(base), index(other)
    changes = []
    for key in sorted(set(a) | set(b)):
        ra, rb = a.get(key), b.get(key)
        va = ra.value if ra else None
        vb = rb.value if rb else None
        sa = ra.state if ra else None
        sb = rb.state if rb else None
        if va == vb and sa == sb:
            continue
        changes.append(
            {"category": key[0], "check_key": key[1], "subject": key[2], "metric": key[3],
             "base_value": va, "other_value": vb,
             "delta": (vb - va) if (va is not None and vb is not None) else None,
             "base_state": sa, "other_state": sb}
        )

    fa = {f.fingerprint: f for f in Finding.all_objects.filter(run=base)}
    fb = {f.fingerprint: f for f in Finding.all_objects.filter(run=other)}

    def brief(f):
        return {"fingerprint": f.fingerprint, "title": f.title, "severity": f.severity, "status": f.status}

    return {
        "base_run": str(base.id), "other_run": str(other.id),
        "changes": changes,
        "findings": {
            "gone_in_other": [brief(f) for k, f in fa.items() if k not in fb],
            "new_in_other": [brief(f) for k, f in fb.items() if k not in fa],
            "persisting": [{"base": brief(fa[k]), "other": brief(fb[k])} for k in fa if k in fb],
        },
        "note": "Findings that disappear are not automatically resolved: review the measurements. A persisting finding is still open evidence.",
    }
