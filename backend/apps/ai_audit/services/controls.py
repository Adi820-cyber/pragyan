"""Versioned DPDP / GDPR control packs and per-system control assessments.

The tool records evidence and reviewer decisions. It never declares an
organisation "compliant".
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

PACK_DIR = Path(__file__).resolve().parent.parent / "control_packs"
JURISDICTION_PACKS = {"DPDP": "dpdp_2025_v1", "GDPR": "gdpr_v1"}


@lru_cache(maxsize=None)
def load_pack(pack_id: str) -> dict[str, Any]:
    path = PACK_DIR / f"{pack_id}.json"
    if not path.is_file():
        raise KeyError(f"Unknown control pack '{pack_id}'.")
    return json.loads(path.read_text(encoding="utf-8"))


def pack_ids_for_system(system) -> list[str]:
    return [JURISDICTION_PACKS[j] for j in (system.jurisdictions or []) if j in JURISDICTION_PACKS]


def get_control(pack_id: str, control_id: str) -> Optional[dict]:
    return next((c for c in load_pack(pack_id)["controls"] if c["id"] == control_id), None)


def default_applicability(control: dict, system) -> tuple[bool, str]:
    """Initial applicability from system flags. A reviewer can change it with a rationale."""
    conditions = control.get("applies_when") or {}
    for flag, expected in conditions.items():
        if bool(getattr(system, flag, False)) != bool(expected):
            return False, control.get("not_applicable_reason", "Condition for this control is not met.")
    return True, ""


AUTO_PREFIX = "Set automatically:"


def _refresh_auto_applicability(assessment, control: dict, system) -> None:
    """Re-evaluate applicability after a system flag changes, but never override a person's decision."""
    applicable, why = default_applicability(control, system)
    auto_set = assessment.applicability_rationale.startswith(AUTO_PREFIX)
    if applicable and not assessment.applicable and auto_set:
        assessment.applicable = True
        assessment.applicability_rationale = ""
        assessment.state = "needs_evidence"
        assessment.save(update_fields=["applicable", "applicability_rationale", "state", "updated_at"])
    elif not applicable and assessment.applicable and assessment.state == "needs_evidence" \
            and not assessment.evidence_files.exists():
        assessment.applicable = False
        assessment.applicability_rationale = f"{AUTO_PREFIX} {why}"
        assessment.state = "not_applicable"
        assessment.save(update_fields=["applicable", "applicability_rationale", "state", "updated_at"])


def ensure_assessments(system, membership=None) -> list:
    """Create any missing ControlAssessment rows for the packs this system opts into."""
    from apps.ai_audit.models import ControlAssessment

    created = []
    for pack_id in pack_ids_for_system(system):
        pack = load_pack(pack_id)
        existing = {
            a.control_id: a for a in ControlAssessment.all_objects.filter(system=system, pack_id=pack_id)
        }
        for control in pack["controls"]:
            current = existing.get(control["id"])
            if current is not None:
                _refresh_auto_applicability(current, control, system)
                continue
            applicable, why = default_applicability(control, system)
            created.append(
                ControlAssessment(
                    tenant_id=system.tenant_id, system=system, pack_id=pack_id, pack_version=pack["version"],
                    control_id=control["id"], applicable=applicable,
                    applicability_rationale="" if applicable else f"{AUTO_PREFIX} {why}",
                    state="needs_evidence" if applicable else "not_applicable",
                    updated_by=membership,
                )
            )
    if created:
        ControlAssessment.all_objects.bulk_create(created)
    return created


def summarise(system) -> dict[str, Any]:
    from apps.ai_audit.models import ControlAssessment

    rows = list(ControlAssessment.all_objects.filter(system=system))
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.state] = counts.get(r.state, 0) + 1
    applicable = [r for r in rows if r.applicable]
    open_items = [r for r in applicable if r.state in ("needs_evidence", "evidence_supplied", "gap_identified")]
    reviewed = sum(1 for r in applicable if r.state == "reviewed")
    supplied = sum(1 for r in applicable if r.state in ("evidence_supplied", "reviewed", "gap_identified"))
    return {
        "total": len(rows),
        "applicable": len(applicable),
        # Share of applicable items where a reviewer judged the evidence adequate. Not a compliance score.
        "reviewed_pct": round(100 * reviewed / len(applicable)) if applicable else None,
        "evidence_pct": round(100 * supplied / len(applicable)) if applicable else None,
        "reviewed": reviewed,
        "counts": counts,
        "needs_attention": len(open_items),
        "gaps": [
            {"pack_id": r.pack_id, "control_id": r.control_id, "state": r.state,
             "title": (get_control(r.pack_id, r.control_id) or {}).get("title", r.control_id)}
            for r in open_items
        ],
    }


# ---------------------------------------------------------------- history, automated evidence, coverage
# Which audit check categories (and optional check keys) give *automated* evidence for a control.
# Everything else is manual attestation: a person uploads a file or link and a reviewer judges it.
AUTOMATED_SOURCES: dict[str, list[tuple[str, Optional[str]]]] = {
    "DPDP-03": [("privacy", None)],
    "GDPR-05": [("privacy", None)],
    "DPDP-04": [("drift", None)],
    "GDPR-06": [("drift", None)],
    "GDPR-04": [("explainability", None), ("governance", "human_oversight")],
    "DPDP-08": [("governance", "vendor_dependency")],
    "GDPR-08": [("governance", "vendor_dependency")],
    "GDPR-14": [("governance", "vendor_dependency")],
    "DPDP-09": [("governance", "data_rights")],
    "GDPR-13": [("governance", "data_rights")],
}
AUTOMATED_STATE_RANK = {"review_required": 3, "insufficient_evidence": 2, "no_alert": 1}


def log_event(assessment, kind: str, actor=None, from_state: str = "", to_state: str = "", note: str = "") -> None:
    from apps.ai_audit.models import ControlAssessmentEvent

    ControlAssessmentEvent.all_objects.create(
        tenant_id=assessment.tenant_id, assessment=assessment, kind=kind, actor=actor,
        from_state=from_state, to_state=to_state, note=note[:2000],
    )


def automated_evidence_for_system(system) -> dict[str, dict]:
    """control_id -> evidence drawn from the latest completed audit run. Empty when no audit has completed."""
    from apps.ai_audit.models import AuditRun, CheckResult

    run = AuditRun.all_objects.filter(system=system, status="completed").order_by("-finished_at").first()
    if run is None:
        return {}
    results = list(CheckResult.all_objects.filter(run=run))
    out: dict[str, dict] = {}
    for control_id, sources in AUTOMATED_SOURCES.items():
        picked = [r for r in results if any(r.category == c and (k is None or r.check_key == k) for c, k in sources)]
        if not picked:
            continue
        counts: dict[str, int] = {}
        for r in picked:
            counts[r.state] = counts.get(r.state, 0) + 1
        signal = max(counts, key=lambda s: AUTOMATED_STATE_RANK.get(s, 0)) if counts else None
        flagged = [r for r in picked if r.state == "review_required"]
        out[control_id] = {
            "run_id": str(run.id), "finished_at": run.finished_at, "counts": counts, "signal": signal,
            "origin": "automated",
            "flagged": [{"subject": r.subject, "summary": r.summary} for r in flagged[:5]],
        }
    return out


def gaps_for(assessment, control: Optional[dict], auto: Optional[dict], has_links: bool) -> list[str]:
    if not assessment.applicable:
        return []
    gaps: list[str] = []
    if assessment.state == "gap_identified":
        gaps.append(f"Reviewer recorded a gap: {assessment.review_comment}")
    manual = assessment.evidence_files.all() if hasattr(assessment, "evidence_files") else []
    if not len(manual) and not has_links:
        wanted = (control or {}).get("required_evidence") or []
        if wanted:
            gaps.append("No manual evidence yet. Still needed: " + "; ".join(wanted))
        else:
            gaps.append("No manual evidence yet.")
    if auto and auto["signal"] == "review_required":
        gaps.extend(f"Automated check flags: {f['summary']}" for f in auto["flagged"])
    if auto and auto["signal"] == "insufficient_evidence":
        gaps.append("Automated checks had insufficient evidence for this control.")
    if assessment.state in ("evidence_supplied",):
        gaps.append("Evidence supplied but not yet reviewed.")
    return gaps


def evidence_basis(assessment, auto: Optional[dict], has_links: bool) -> str:
    manual = bool(len(assessment.evidence_files.all())) or has_links
    if manual and auto:
        return "both"
    if auto:
        return "automated"
    return "manual" if manual else "none"


def sla_days_for(system, kind) -> int:
    """Response period for a data-subject request. A declared SLA for that right wins; otherwise a conservative default.

    Defaults: 30 days (GDPR Art. 12(3) one month; also used as the internal target under DPDP). DPDP-only grievances
    default to 90 days, the outer limit in the DPDP Rules 2025. Confirm against current law before relying on them.
    """
    from apps.ai_audit.models import RightsProcess

    declared = RightsProcess.all_objects.filter(system=system, right=kind).values_list("sla_days", flat=True).first()
    if declared:
        return declared
    if kind == "grievance" and "GDPR" not in (system.jurisdictions or []):
        return 90
    return 30
