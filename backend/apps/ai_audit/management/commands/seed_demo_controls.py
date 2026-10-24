"""Adds governance demo content for the Privacy & Controls pages. Safe to run repeatedly.

Synthetic records are labelled: vendors and requests carry is_demo=True and names marked "(fictional)",
demo notes start with "[DEMO]". Audit evidence is never faked: with --run-audit the real audit pipeline
is executed on the stored sample datasets, so automated evidence on the controls comes from a real run.
"""
from datetime import date, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.ai_audit import models as m
from apps.ai_audit.services import controls as controls_service
from apps.ai_audit.services.validation import load_csv, validate_llm_config, validate_run_config
from apps.core.models import Membership, Tenant

DEMO = "[DEMO] "
# control_id -> (state, comment). Applied once, only to controls a reviewer already signed off with the placeholder.
DEMO_STATES = {
    "DPDP-05": ("gap_identified", "Access review is older than a year and encryption at rest is not described. Needs a current access list."),
    "GDPR-10": ("gap_identified", "Security measures are listed but not tested. Penetration test or equivalent not on file."),
    "GDPR-12": ("evidence_supplied", None),
    "DPDP-07": ("evidence_supplied", None),
}
LINKS = {
    "DPDP-01": ("Privacy notice shown at sign-up (example link)", "https://example.com/privacy-notice"),
    "GDPR-03": ("Public privacy notice (example link)", "https://example.com/privacy"),
    "DPDP-09": ("Grievance redressal contact page (example link)", "https://example.com/grievance"),
}


class Command(BaseCommand):
    help = "Seeds demo owners, history, evidence links, vendors and data-subject requests for the demo tenant."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", default="hirelens-demo", help="Tenant slug (default: hirelens-demo).")
        parser.add_argument("--run-audit", action="store_true", help="Run a real audit on each system that has no completed run.")

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug=options["tenant"]).first()
        if tenant is None:
            raise CommandError(f"Tenant '{options['tenant']}' not found. Run seed_ai_demo first.")
        people = {mm.role: mm for mm in Membership.all_objects.filter(tenant=tenant, status="ACTIVE")}
        owner = people.get("RISK_OWNER")
        admin = people.get("TENANT_ADMIN")
        reviewer = people.get("COMPLIANCE_OFFICER")
        if not (owner and admin and reviewer):
            raise CommandError("The demo tenant needs an owner, an administrator and a reviewer. Run seed_ai_demo first.")
        systems = [s for s in m.AISystem.all_objects.filter(tenant=tenant).exclude(status="ARCHIVED") if s.jurisdictions]
        if not systems:
            raise CommandError("No AI system with a DPDP or GDPR checklist exists. Run seed_ai_demo first.")
        with transaction.atomic():
            for system in systems:
                self._controls(system, owner, admin, reviewer)
                self._vendors(system, tenant)
                self._requests(system, tenant, owner, admin, reviewer)
        if options["run_audit"]:
            for system in systems:
                self._audit(system, owner)
        self.stdout.write(self.style.SUCCESS("Demo governance content ready."))

    # ------------------------------------------------------------------ controls
    def _controls(self, system, owner, admin, reviewer):
        controls_service.ensure_assessments(system, owner)
        now = timezone.now()
        rows = list(m.ControlAssessment.all_objects.filter(system=system).order_by("control_id"))
        for i, a in enumerate(rows):
            if not a.applicable:
                continue
            if a.owner_id is None:
                security = any(w in a.control_id for w in ("05", "06", "10", "11"))
                m.ControlAssessment.all_objects.filter(id=a.id).update(owner=admin if security else owner)
            if a.state == "reviewed" and a.reviewed_at is None:
                m.ControlAssessment.all_objects.filter(id=a.id).update(reviewed_at=now - timedelta(days=3 + (i % 25)))
            if not a.events.exists():
                controls_service.log_event(a, "evidence_added", owner, "needs_evidence", note=f"{DEMO}Sample placeholder evidence seeded.")
                if a.state == "reviewed":
                    controls_service.log_event(a, "reviewed", reviewer, "evidence_supplied", "reviewed", f"{DEMO}{a.review_comment or 'Sample review.'}")
        for control_id, (state, comment) in DEMO_STATES.items():
            a = m.ControlAssessment.all_objects.filter(system=system, control_id=control_id, applicable=True).first()
            if a is None or a.events.filter(note__startswith=f"{DEMO}Set to").exists():
                continue
            m.ControlAssessment.all_objects.filter(id=a.id).update(
                state=state, reviewer=reviewer if comment else None, reviewed_at=now - timedelta(days=2) if comment else None,
                review_comment=f"{DEMO}{comment}" if comment else "")
            controls_service.log_event(a, state if comment else "evidence_added", reviewer if comment else owner, a.state, state,
                                       f"{DEMO}Set to {state} for the demo. {comment or ''}".strip())
        for control_id, (title, url) in LINKS.items():
            a = m.ControlAssessment.all_objects.filter(system=system, control_id=control_id, applicable=True).first()
            if a and not a.links.exists():
                m.ControlLink.all_objects.create(tenant_id=system.tenant_id, assessment=a, title=f"{DEMO}{title}", url=url, added_by=owner)
                controls_service.log_event(a, "link_added", owner, a.state, note=f"{DEMO}Example link added.")

    # ------------------------------------------------------------------ vendors
    def _vendors(self, system, tenant):
        today = date.today()
        m.Dependency.all_objects.filter(system=system, name__contains="(fictional)").update(is_demo=True)
        if system.name != "FinSum filing assistant (sample)":
            return
        m.Dependency.all_objects.get_or_create(
            tenant=tenant, system=system, name="Example Vector DB (fictional)",
            defaults=dict(
                service="Embedding and retrieval store", role="other", relationship="sub_processor", personal_data_shared=True,
                data_categories=["document excerpts", "analyst queries"], region="Singapore", outside_india=True, outside_eea=True,
                transfer_mechanism="", contract_in_place=False, trains_on_customer_data="no", retention_days=90,
                subprocessors_listed=False, exit_plan=False, criticality="medium", last_reviewed=None, is_demo=True,
                notes=f"{DEMO}Sub-processor used by the hosted LLM provider. No data processing agreement on file."),
        )
        m.Dependency.all_objects.get_or_create(
            tenant=tenant, system=system, name="Example Analytics (fictional)",
            defaults=dict(
                service="Usage analytics (no personal data)", role="analytics", relationship="processor", personal_data_shared=False,
                region="India", contract_in_place=True, contract_reviewed_on=today - timedelta(days=60), trains_on_customer_data="no",
                exit_plan=True, criticality="low", last_reviewed=today - timedelta(days=45), is_demo=True,
                notes=f"{DEMO}Receives aggregate counts only."),
        )

    # ------------------------------------------------------------------ requests
    def _requests(self, system, tenant, owner, admin, reviewer):
        today = date.today()
        # (ref, kind, status, received days ago, closed days ago or None, assignee, note)
        spec = [
            ("DEMO-DSR-001", "access", "completed", 40, 28, owner, "Copy of interaction logs provided."),
            ("DEMO-DSR-002", "erasure", "completed", 70, 20, admin, "Erased after the 30-day window: closed late."),
            ("DEMO-DSR-003", "erasure", "in_progress", 45, None, admin, "Waiting for the model provider to confirm deletion. Past its due date."),
            ("DEMO-DSR-004", "correction", "in_progress", 12, None, owner, "Verifying the corrected figure."),
            ("DEMO-DSR-005", "grievance", "received", 5, None, reviewer, "Complaint about a wrong filing summary."),
            ("DEMO-DSR-006", "withdraw_consent", "completed", 25, 22, owner, "Consent withdrawn; processing stopped."),
            ("DEMO-DSR-007", "consent", "received", 2, None, owner, "Asks what consent was recorded at sign-up."),
            ("DEMO-DSR-008", "access", "received", 31, None, owner, "No one has picked this up yet. Overdue."),
            ("DEMO-DSR-009", "grievance", "rejected", 50, 41, reviewer, "Not about this system; redirected to the right controller."),
        ]
        for ref, kind, status, ago, closed_ago, assignee, note in spec:
            if m.DataSubjectRequest.all_objects.filter(tenant=tenant, reference=ref).exists():
                continue
            received = today - timedelta(days=ago)
            m.DataSubjectRequest.all_objects.create(
                tenant=tenant, system=system, reference=ref, kind=kind, status=status, received_on=received,
                due_on=received + timedelta(days=controls_service.sla_days_for(system, kind)),
                closed_on=today - timedelta(days=closed_ago) if closed_ago is not None else None,
                assignee=assignee, notes=f"{DEMO}{note}", is_demo=True)

    # ------------------------------------------------------------------ real audit
    def _audit(self, system, actor):
        if m.AuditRun.all_objects.filter(system=system, status__in=["completed", "queued", "running"]).exists():
            self.stdout.write(f"Audit already exists for {system.name}; skipped.")
            return
        mv = m.ModelVersion.all_objects.filter(system=system).order_by("-version_label").first()
        ds = m.Dataset.all_objects.filter(system=system, is_sample=True)
        ref = ds.filter(role="reference", name__contains=mv.version_label if mv else "").first() or ds.filter(role="reference").first()
        cur = ds.filter(role="current", name__contains=mv.version_label if mv else "").first() or ds.filter(role="current").first()
        if not (mv and ref and cur and ref.sample_config):
            self.stdout.write(f"No sample datasets for {system.name}; audit skipped.")
            return
        cfg = dict(ref.sample_config)
        if "by_version" in cfg:
            cfg = dict(cfg["by_version"].get(mv.version_label) or next(iter(cfg["by_version"].values())))
        frames = []
        for d in (ref, cur):
            with d.file.open("rb") as handle:
                frames.append(load_csv(handle.read(), max_rows=100000, max_bytes=50 * 1024 * 1024))
        if system.system_type == "llm":
            cfg = validate_llm_config(cfg, frames[0], frames[1])
        else:
            cfg.setdefault("favourable_label", mv.favourable_label)
            cfg = validate_run_config(cfg, frames[0], frames[1])
        run = m.AuditRun.all_objects.create(
            tenant_id=system.tenant_id, system=system, model_version=mv, reference_dataset=ref, current_dataset=cur,
            config=cfg, status="queued", created_by=actor, progress_message="Queued")
        call_command("run_audit_worker", "--once", verbosity=0)
        run.refresh_from_db()
        self.stdout.write(f"Audit for {system.name}: {run.status}")
