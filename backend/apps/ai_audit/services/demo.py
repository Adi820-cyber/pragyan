"""Loads the synthetic HireLens scenario. Everything created here is flagged as sample data."""
import hashlib
from datetime import date, timedelta

from django.core.files.base import ContentFile

from apps.ai_audit import models as m
from apps.ai_audit.sample.generate import SAMPLE_MODELS, build_scenario
from apps.ai_audit.services import controls as controls_service
from apps.ai_audit.services.privacy import scan_dataframe
from apps.ai_audit.services.validation import schema_of
from apps.core.models import Membership

SYSTEM_NAME = "HireLens candidate screening (sample)"

# Pre-filled mapping for the sample datasets only. For real data the user chooses every column.
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

# Controls left without evidence so the demo shows real gaps.
DEMO_GAPS = {"DPDP-06", "GDPR-11", "DPDP-08", "GDPR-08"}


def _csv_bytes(df) -> bytes:
    return df.to_csv(index=False).encode("utf-8")


def seed_hirelens(tenant, actor: Membership) -> m.AISystem:
    existing = m.AISystem.all_objects.filter(tenant=tenant, name=SYSTEM_NAME).first()
    if existing:
        return existing

    reviewer = (
        Membership.all_objects.filter(tenant=tenant, status="ACTIVE", role__in=["COMPLIANCE_OFFICER", "TENANT_ADMIN"])
        .exclude(id=actor.id).first()
    )
    system = m.AISystem.all_objects.create(
        tenant=tenant, name=SYSTEM_NAME,
        purpose="Rank job applicants for an initial recruiter shortlist. SYNTHETIC DATA: no real people are involved.",
        decision_affected="Whether an applicant is shortlisted for interview",
        intended_population="Applicants for entry- to mid-level roles in India",
        owner=actor, reviewer=reviewer, jurisdictions=["DPDP", "GDPR"], automated_decision=True,
    )

    for label, key in (("v1", "hirelens_v1"), ("v2", "hirelens_v2")):
        m.ModelVersion.all_objects.create(
            tenant=tenant, system=system, version_label=label, source="server_sample", sample_key=key,
            model_type="GradientBoostingClassifier", feature_columns=list(SAMPLE_MODELS[key]),
            favourable_label="1",
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
        df = frames[key]
        raw = _csv_bytes(df)
        ds = m.Dataset(
            tenant=tenant, system=system, role=role, name=name, original_filename=f"{key}.csv",
            sha256=hashlib.sha256(raw).hexdigest(), row_count=len(df), column_schema=schema_of(df),
            pii_scan={"findings": scan_dataframe(df)}, period_start=start, period_end=end, is_sample=True,
            uploaded_by=actor,
        )
        ds.file.save(f"{key}.csv", ContentFile(raw), save=False)
        ds.save()

    controls_service.ensure_assessments(system, actor)
    for a in m.ControlAssessment.all_objects.filter(system=system, applicable=True):
        if a.control_id in DEMO_GAPS:
            continue
        content = (f"Sample evidence for {a.control_id}. Synthetic placeholder used for the demo.\n").encode()
        ev = m.ControlEvidence(
            tenant=tenant, assessment=a, title=f"Sample document for {a.control_id}", original_filename=f"{a.control_id}.txt",
            size_bytes=len(content), content_type="text/plain", uploaded_by=actor,
        )
        ev.file.save("evidence.bin", ContentFile(content), save=False)
        ev.sha256 = hashlib.sha256(content).hexdigest()
        ev.save()
        if reviewer:
            m.ControlAssessment.all_objects.filter(id=a.id).update(state="reviewed", reviewer=reviewer,
                                                                   review_comment="Sample review for the demo.")
        else:
            m.ControlAssessment.all_objects.filter(id=a.id).update(state="evidence_supplied")
    return system
