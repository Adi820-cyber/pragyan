from typing import Dict, Any, List, Optional
import copy
from apps.ciso_assistant.catalog import (
    FRAMEWORKS_CATALOG,
    STANDARD_CONTROLS,
    APPLIED_CORE_CONTROLS,
    SAMPLE_RISKS,
)

VALID_STATUSES = ("NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED")
RISK_CATEGORIES = ("CYBERSECURITY", "PRIVACY", "COMPLIANCE", "OPERATIONAL", "THIRD_PARTY", "AI")
RISK_STATUSES = ("IDENTIFIED", "ASSESSED", "TREATING", "ACCEPTED", "CLOSED")
TREATMENTS = ("MITIGATE", "ACCEPT", "TRANSFER", "AVOID")


class CisoValidationError(ValueError):
    """Raised when a payload is not acceptable; the view turns it into HTTP 400."""


# Reads work on the stored per-tenant copy when one exists, else on a throwaway copy of the
# shipped baseline. Nothing is written until a user changes something.
def _state(tenant_id: str):
    from apps.ciso_assistant.models import CisoTenantState

    return CisoTenantState.objects.filter(tenant_id=tenant_id).first()


def _get_controls_for_tenant(tenant_id: str) -> List[Dict[str, Any]]:
    row = _state(tenant_id)
    return row.controls if row and row.controls else copy.deepcopy(STANDARD_CONTROLS)


def _get_risks_for_tenant(tenant_id: str) -> List[Dict[str, Any]]:
    row = _state(tenant_id)
    return row.risks if row else copy.deepcopy(SAMPLE_RISKS)


def _save(tenant_id: str, controls: List[Dict[str, Any]], risks: List[Dict[str, Any]]) -> None:
    from apps.ciso_assistant.models import CisoTenantState

    CisoTenantState.objects.update_or_create(
        tenant_id=tenant_id, defaults={"controls": controls, "risks": risks}
    )


def reset_tenant_state(tenant_id: str) -> bool:
    from apps.ciso_assistant.models import CisoTenantState

    deleted, _ = CisoTenantState.objects.filter(tenant_id=tenant_id).delete()
    return bool(deleted)


def has_stored_state(tenant_id: str) -> bool:
    return _state(tenant_id) is not None

def get_ciso_overview(tenant_id: str) -> Dict[str, Any]:
    """
    Computes global executive GRC metrics inspired by CISO Assistant.
    Aggregates multi-framework compliance posture, 5x5 risk heatmaps, and gap counts.
    """
    controls = _get_controls_for_tenant(tenant_id)
    risks = _get_risks_for_tenant(tenant_id)

    # 1. Framework Breakdown & Posture Scoring
    framework_summaries = []
    total_implemented_all = 0
    total_controls_all = len(controls)

    for fw in FRAMEWORKS_CATALOG:
        fw_controls = [c for c in controls if c["framework_code"] == fw["code"]]
        fw_total = len(fw_controls)
        fw_implemented = sum(1 for c in fw_controls if c["status"] == "IMPLEMENTED")
        fw_in_progress = sum(1 for c in fw_controls if c["status"] == "IN_PROGRESS")
        fw_not_started = sum(1 for c in fw_controls if c["status"] == "NOT_STARTED")
        total_implemented_all += fw_implemented

        score = round((fw_implemented / (fw_total or 1)) * 100, 1)

        framework_summaries.append({
            "code": fw["code"],
            "name": fw["name"],
            "version": fw["version"],
            "publisher": fw["publisher"],
            "description": fw["description"],
            "icon": fw["icon"],
            "total_controls": fw_total,
            "implemented": fw_implemented,
            "in_progress": fw_in_progress,
            "not_started": fw_not_started,
            "compliance_score": score,
        })

    global_posture_score = round(
        (total_implemented_all / (total_controls_all or 1)) * 100, 1
    )

    # 2. Risk Matrix 5x5 Inherent vs Residual
    inherent_matrix = [[0 for _ in range(5)] for _ in range(5)]
    residual_matrix = [[0 for _ in range(5)] for _ in range(5)]

    crit_count = 0
    high_count = 0
    med_count = 0
    low_count = 0

    for r in risks:
        # Inherent (Likelihood - 1, Impact - 1)
        il = max(1, min(5, r["inherent_likelihood"])) - 1
        ii = max(1, min(5, r["inherent_impact"])) - 1
        inherent_matrix[il][ii] += 1

        # Residual
        rl = max(1, min(5, r["residual_likelihood"])) - 1
        ri = max(1, min(5, r["residual_impact"])) - 1
        residual_matrix[rl][ri] += 1

        if r["inherent_severity"] == "CRITICAL":
            crit_count += 1
        elif r["inherent_severity"] == "HIGH":
            high_count += 1
        elif r["inherent_severity"] == "MEDIUM":
            med_count += 1
        else:
            low_count += 1

    # 3. Critical Control Gaps
    open_gaps = [
        c for c in controls if c["status"] in ("NOT_STARTED", "IN_PROGRESS")
    ]

    return {
        "global_posture_score": global_posture_score,
        "total_frameworks": len(FRAMEWORKS_CATALOG),
        "total_controls": total_controls_all,
        "total_applied_safeguards": len(APPLIED_CORE_CONTROLS),
        "total_risks": len(risks),
        "critical_risks": crit_count,
        "high_risks": high_count,
        "medium_risks": med_count,
        "low_risks": low_count,
        "open_gaps_count": len(open_gaps),
        "is_baseline": not has_stored_state(tenant_id),
        "baseline_note": "Control statuses and risks shown are the shipped starter baseline, not an assessment of your organisation, until you change them.",
        "frameworks": framework_summaries,
        "inherent_matrix_5x5": inherent_matrix,
        "residual_matrix_5x5": residual_matrix,
        "recent_risks": risks[:4],
        "applied_core_controls": APPLIED_CORE_CONTROLS,
    }


def get_framework_controls(tenant_id: str, framework_code: Optional[str] = None) -> List[Dict[str, Any]]:
    controls = _get_controls_for_tenant(tenant_id)
    if framework_code:
        return [c for c in controls if c["framework_code"] == framework_code]
    return controls


def update_control_status(
    tenant_id: str,
    control_code: str,
    new_status: str,
    sync_crosswalks: bool = True,
) -> Dict[str, Any]:
    """
    Updates the status of a control.
    If sync_crosswalks is True ('Assess Once, Comply with Many'), updates all
    equivalent controls across other frameworks sharing the same crosswalk_tag!
    """
    if new_status not in VALID_STATUSES:
        raise CisoValidationError(f"status must be one of {", ".join(VALID_STATUSES)}.")
    controls = _get_controls_for_tenant(tenant_id)
    target_control = next((c for c in controls if c["code"] == control_code), None)
    if not target_control:
        return {"error": f"Control with code '{control_code}' not found."}

    old_status = target_control["status"]
    target_control["status"] = new_status
    synced_controls = [target_control["code"]]

    if sync_crosswalks and target_control.get("crosswalk_tag"):
        tag = target_control["crosswalk_tag"]
        for c in controls:
            if c["crosswalk_tag"] == tag and c["code"] != control_code:
                c["status"] = new_status
                synced_controls.append(f"{c['framework_code']}:{c['code']}")
    _save(tenant_id, controls, _get_risks_for_tenant(tenant_id))

    return {
        "success": True,
        "control_code": control_code,
        "old_status": old_status,
        "new_status": new_status,
        "synced_controls_count": len(synced_controls),
        "synced_controls": synced_controls,
    }


def get_crosswalk_table() -> List[Dict[str, Any]]:
    """
    Returns the decoupled crosswalk matrix showing how each technical safeguard
    satisfies requirements across ISO 27001, NIST CSF, SOC 2, CIS Controls, DPDP, and ISO 42001.
    """
    return APPLIED_CORE_CONTROLS


def get_gap_analysis(tenant_id: str) -> List[Dict[str, Any]]:
    """
    Extracts all open compliance gaps with AI remediation advice and impact priority.
    """
    controls = _get_controls_for_tenant(tenant_id)
    gaps = []

    for c in controls:
        if c["status"] in ("NOT_STARTED", "IN_PROGRESS"):
            priority = "HIGH" if c["status"] == "NOT_STARTED" else "MEDIUM"
            if "Crypt" in c["domain"] or "Access" in c["domain"]:
                priority = "CRITICAL"

            gaps.append({
                "code": c["code"],
                "framework": c["framework_code"],
                "title": c["title"],
                "domain": c["domain"],
                "status": c["status"],
                "priority": priority,
                "remediation_guidance": c["guidance"],
                "description": c["description"],
            })

    # Sort gaps by priority: CRITICAL, HIGH, MEDIUM, LOW
    p_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    gaps.sort(key=lambda g: p_order.get(g["priority"], 99))
    return gaps


def _rating(data: Dict[str, Any], key: str, default: int) -> int:
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise CisoValidationError(f"{key} must be an integer from 1 to 5.")
    try:
        number = int(value)
    except ValueError:
        raise CisoValidationError(f"{key} must be an integer from 1 to 5.")
    if not 1 <= number <= 5:
        raise CisoValidationError(f"{key} must be an integer from 1 to 5.")
    return number


def _severity(score: int) -> str:
    return "CRITICAL" if score >= 20 else "HIGH" if score >= 13 else "MEDIUM" if score >= 6 else "LOW"


def _choice(data: Dict[str, Any], key: str, allowed, default: str) -> str:
    value = data.get(key, default)
    if value not in allowed:
        raise CisoValidationError(f"{key} must be one of {', '.join(allowed)}.")
    return value


def _text(data: Dict[str, Any], key: str, limit: int, default: str = "") -> str:
    value = data.get(key, default)
    if not isinstance(value, str):
        raise CisoValidationError(f"{key} must be text.")
    value = value.strip()
    if len(value) > limit:
        raise CisoValidationError(f"{key} must be at most {limit} characters.")
    return value


def add_custom_risk(tenant_id: str, risk_data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(risk_data, dict) and not hasattr(risk_data, "get"):
        raise CisoValidationError("A JSON object is required.")
    controls = _get_controls_for_tenant(tenant_id)
    risks = _get_risks_for_tenant(tenant_id)
    title = _text(risk_data, "title", 200)
    if not title:
        raise CisoValidationError("title is required.")
    il = _rating(risk_data, "inherent_likelihood", 3)
    ii = _rating(risk_data, "inherent_impact", 3)
    rl = _rating(risk_data, "residual_likelihood", max(1, il - 1))
    ri = _rating(risk_data, "residual_impact", max(1, ii - 1))
    identifier = _text(risk_data, "identifier", 40) or f"RSK-CUSTOM-{len(risks) + 1:03d}"
    if any(r["identifier"] == identifier for r in risks):
        raise CisoValidationError(f"A risk with identifier {identifier} already exists.")
    new_risk = {
        "identifier": identifier,
        "title": title,
        "category": _choice(risk_data, "category", RISK_CATEGORIES, "CYBERSECURITY"),
        "status": _choice(risk_data, "status", RISK_STATUSES, "IDENTIFIED"),
        "inherent_likelihood": il,
        "inherent_impact": ii,
        "inherent_score": il * ii,
        "inherent_severity": _severity(il * ii),
        "residual_likelihood": rl,
        "residual_impact": ri,
        "residual_score": rl * ri,
        "residual_severity": _severity(rl * ri),
        "treatment_strategy": _choice(risk_data, "treatment_strategy", TREATMENTS, "MITIGATE"),
        "treatment_plan": _text(risk_data, "treatment_plan", 2000),
        "mitigating_control": _text(risk_data, "mitigating_control", 80),
    }
    risks.insert(0, new_risk)
    _save(tenant_id, controls, risks)
    return new_risk