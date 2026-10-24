"""Vendor dependency and data-rights checks.

These read what the organisation has *declared* about its vendors and how it handles requests
from people. They cannot verify the declarations. Results are marked as declared evidence and
every gap routes to a human reviewer.
"""
from datetime import date, timedelta
from typing import Any, Optional

from apps.ai_audit.services import fairness
from apps.ai_audit.services.common import (
    INSUFFICIENT,
    NO_ALERT,
    NOT_APPLICABLE,
    REVIEW,
    Result,
    fmt_pct,
    merged_thresholds,
)

CATEGORY = "governance"
REVIEW_MAX_AGE_DAYS = 365
TEST_MAX_AGE_DAYS = 365

RIGHT_LABEL = {
    "access": "access to data",
    "correction": "correction of data",
    "erasure": "erasure of data",
    "withdraw_consent": "withdrawal of consent",
    "grievance": "grievance redressal",
    "human_review": "human review of an automated decision",
}


def required_rights(jurisdictions: list[str], automated_decision: bool) -> list[str]:
    if not jurisdictions:
        return []
    rights = ["access", "correction", "erasure", "grievance", "withdraw_consent"]
    if automated_decision:
        rights.append("human_review")
    return rights


def _age_days(d: Optional[date], today: date) -> Optional[int]:
    return None if d is None else (today - d).days


def run_vendor_checks(dependencies: list[dict[str, Any]], jurisdictions: list[str], today: Optional[date] = None) -> list[Result]:
    today = today or date.today()
    if not dependencies:
        return [Result(
            CATEGORY, "vendor_register", "vendors_recorded", INSUFFICIENT, subject="vendors and processors", value=0.0, unit="vendors",
            summary="No vendors, cloud services or model providers are recorded for this system. Almost every AI system depends on some. "
                    "List them so contracts, data flows and exit options can be checked.",
            origin="declared", is_finding_candidate=True,
        )]

    results: list[Result] = []
    gdpr, dpdp = "GDPR" in jurisdictions, "DPDP" in jurisdictions

    for d in dependencies:
        name = d["name"]
        problems: list[str] = []
        unknown: list[str] = []
        high = False

        if d["personal_data_shared"] and not d["contract_in_place"]:
            problems.append("personal data is shared without a contract or data processing terms on record")
            high = True
        if d["personal_data_shared"] and d["trains_on_customer_data"] == "yes":
            problems.append("the vendor trains on your data")
            high = True
        elif d["personal_data_shared"] and d["trains_on_customer_data"] == "unknown":
            unknown.append("whether the vendor trains on your data")
        if d["personal_data_shared"] and d["retention_days"] is None:
            unknown.append("how long the vendor keeps the data")
        if d["personal_data_shared"] and not d["subprocessors_listed"]:
            unknown.append("the vendor's sub-processors")
        if gdpr and d["outside_eea"] and d["personal_data_shared"] and not d["transfer_mechanism"].strip():
            problems.append("data leaves the EEA with no transfer mechanism recorded (GDPR Chapter V)")
            high = True
        if dpdp and d["outside_india"] and d["personal_data_shared"]:
            problems.append("data leaves India; confirm that no restriction on the destination applies under the DPDP Act")
        if d["criticality"] == "high" and not d["exit_plan"]:
            problems.append("a high-criticality dependency has no exit plan")
        age = _age_days(d["last_reviewed"], today)
        if age is None:
            problems.append("the vendor has never been reviewed")
        elif age > REVIEW_MAX_AGE_DAYS:
            problems.append(f"the last review was {age // 30} months ago")

        if problems:
            state, text = REVIEW, f"{name}: " + "; ".join(problems) + "."
        elif unknown:
            state, text = INSUFFICIENT, f"{name}: not recorded: " + ", ".join(unknown) + "."
        else:
            state, text = NO_ALERT, f"{name}: the recorded vendor controls show no gap under this policy."
        if problems and unknown:
            text += " Also not recorded: " + ", ".join(unknown) + "."
        results.append(Result(
            CATEGORY, "vendor_dependency", "vendor_gaps", state, subject=name, value=float(len(problems)), unit="gaps",
            support_n=1, summary=text, origin="declared", is_finding_candidate=state == REVIEW,
            detail={"gaps": problems, "not_recorded": unknown, "role": d["role"], "criticality": d["criticality"],
                    "personal_data_shared": d["personal_data_shared"], "high_severity": high, "region": d["region"]},
        ))

    providers = [d for d in dependencies if d["role"] == "model_provider"]
    if len(providers) == 1 and providers[0]["criticality"] == "high" and not providers[0]["exit_plan"]:
        results.append(Result(
            CATEGORY, "vendor_concentration", "single_provider", REVIEW, subject=providers[0]["name"],
            summary=f"{providers[0]['name']} is the only model provider and is critical, with no exit plan. If it changes terms, prices or models, "
                    "this system has no recorded fallback.",
            origin="declared", is_finding_candidate=True,
        ))
    return results


def run_rights_checks(
    processes: list[dict[str, Any]], jurisdictions: list[str], automated_decision: bool, cfg: Optional[dict] = None,
    today: Optional[date] = None,
) -> list[Result]:
    today = today or date.today()
    th = merged_thresholds(cfg or {})
    needed = required_rights(jurisdictions, automated_decision)
    if not needed:
        return [Result(CATEGORY, "data_rights", "rights_processes", NOT_APPLICABLE, subject="data rights",
                       summary="No privacy law (DPDP or GDPR) is selected for this system, so data-rights handling was not assessed.",
                       origin="declared")]

    by_right = {p["right"]: p for p in processes}
    results: list[Result] = []
    for right in needed:
        label = RIGHT_LABEL[right]
        p = by_right.get(right)
        if p is None or not p["procedure_exists"]:
            results.append(Result(
                CATEGORY, "data_rights", "rights_procedure", REVIEW, subject=right, value=0.0, unit="procedures",
                summary=f"No working procedure is recorded for {label}. People need a way to make this request and someone accountable for answering it.",
                origin="declared", is_finding_candidate=True, detail={"right": right, "high_severity": right == "human_review"},
            ))
            continue

        gaps: list[str] = []
        if not p["owner_name"]:
            gaps.append("no named owner")
        if not p["channel"].strip():
            gaps.append("no request channel recorded")
        tested_age = _age_days(p["last_tested"], today)
        if tested_age is None:
            gaps.append("the procedure has never been tested")
        elif tested_age > TEST_MAX_AGE_DAYS:
            gaps.append(f"last tested {tested_age // 30} months ago")
        results.append(Result(
            CATEGORY, "data_rights", "rights_procedure", REVIEW if gaps else NO_ALERT, subject=right, value=float(len(gaps)), unit="gaps",
            summary=(f"For {label}: " + "; ".join(gaps) + "." if gaps else f"For {label}: a procedure, owner, channel and a recent test are recorded."),
            origin="declared", is_finding_candidate=bool(gaps), detail={"right": right, "gaps": gaps},
        ))

        n, on_time = p["requests_12m"], min(p["closed_on_time_12m"], p["requests_12m"])
        if n >= 5:
            rate = on_time / n
            lo, hi = fairness.wilson_interval(on_time, n)
            state = REVIEW if rate < th["rights_min_on_time"] else NO_ALERT
            results.append(Result(
                CATEGORY, "data_rights", "requests_on_time", state, subject=right, value=rate, unit="share", support_n=n, ci_low=lo, ci_high=hi,
                threshold=th["rights_min_on_time"], origin="declared", is_finding_candidate=state == REVIEW,
                summary=f"{on_time} of {n} requests for {label} were closed on time ({fmt_pct(rate)}). The policy minimum is {fmt_pct(th['rights_min_on_time'])}.",
            ))
        elif n > 0:
            results.append(Result(CATEGORY, "data_rights", "requests_on_time", INSUFFICIENT, subject=right, support_n=n, origin="declared",
                                  summary=f"Only {n} requests for {label} in the last year; too few to judge response times."))
    return results


def dependency_dict(d) -> dict[str, Any]:
    return {
        "name": d.name, "role": d.role, "personal_data_shared": d.personal_data_shared,
        "outside_india": d.outside_india, "outside_eea": d.outside_eea, "transfer_mechanism": d.transfer_mechanism or "",
        "contract_in_place": d.contract_in_place, "trains_on_customer_data": d.trains_on_customer_data,
        "retention_days": d.retention_days, "subprocessors_listed": d.subprocessors_listed, "exit_plan": d.exit_plan,
        "criticality": d.criticality, "last_reviewed": d.last_reviewed, "region": d.region,
    }


def process_dict(p) -> dict[str, Any]:
    return {
        "right": p.right, "procedure_exists": p.procedure_exists, "owner_name": (p.owner.full_name or p.owner.email) if p.owner else "",
        "channel": p.channel or "", "last_tested": p.last_tested, "requests_12m": p.requests_12m,
        "closed_on_time_12m": p.closed_on_time_12m,
    }
