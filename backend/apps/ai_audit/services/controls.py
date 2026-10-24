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
    return {
        "total": len(rows),
        "applicable": len(applicable),
        "counts": counts,
        "needs_attention": len(open_items),
        "gaps": [
            {"pack_id": r.pack_id, "control_id": r.control_id, "state": r.state,
             "title": (get_control(r.pack_id, r.control_id) or {}).get("title", r.control_id)}
            for r in open_items
        ],
    }
