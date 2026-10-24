"""Adds a named demo team to the HireLens demo organisation and a realistic findings workflow state.

People (all synthetic, same password):
  Priya Nair   COMPLIANCE_OFFICER  assigns findings and approves fixes ("ai." permissions, includes ai.assign / ai.review)
  Rohan Mehta  RISK_OWNER          fixes findings assigned to him (ai.read / ai.update / ai.comment)
  Ananya Iyer  AUDITOR             read-only reviewer: can read and comment, cannot assign, fix or approve
  admin@hirelens.example (TENANT_ADMIN) already exists and is left as it is.

The scenario only uses findings that real completed audits produced. It changes who owns them, their due dates and
their workflow status; titles, descriptions and severities are never touched. The command is safe to run again:
the scenario is applied once, and users are only re-created or re-passworded, never duplicated.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.ai_audit import models as m
from apps.core.models import Membership, Tenant

DEFAULT_PASSWORD = "Demo-Pass-2026"
TEAM = [
    ("priya.nair@hirelens.example", "COMPLIANCE_OFFICER", "Priya Nair"),
    ("rohan.mehta@hirelens.example", "RISK_OWNER", "Rohan Mehta"),
    ("ananya.iyer@hirelens.example", "AUDITOR", "Ananya Iyer"),
]
SEVERITY_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
FIX_NOTES = {
    "bias": "Reviewed the affected groups and agreed a mitigation with the model owner. Details are in the linked evidence.",
    "privacy": "Removed the flagged personal data from the logged fields and confirmed the change in the linked evidence.",
    "governance": "Completed the missing item and recorded the proof in the linked evidence.",
    "drift": "Reviewed the changed measures and documented the decision in the linked evidence.",
    "grounding": "Updated the pipeline so the flagged outputs are traceable. Details are in the linked evidence.",
    "explainability": "Documented the explanation approach and checked it against the model. See the linked evidence.",
}


class Command(BaseCommand):
    help = "Creates the demo team (Priya, Rohan, Ananya) and a findings workflow starting state for the hirelens-demo tenant."

    def add_arguments(self, parser):
        parser.add_argument("--password", help=f"Password for the team users (default: {DEFAULT_PASSWORD}).")
        parser.add_argument("--tenant", default="hirelens-demo", help="Tenant slug (default: hirelens-demo).")

    @transaction.atomic
    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(slug=options["tenant"]).first()
        if tenant is None:
            raise CommandError(f"Tenant '{options['tenant']}' does not exist. Run seed_ai_demo first.")
        password = options["password"] or DEFAULT_PASSWORD
        User = get_user_model()
        people = {}
        for email, role, full_name in TEAM:
            user, _ = User.objects.get_or_create(username=email, defaults={"email": email})
            user.email = email
            user.set_password(password)
            user.save()
            people[email] = Membership.all_objects.update_or_create(
                tenant=tenant, email=email,
                defaults={"user": user, "full_name": full_name, "role": role, "status": "ACTIVE"},
            )[0]
            self.stdout.write(f"  {full_name:<12} {email}  [{role}]")
        self._scenario(tenant, people["priya.nair@hirelens.example"], people["rohan.mehta@hirelens.example"],
                       people["ananya.iyer@hirelens.example"])
        self.stdout.write(self.style.SUCCESS(f"Demo team ready. Password: {password}"))

    # ------------------------------------------------------------------ scenario
    def _scenario(self, tenant, priya, rohan, ananya):
        # Older audit runs gave every finding the system owner by default. Nobody chose that, so those untouched
        # findings become unassigned and wait for a compliance officer to assign them.
        untouched = [f.id for f in m.Finding.all_objects.filter(tenant=tenant, status="open", assigned_by__isnull=True, owner__isnull=False)
                     if not f.events.exclude(action="created").exists()]
        m.Finding.all_objects.filter(id__in=untouched).update(owner=None)
        if m.FindingEvent.all_objects.filter(tenant=tenant, action__in=["assign", "reassign"]).exists():
            self.stdout.write("  Findings scenario already applied; leaving findings as they are.")
            return
        pool = []
        for system in m.AISystem.all_objects.filter(tenant=tenant).exclude(status="ARCHIVED"):
            run = m.AuditRun.all_objects.filter(system=system, status="completed").order_by("-finished_at").first()
            if run is None:
                continue
            for f in m.Finding.all_objects.filter(run=run, status="open", assigned_by__isnull=True):
                if f.events.exclude(action="created").exists():
                    continue
                pool.append(f)
        if not pool:
            self.stdout.write(self.style.WARNING("  No open findings from completed audits yet; run an audit, then run this again."))
            return
        pool.sort(key=lambda f: (SEVERITY_RANK[f.severity], f.system.name, f.title))
        # Spread the scenario across categories so the demo shows different kinds of finding.
        picked, seen = [], set()
        for f in pool:
            if f.category not in seen:
                picked.append(f)
                seen.add(f.category)
        picked += [f for f in pool if f not in picked]
        # Everything starts unassigned; the audit runner no longer defaults an owner, older rows may have one.
        m.Finding.all_objects.filter(id__in=[f.id for f in pool]).update(owner=None)

        now = timezone.now()
        today = date.today()
        plans = [
            # (key, due offset, priority, final state)
            ("in_progress", 7, "high", "in_remediation"),
            ("overdue", -5, "critical", "open"),
            ("ready", 14, "medium", "submitted"),
            ("closed", 10, "medium", "resolved"),
        ]
        for (key, offset, priority, final), finding in zip(plans, picked):
            self._story(finding, key, offset, priority, final, priya, rohan, ananya, now, today)
        if len(picked) > 4:
            comment_on = picked[4]
            self._event(comment_on, ananya, "comment", "open", "open", "Noting this for the next review meeting.", now - timedelta(hours=5))
        self.stdout.write(f"  Findings scenario applied to {min(len(picked), 4)} real findings; {max(len(pool) - 4, 0)} stay unassigned.")

    def _event(self, finding, actor, action, frm, to, comment, at):
        m.FindingEvent.all_objects.create(
            tenant_id=finding.tenant_id, finding=finding, actor=actor, action=action,
            from_status=frm, to_status=to, comment=comment, created_at=at,
        )

    def _story(self, finding, key, offset, priority, final, priya, rohan, ananya, now, today):
        due = today + timedelta(days=offset)
        assigned_at = now - timedelta(days=12 if key in ("closed", "ready") else 8)
        fields = dict(owner=rohan, due_date=due, priority=priority, assigned_by=priya, assigned_at=assigned_at)
        self._event(finding, priya, "assign", "open", "open",
                    f"Assigned to {rohan.full_name}, due {due.strftime('%d %b %Y')}, priority {priority}.", assigned_at)
        status = "open"
        if final in ("in_remediation", "submitted", "resolved"):
            status = "in_remediation"
            fields["status"] = status
            self._event(finding, rohan, "start", "open", status, "Picked this up.", assigned_at + timedelta(days=1))
        if final in ("submitted", "resolved"):
            m.FindingAttachment.all_objects.create(
                tenant_id=finding.tenant_id, finding=finding, kind="link", title="Remediation evidence (demo link)",
                url="https://example.org/reskure-demo/evidence", uploaded_by=rohan,
                created_at=assigned_at + timedelta(days=2),
            )
            self._event(finding, rohan, "evidence_added", status, status, "Link attached: Remediation evidence (demo link)", assigned_at + timedelta(days=2))
            self._event(finding, ananya, "comment", status, status, "Can you confirm the scope covers both reference and current data?", assigned_at + timedelta(days=2, hours=3))
            note = FIX_NOTES.get(finding.category, "Fixed and documented in the linked evidence.")
            fields.update(status="submitted", submitted_by=rohan, remediation_note=note)
            self._event(finding, rohan, "submit", status, "submitted", note, assigned_at + timedelta(days=3))
            status = "submitted"
        if final == "resolved":
            decided = assigned_at + timedelta(days=4)
            comment = "Evidence checked against the audit result. Closing."
            fields.update(status="resolved", reviewed_by=priya, reviewed_at=decided, review_comment=comment)
            self._event(finding, priya, "resolve", "submitted", "resolved", comment, decided)
        m.Finding.all_objects.filter(id=finding.id).update(**fields)
