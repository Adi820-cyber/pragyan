"""Sample scenarios. Everything created here is flagged as sample data.

* FinSum: a synthetic LLM interaction log (clearly labelled; real production LLM logs are not public)
* COMPAS: real data, downloaded on demand (ProPublica), with the deployed tool's real scores
* HireLens: a small synthetic tabular scenario kept for offline use and tests
"""
import hashlib
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from django.core.files.base import ContentFile

from apps.ai_audit import models as m
from apps.ai_audit.sample import compas as compas_data
from apps.ai_audit.sample import llm_sample
from apps.ai_audit.sample.generate import SAMPLE_MODELS, build_scenario
from apps.ai_audit.services import controls as controls_service
from apps.ai_audit.services.privacy import scan_dataframe
from apps.ai_audit.services.validation import schema_of
from apps.core.models import Membership

SYSTEM_NAME = "HireLens candidate screening (sample)"
LLM_SYSTEM_NAME = "FinSum filing assistant (sample)"
COMPAS_SYSTEM_NAME = "COMPAS recidivism risk tool (real public data)"

# Pre-filled mapping for the synthetic HireLens sample only. For real data the user chooses every column.
DEMO_CONFIG = {
    "prediction_column": "prediction",
    "label_column": "hired_actual",
    "group_columns": ["gender"],
    "favourable_label": "1",
    "id_columns": ["applicant_id"],
    "min_group_size": 30,
    "bootstrap": 300,
    "seed": 42,
}

# Controls left without evidence so the demos show real gaps.
DEMO_GAPS = {"DPDP-06", "GDPR-11", "DPDP-08", "GDPR-08"}


def _find_reviewer(tenant, actor):
    return (
        Membership.all_objects.filter(tenant=tenant, status="ACTIVE", role__in=["COMPLIANCE_OFFICER", "TENANT_ADMIN"])
        .exclude(id=actor.id).first()
    )


def _store_dataset(tenant, system, actor, role, name, df, start, end, sample_config, source_note="", filename="sample.csv", is_real_data=False):
    raw = df.to_csv(index=False).encode("utf-8")
    ds = m.Dataset(
        tenant=tenant, system=system, role=role, name=name, original_filename=filename, sha256=hashlib.sha256(raw).hexdigest(),
        row_count=len(df), column_schema=schema_of(df), pii_scan={"findings": scan_dataframe(df)},
        period_start=start, period_end=end, is_sample=True, is_real_data=is_real_data, sample_config=sample_config, source_note=source_note, uploaded_by=actor,
    )
    ds.file.save(filename, ContentFile(raw), save=False)
    ds.save()
    return ds


def _seed_controls(tenant, system, actor, reviewer):
    controls_service.ensure_assessments(system, actor)
    for a in m.ControlAssessment.all_objects.filter(system=system, applicable=True):
        if a.control_id in DEMO_GAPS:
            continue
        content = f"Sample evidence for {a.control_id}. Synthetic placeholder used for the demo.\n".encode()
        ev = m.ControlEvidence(
            tenant=tenant, assessment=a, title=f"Sample document for {a.control_id}", original_filename=f"{a.control_id}.txt",
            size_bytes=len(content), content_type="text/plain", uploaded_by=actor,
        )
        ev.file.save("evidence.bin", ContentFile(content), save=False)
        ev.sha256 = hashlib.sha256(content).hexdigest()
        ev.save()
        if reviewer:
            m.ControlAssessment.all_objects.filter(id=a.id).update(state="reviewed", reviewer=reviewer, review_comment="Sample review for the demo.")
        else:
            m.ControlAssessment.all_objects.filter(id=a.id).update(state="evidence_supplied")


def seed_hirelens(tenant, actor: Membership) -> m.AISystem:
    existing = m.AISystem.all_objects.filter(tenant=tenant, name=SYSTEM_NAME).first()
    if existing:
        return existing
    reviewer = _find_reviewer(tenant, actor)
    system = m.AISystem.all_objects.create(
        tenant=tenant, name=SYSTEM_NAME, system_type="tabular",
        purpose="Rank job applicants for an initial recruiter shortlist. SYNTHETIC DATA: no real people are involved.",
        decision_affected="Whether an applicant is shortlisted for interview",
        intended_population="Applicants for entry- to mid-level roles in India",
        owner=actor, reviewer=reviewer, jurisdictions=["DPDP", "GDPR"], automated_decision=True,
    )
    for label, key in (("v1", "hirelens_v1"), ("v2", "hirelens_v2")):
        m.ModelVersion.all_objects.create(
            tenant=tenant, system=system, version_label=label, source="server_sample", sample_key=key,
            model_type="GradientBoostingClassifier", feature_columns=list(SAMPLE_MODELS[key]), favourable_label="1",
            notes=("Uses city_tier as an input." if label == "v1" else "Retrained without city_tier. Same held-out data."),
        )
    frames = build_scenario()
    today = date.today()
    layout = [
        ("reference_v1", "reference", "HireLens reference (v1 predictions)", today - timedelta(days=180), today - timedelta(days=90)),
        ("current_v1", "current", "HireLens current: campus channel (v1 predictions)", today - timedelta(days=89), today),
        ("reference_v2", "reference", "HireLens reference (v2 predictions)", today - timedelta(days=180), today - timedelta(days=90)),
        ("current_v2", "current", "HireLens current: campus channel (v2 predictions)", today - timedelta(days=89), today),
    ]
    for key, role, name, start, end in layout:
        _store_dataset(tenant, system, actor, role, name, frames[key], start, end, DEMO_CONFIG, "Synthetic, generated with a fixed seed", f"{key}.csv")
    _seed_controls(tenant, system, actor, reviewer)
    return system


# ------------------------------------------------------------------------------ LLM sample
def seed_finsum(tenant, actor: Membership) -> m.AISystem:
    existing = m.AISystem.all_objects.filter(tenant=tenant, name=LLM_SYSTEM_NAME).first()
    if existing:
        return existing
    reviewer = _find_reviewer(tenant, actor)
    system = m.AISystem.all_objects.create(
        tenant=tenant, name=LLM_SYSTEM_NAME, system_type="llm", requires_citations=True,
        purpose="Summarise company filings for investment analysts and state the key figures. SYNTHETIC LOGS: the interactions "
                "and companies are generated, not real.",
        decision_affected="Which companies an analyst investigates further",
        intended_population="Equity analysts in India and abroad, writing in English or Hindi",
        owner=actor, reviewer=reviewer, jurisdictions=["DPDP", "GDPR"], automated_decision=False,
    )
    notes = {"v1": ("p1", "Original prompt. Refuses many Hindi requests and cites sources inconsistently."),
             "v2": ("p2", "Revised prompt: handles Hindi requests and requires a citation.")}
    for label in ("v1", "v2"):
        m.ModelVersion.all_objects.create(
            tenant=tenant, system=system, version_label=label, source="llm_hosted", provider="ExampleAI (fictional)",
            model_name="example-llm-large", prompt_version=notes[label][0], model_type="Hosted LLM", notes=notes[label][1],
        )
    frames = llm_sample.build_scenario()
    for version in ("v1", "v2"):
        _store_dataset(tenant, system, actor, "reference", f"FinSum reference ({version} logs)", frames[f"reference_{version}"],
                       date(2026, 1, 1), date(2026, 3, 31), llm_sample.DEMO_LLM_CONFIG, "Synthetic LLM log, generated from templates", f"finsum_reference_{version}.csv")
        _store_dataset(tenant, system, actor, "current", f"FinSum current ({version} logs)", frames[f"current_{version}"],
                       date(2026, 4, 1), date(2026, 6, 30), llm_sample.DEMO_LLM_CONFIG, "Synthetic LLM log, generated from templates", f"finsum_current_{version}.csv")

    today = date.today()
    m.Dependency.all_objects.create(
        tenant=tenant, system=system, name="ExampleAI (fictional)", service="Hosted LLM API", role="model_provider",
        personal_data_shared=True, data_categories=["analyst emails", "client names in prompts"], region="United States",
        outside_india=True, outside_eea=True, transfer_mechanism="", contract_in_place=True, contract_reviewed_on=today - timedelta(days=500),
        trains_on_customer_data="unknown", retention_days=None, subprocessors_listed=False, exit_plan=False, criticality="high",
        last_reviewed=today - timedelta(days=430), notes="Sample entry with several recorded gaps.",
    )
    m.Dependency.all_objects.create(
        tenant=tenant, system=system, name="Example Cloud (fictional)", service="Hosting and storage", role="cloud",
        personal_data_shared=True, data_categories=["interaction logs"], region="India", outside_india=False, outside_eea=True,
        transfer_mechanism="Standard contractual clauses (placeholder)", contract_in_place=True, contract_reviewed_on=today - timedelta(days=120),
        trains_on_customer_data="no", retention_days=365, subprocessors_listed=True, exit_plan=True, criticality="medium",
        last_reviewed=today - timedelta(days=90),
    )
    rights = [
        ("access", True, actor, "privacy@finsum.example", 30, today - timedelta(days=100), 12, 11),
        ("correction", True, actor, "privacy@finsum.example", 30, None, 3, 3),
        ("grievance", True, reviewer or actor, "grievance@finsum.example", 15, today - timedelta(days=60), 9, 5),
        ("withdraw_consent", True, actor, "privacy@finsum.example", 30, today - timedelta(days=400), 0, 0),
    ]  # erasure is deliberately missing
    for right, exists, owner, channel, sla, tested, n, ontime in rights:
        m.RightsProcess.all_objects.create(
            tenant=tenant, system=system, right=right, procedure_exists=exists, owner=owner, channel=channel, sla_days=sla,
            last_tested=tested, requests_12m=n, closed_on_time_12m=ontime,
        )
    _seed_controls(tenant, system, actor, reviewer)
    return system


# ------------------------------------------------------------------------------ real data
def _compas_config(prediction: str, features: list[str]) -> dict:
    others = [p for p in ("pred_tool", "pred_v1", "pred_v2") if p != prediction]
    return {
        "prediction_column": prediction, "label_column": "no_two_year_recid", "favourable_label": "1",
        "group_columns": ["race", "sex"], "id_columns": ["case_id", "screening_date"], "feature_columns": features,
        "excluded_columns": ["screening_date", "sex_male", "decile_score"] + others,
        "min_group_size": 30, "bootstrap": 300, "seed": 42,
    }


def seed_compas(tenant, actor: Membership, compas_file: Optional[str] = None) -> m.AISystem:
    existing = m.AISystem.all_objects.filter(tenant=tenant, name=COMPAS_SYSTEM_NAME).first()
    base_features = ["age", "priors_count", "juv_fel_count", "juv_misd_count", "juv_other_count", "felony"]
    config = {
        "by_version": {
            "tool": _compas_config("pred_tool", base_features),
            "v1": _compas_config("pred_v1", compas_data.FEATURES_V1),
            "v2": _compas_config("pred_v2", compas_data.FEATURES_V2),
        }
    }
    if existing:
        # Keep the stored wizard mapping current when the seed definition changes.
        m.Dataset.all_objects.filter(system=existing, is_sample=True, is_real_data=True).update(sample_config=config)
        return existing
    path: Path = compas_data.ensure_file(compas_file)  # raises RealDataUnavailable with instructions
    frames = compas_data.build_scenario(path)
    reviewer = _find_reviewer(tenant, actor)
    system = m.AISystem.all_objects.create(
        tenant=tenant, name=COMPAS_SYSTEM_NAME, system_type="tabular",
        purpose="Estimate the risk that a defendant reoffends within two years. REAL PUBLIC DATA: ProPublica's COMPAS data for "
                "Broward County, Florida, 2013-2014. Used here to show how an audit reads a real deployed system.",
        decision_affected="Bail and sentencing recommendations (as used in the source jurisdiction)",
        intended_population="Defendants screened in Broward County, Florida",
        owner=actor, reviewer=reviewer, jurisdictions=[], automated_decision=True,
    )
    m.ModelVersion.all_objects.create(
        tenant=tenant, system=system, version_label="tool", source="predictions_only", favourable_label="1",
        model_type="COMPAS (deployed tool, scores as published)",
        notes="The real tool. A decile score of 5 or more is treated as high risk, so 'low risk' is the favourable outcome. Explanations are not available.",
    )
    m.ModelVersion.all_objects.create(
        tenant=tenant, system=system, version_label="v1", source="server_sample", sample_key="compas_v1", favourable_label="1",
        model_type="GradientBoostingClassifier", feature_columns=list(compas_data.FEATURES_V1),
        notes="Our own model trained on half of 2013. Uses sex and prior arrests as inputs; race is not an input.",
    )
    m.ModelVersion.all_objects.create(
        tenant=tenant, system=system, version_label="v2", source="server_sample", sample_key="compas_v2", favourable_label="1",
        model_type="GradientBoostingClassifier", feature_columns=list(compas_data.FEATURES_V2),
        notes="Retrained without sex or prior arrests. Evaluated on the same held-out data.",
    )
    note = compas_data.SOURCE_NOTE
    _store_dataset(tenant, system, actor, "reference", "COMPAS reference: 2013 held-out (tool, v1 and v2 predictions)", frames["reference"],
                   date(2013, 1, 1), date(2013, 12, 31), config, note, "compas_reference.csv", is_real_data=True)
    _store_dataset(tenant, system, actor, "current", "COMPAS current: 2014 (tool, v1 and v2 predictions)", frames["current"],
                   date(2014, 1, 1), date(2014, 12, 31), config, note, "compas_current.csv", is_real_data=True)
    return system
