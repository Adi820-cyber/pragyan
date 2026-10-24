"""Audit report (JSON + printable HTML) and run-to-run comparison."""
import hashlib
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

    report = {
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
    report["executive_summary"] = executive_summary(report)
    report["regulatory_mapping"] = regulatory_mapping(report)
    return report


def render_html(report: dict, workflow: dict | None = None) -> str:
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
           "status_labels": STATUS_LABELS, "workflow": workflow}
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


# ---------------------------------------------------------------------------
# Plain-language summary, regulation mapping, fingerprint and exports.
_SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
_CAT_LABEL = dict(CATEGORIES)
_UNRESOLVED = ("open", "in_remediation", "submitted")


def _fmt(value) -> str:
    return "n/a" if value is None else f"{value:.3f}".rstrip("0").rstrip(".")


def executive_summary(report: dict) -> dict:
    """Plain-language summary derived only from stored measurements. It never says 'compliant' or 'passed'."""
    flat = [(key, r) for key, rows in report["results"].items() for r in rows]
    to_review = [(k, r) for k, r in flat if r["state"] == "review_required"]
    errors = [(k, r) for k, r in flat if r["state"] == "error"]
    unknown = [(k, r) for k, r in flat if r["state"] in ("insufficient_evidence", "not_applicable")]
    not_assessed = [v["label"] for v in report["coverage"].values() if v["status"] == "not_assessed"]

    if errors:
        level, headline = "incomplete", "Incomplete: some checks did not finish"
        text = f"{len(errors)} check(s) ended in an error, so this audit cannot be read as a full picture. Re-run before relying on it."
    elif to_review:
        level, headline = "attention", "Needs attention: issues found for human review"
        text = (f"{len(to_review)} of {len(flat)} measurements crossed the screening policy stored with this run. "
                "These are alerts for a person to review, not proof of harm or of a legal breach.")
    elif flat:
        level, headline = "no_alert", "No alert under the selected policy for the checks that ran"
        text = ("None of the measurements that ran crossed the stored screening policy. This is not a statement that the "
                "system is fair, safe or compliant, and anything listed under 'Not tested' is still unchecked.")
    else:
        level, headline = "incomplete", "No measurements recorded"
        text = "This run recorded no results, so there is nothing to summarise."

    risks = []
    open_findings = sorted((f for f in report["findings"] if f["status"] in _UNRESOLVED),
                           key=lambda f: _SEVERITY_ORDER.get(f["severity"], 3))
    for f in open_findings[:3]:
        risks.append({"title": f["title"], "severity": f["severity"], "why": f["plain_language"], "next_step": f["next_step"],
                      "source": "finding"})
    if len(risks) < 3:
        used = {x["title"] for x in risks}
        for key, r in to_review:
            if len(risks) == 3:
                break
            title = f"{_CAT_LABEL.get(key, key)}: {r['metric']}" + (f" ({r['subject']})" if r["subject"] else "")
            if title not in used:
                risks.append({"title": title, "severity": None, "why": r["summary"], "next_step": "", "source": "measurement"})

    failed = [
        {"category": _CAT_LABEL.get(k, k), "check": r["metric"], "subject": r["subject"], "value": r["value"],
         "threshold": r["threshold"], "support_n": r["support_n"], "why": r["summary"]}
        for k, r in to_review[:12]
    ]

    limits = []
    if not_assessed:
        limits.append(f"Not assessed at all: {', '.join(not_assessed)}.")
    for k, r in unknown[:8]:
        limits.append(f"{_CAT_LABEL.get(k, k)}, {r['metric']}: {r['summary']}")
    cs = report["controls_summary"]
    if not report["system"].get("jurisdictions"):
        limits.append("No jurisdiction (DPDP or GDPR) was selected, so no control checklist was assessed.")
    elif cs["needs_attention"]:
        limits.append(f"{cs['needs_attention']} of {cs['applicable']} applicable DPDP/GDPR controls still lack reviewed evidence.")
    synthetic = [d["name"] for d in report["datasets"] if d.get("is_sample") and not d.get("is_real_data")]
    if synthetic:
        limits.append(f"Synthetic sample data was used ({', '.join(synthetic)}), so numbers illustrate the method and do not describe real people.")
    limits.append("Infrastructure, security controls and legal obligations are not verified by this tool. See Limitations.")

    cats = []
    for key, cov in report["coverage"].items():
        rows = report["results"].get(key, [])
        lead = next((r for r in rows if r["state"] == "review_required"), None) or next((r for r in rows if r["value"] is not None), None)
        cats.append({"key": key, "label": cov["label"], "status": cov["status"], "status_label": cov["status_label"],
                     "count_text": cov["count_text"],
                     "headline": (f"{lead['metric']}{' (' + lead['subject'] + ')' if lead['subject'] else ''} = {_fmt(lead['value'])}"
                                  f"{' on ' + str(lead['support_n']) + ' rows' if lead['support_n'] else ''}") if lead and lead["value"] is not None
                     else (lead["summary"] if lead else "No result recorded")})

    deps, rights = report.get("dependencies", []), report.get("rights", [])
    governance = {
        "vendors": len(deps),
        "vendors_sharing_personal_data": sum(1 for d in deps if d["personal_data_shared"]),
        "vendors_sharing_without_contract": sum(1 for d in deps if d["personal_data_shared"] and not d["contract_in_place"]),
        "vendors_without_exit_plan": sum(1 for d in deps if not d["exit_plan"]),
        "rights_procedures": len(rights),
        "rights_without_procedure": sum(1 for p in rights if not p["procedure_exists"]),
        "rights_never_tested": sum(1 for p in rights if not p["last_tested"]),
    }
    return {"verdict": {"level": level, "headline": headline, "text": text}, "top_risks": risks, "failed": failed,
            "not_tested": limits, "categories": cats, "governance": governance,
            "counts": {"measurements": len(flat), "review_required": len(to_review), "errors": len(errors),
                       "unresolved_findings": len(open_findings)}}


# Which audit areas are relevant to which provisions. "Supports evidence for" only: a measurement can inform a
# provision but never shows that an organisation meets it.
AREA_PROVISIONS = {
    "bias": {"dpdp": "No provision on algorithmic fairness; s.8(3) (completeness, accuracy and consistency of data used for decisions) is the nearest link.",
             "gdpr": "Art. 5(1)(a) (fairness) and Art. 22 (automated individual decisions)."},
    "drift": {"dpdp": "s.8(3) (accuracy and consistency of data used for decisions).", "gdpr": "Art. 5(1)(d) (accuracy)."},
    "explainability": {"dpdp": "s.5 (notice) is the nearest link; the Act has no explicit explanation right for automated decisions.",
                       "gdpr": "Art. 22(3) (safeguards for automated decisions) and Arts. 13-15 (information about the logic involved)."},
    "grounding": {"dpdp": "s.8(3) (accuracy and consistency of data used for decisions).", "gdpr": "Art. 5(1)(d) (accuracy)."},
    "privacy": {"dpdp": "s.6(1) (data limited to what is necessary), s.8(5) (security safeguards), s.8(7) (erasure); DPDP Rules 2025, r.6.",
                "gdpr": "Art. 5(1)(c) (data minimisation), Art. 5(1)(e) (storage limitation), Art. 32 (security of processing)."},
    "governance": {"dpdp": "s.8(2) (processors) and ss.11-14 (rights of Data Principals and grievance redressal).",
                   "gdpr": "Art. 28 (processors), Arts. 12-22 (data-subject rights), Chapter V (transfers)."},
}
MAPPING_NOTICE = ("The audit supports evidence for these provisions. It does not show that an organisation complies with them. "
                  "Provision references are a plain-language aid, have not been reviewed by counsel, and DPDP provisions commence in phases.")
_CONTROL_PHRASE = {
    "reviewed": "Evidence reviewed by a person",
    "evidence_supplied": "Evidence uploaded, awaiting review",
    "needs_evidence": "No evidence yet",
    "gap_identified": "Gap identified by reviewer",
    "not_applicable": "Marked not applicable",
}


def regulatory_mapping(report: dict) -> dict:
    areas = [
        {"key": item["key"], "label": item["label"], "coverage": report["coverage"][item["key"]]["status_label"],
         "dpdp": AREA_PROVISIONS[item["key"]]["dpdp"], "gdpr": AREA_PROVISIONS[item["key"]]["gdpr"]}
        for item in report["categories"] if item["key"] in AREA_PROVISIONS
    ]
    by_reg: dict[str, list] = {"DPDP": [], "GDPR": []}
    for c in report["controls"]:
        reg = "DPDP" if c["pack_id"].startswith("dpdp") else "GDPR"
        by_reg[reg].append({"control_id": c["control_id"], "title": c["title"], "source": c["source"],
                            "state": c["state"], "status_text": _CONTROL_PHRASE.get(c["state"], c["state"]),
                            "evidence_count": len(c["evidence"]), "applicable": c["applicable"]})
    return {"notice": MAPPING_NOTICE, "areas": areas, "controls": by_reg}


# ---------------------------------------------------------------------------
def canonical_json(data) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), cls=DjangoJSONEncoder)


def results_digest(run: AuditRun) -> str:
    """Hash of the run's stored measurements. Detects edits to the data a report was built from."""
    rows = sorted((_result_dict(r) for r in run.results.all()),
                  key=lambda r: (r["category"], r["check_key"], r["subject"], r["metric"]))
    return hashlib.sha256(canonical_json(rows).encode()).hexdigest()


def freeze_report(run: AuditRun) -> tuple[dict, str]:
    """Build the report once and return (snapshot, sha256 fingerprint). The snapshot is JSON round-tripped so it hashes the same when re-read."""
    snapshot = json.loads(canonical_json(build_report(run)))
    snapshot["source_results_sha256"] = results_digest(run)
    return snapshot, hashlib.sha256(canonical_json(snapshot).encode()).hexdigest()


def verify_report(report) -> dict:
    """Recompute both hashes without writing anything."""
    snapshot_ok = hashlib.sha256(canonical_json(report.snapshot).encode()).hexdigest() == report.fingerprint
    source_ok = results_digest(report.run) == report.snapshot.get("source_results_sha256")
    return {"valid": snapshot_ok and source_ok, "snapshot_matches": snapshot_ok, "source_results_match": source_ok,
            "fingerprint": report.fingerprint, "checked_at": timezone.now()}


def workflow_block(report, people: dict) -> dict:
    return {
        "version": report.version, "status": report.status, "status_label": report.get_status_display(),
        "fingerprint": report.fingerprint, "generated_by": people.get("generated_by"), "generated_at": report.created_at,
        "submitted_by": people.get("submitted_by"), "submitted_at": report.submitted_at,
        "approved_by": people.get("approved_by"), "approved_at": report.approved_at, "review_comment": report.review_comment,
    }


def render_markdown(report: dict, workflow: dict | None = None) -> str:
    ex, rm = report["executive_summary"], report["regulatory_mapping"]
    s, mv = report["system"], report["model_version"]
    out = [f"# Responsible AI audit report: {s['name']}", "",
           f"Model {mv['label']} | run {report['run']['id']} | run finished {report['run'].get('finished_at') or 'n/a'}", ""]
    if workflow:
        out += [f"Report version {workflow['version']} | status: {workflow['status_label']} | "
                f"generated by {workflow['generated_by'] or 'unknown'} | approved by {workflow['approved_by'] or 'not yet approved'}",
                f"Fingerprint (SHA-256 of the frozen snapshot): `{workflow['fingerprint']}`", ""]
    out += ["> " + report["limitations"][0], "", "## Executive summary", "", f"**{ex['verdict']['headline']}**", "", ex["verdict"]["text"], "",
            "### Top risks", ""]
    out += [f"{i}. {r['title']}" + (f" ({r['severity']})" if r["severity"] else "") + f": {r['why']}" for i, r in enumerate(ex["top_risks"], 1)] \
        or ["No open findings or alerts."]
    out += ["", "### What failed and why", ""]
    out += [f"- {f['category']} / {f['check']}{' (' + f['subject'] + ')' if f['subject'] else ''}: {f['why']}" for f in ex["failed"]] or ["- Nothing crossed the screening policy."]
    out += ["", "### Not tested or limited", ""] + [f"- {x}" for x in ex["not_tested"]]
    out += ["", "## Results by area", ""]
    for c in ex["categories"]:
        out.append(f"- **{c['label']}**: {c['status_label']} ({c['count_text'] or 'no results'}). {c['headline']}")
    g = ex["governance"]
    out += ["", "## Vendors and data rights", "",
            f"- Vendors recorded: {g['vendors']}; sharing personal data: {g['vendors_sharing_personal_data']}; sharing without a contract on record: {g['vendors_sharing_without_contract']}; without exit plan: {g['vendors_without_exit_plan']}",
            f"- Data-rights procedures recorded: {g['rights_procedures']}; missing: {g['rights_without_procedure']}; never tested: {g['rights_never_tested']}",
            "", "## Regulation mapping (DPDP Act 2023 / GDPR)", "", rm["notice"], ""]
    for a in rm["areas"]:
        out += [f"- **{a['label']}** ({a['coverage']}). DPDP: {a['dpdp']} GDPR: {a['gdpr']}"]
    for reg, items in rm["controls"].items():
        if items:
            out += ["", f"### {reg} readiness controls", ""] + [f"- {c['control_id']} {c['title']} ({c['source']}): {c['status_text']}" for c in items]
    out += ["", "## Limitations", ""] + [f"- {x}" for x in report["limitations"]]
    return "\n".join(out) + "\n"
