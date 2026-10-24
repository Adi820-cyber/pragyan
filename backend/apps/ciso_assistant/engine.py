from typing import Dict, Any, List, Optional
import copy
from apps.ciso_assistant.catalog import (
    FRAMEWORKS_CATALOG,
    STANDARD_CONTROLS,
    APPLIED_CORE_CONTROLS,
    SAMPLE_RISKS,
)

# In-memory working copy per process with persistence to Django models when active
_TENANT_CONTROLS_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_TENANT_RISKS_CACHE: Dict[str, List[Dict[str, Any]]] = {}


def _get_controls_for_tenant(tenant_id: str) -> List[Dict[str, Any]]:
    if tenant_id not in _TENANT_CONTROLS_CACHE:
        _TENANT_CONTROLS_CACHE[tenant_id] = copy.deepcopy(STANDARD_CONTROLS)
    return _TENANT_CONTROLS_CACHE[tenant_id]


def _get_risks_for_tenant(tenant_id: str) -> List[Dict[str, Any]]:
    if tenant_id not in _TENANT_RISKS_CACHE:
        _TENANT_RISKS_CACHE[tenant_id] = copy.deepcopy(SAMPLE_RISKS)
    return _TENANT_RISKS_CACHE[tenant_id]


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


def add_custom_risk(tenant_id: str, risk_data: Dict[str, Any]) -> Dict[str, Any]:
    risks = _get_risks_for_tenant(tenant_id)
    identifier = risk_data.get("identifier") or f"RSK-CUSTOM-{len(risks) + 1:03d}"
    il = int(risk_data.get("inherent_likelihood", 3))
    ii = int(risk_data.get("inherent_impact", 3))
    iscore = il * ii
    isev = "CRITICAL" if iscore >= 20 else "HIGH" if iscore >= 13 else "MEDIUM" if iscore >= 6 else "LOW"

    rl = int(risk_data.get("residual_likelihood", max(1, il - 1)))
    ri = int(risk_data.get("residual_impact", max(1, ii - 1)))
    rscore = rl * ri
    rsev = "CRITICAL" if rscore >= 20 else "HIGH" if rscore >= 13 else "MEDIUM" if rscore >= 6 else "LOW"

    new_risk = {
        "identifier": identifier,
        "title": risk_data.get("title", "New Custom Risk"),
        "category": risk_data.get("category", "CYBERSECURITY"),
        "status": risk_data.get("status", "IDENTIFIED"),
        "inherent_likelihood": il,
        "inherent_impact": ii,
        "inherent_score": iscore,
        "inherent_severity": isev,
        "residual_likelihood": rl,
        "residual_impact": ri,
        "residual_score": rscore,
        "residual_severity": rsev,
        "treatment_strategy": risk_data.get("treatment_strategy", "MITIGATE"),
        "treatment_plan": risk_data.get("treatment_plan", ""),
        "mitigating_control": risk_data.get("mitigating_control", "CTRL-IAM-MFA"),
    }
    risks.insert(0, new_risk)
    return new_risk
