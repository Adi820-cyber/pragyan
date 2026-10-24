from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.ai_audit import models as ai_models
from apps.ai_audit.sample.compas import RealDataUnavailable
from apps.ai_audit.sample.llm_sample import DEMO_LLM_CONFIG
from apps.ai_audit.services import runner
from apps.ai_audit.services.demo import DEMO_CONFIG, seed_compas, seed_finsum, seed_hirelens
from apps.core.models import Membership, Tenant

DEFAULT_DEMO_PASSWORD = "Password123!"

USERS = [
    # (username, email, role, full_name, is_superuser)
    ("admin", "admin@reskure.local", "TENANT_ADMIN", "Operations Admin", True),
    ("admin@hirelens.example", "admin@hirelens.example", "TENANT_ADMIN", "Operations Admin", False),
    ("founder@hirelens.example", "founder@hirelens.example", "RISK_OWNER", "Asha Rao (ML lead)", False),
    ("advisor@hirelens.example", "advisor@hirelens.example", "COMPLIANCE_OFFICER", "Vikram Shah (external advisor)", False),
]


def _seed_completed_runs(tenant, system, creator):
    """Ensure sample systems have completed baseline audit runs so dashboards and reports are populated on first login."""
    if ai_models.AuditRun.all_objects.filter(system=system, status="completed").exists():
        return
    versions = list(ai_models.ModelVersion.all_objects.filter(system=system).order_by("version_label"))
    datasets = list(ai_models.Dataset.all_objects.filter(system=system))
    for mv in versions[:2]:
        ref = next(
            (d for d in datasets if d.role == "reference" and (f"({mv.version_label}" in d.name or len(versions) == 3)),
            next((d for d in datasets if d.role == "reference"), None),
        )
        cur = next(
            (d for d in datasets if d.role == "current" and (f"({mv.version_label}" in d.name or len(versions) == 3)),
            next((d for d in datasets if d.role == "current"), None),
        )
        if not ref:
            continue
        if system.system_type == "llm":
            cfg = dict(DEMO_LLM_CONFIG)
        elif ref.sample_config and "by_version" in ref.sample_config:
            cfg = dict(ref.sample_config["by_version"].get(mv.version_label, {}))
        else:
            cfg = dict(DEMO_CONFIG)
        cfg["bootstrap"] = 100
        run = ai_models.AuditRun.all_objects.create(
            tenant=tenant,
            system=system,
            model_version=mv,
            reference_dataset=ref,
            current_dataset=cur,
            config=cfg,
            status="running",
            started_at=timezone.now(),
            heartbeat_at=timezone.now(),
            progress=1,
            progress_message="Starting",
            created_by=creator,
        )
        runner.execute(run.id)


def _seed_cloud_and_network_demos(tenant, admin_membership):
    """Pre-seed Cloud Security (Prowler) and Network (NetBox Packet Tracer) demo data for the tenant."""
    try:
        from apps.cloud_security.engine.rules import PROWLER_RULES_CATALOG
        from apps.cloud_security.engine.scanner import CloudScannerEngine
        from apps.cloud_security.models import CloudAccount, CloudScan, ProwlerRule

        for r in PROWLER_RULES_CATALOG:
            ProwlerRule.objects.get_or_create(
                check_id=r["check_id"],
                defaults={
                    "provider": r["provider"],
                    "service": r["service"],
                    "title": r["title"],
                    "severity": r["severity"],
                    "description": r["description"],
                    "rationale": r.get("rationale", ""),
                    "remediation_text": r.get("remediation_text", ""),
                    "remediation_url": r.get("remediation_url", ""),
                    "remediation_code_sample": r.get("remediation_code_sample", ""),
                    "compliance_frameworks": r.get("compliance_frameworks", []),
                },
            )

        if not CloudAccount.all_objects.filter(tenant=tenant).exists():
            accounts_spec = [
                ("AWS", "123456789012", "Production AWS Workloads (US-East)", "us-east-1", "arn:aws:iam::123456789012:role/ReskureProwlerAuditorRole", "Primary enterprise Kubernetes & database clusters"),
                ("AZURE", "sub-4f81-9b2e-0012", "Azure Enterprise Data Platform", "westeurope", "sp-reskure-secops-auditor", "Data analytics, PowerBI pipelines and storage lakes"),
                ("GCP", "prj-finance-lake-prod", "GCP Cloud SQL & AI Pipeline", "us-central1", "reskure-agent@prj-finance-lake-prod.iam.gserviceaccount.com", "AI models, Cloud Storage datasets and internal analytics"),
            ]
            for prov, acc_id, name, reg, role_arn, notes in accounts_spec:
                acc, _ = CloudAccount.all_objects.get_or_create(
                    tenant=tenant,
                    provider=prov,
                    account_id=acc_id,
                    defaults={
                        "name": name,
                        "region_default": reg,
                        "role_arn": role_arn,
                        "environment": "PRODUCTION",
                        "status": "CONNECTED",
                        "created_by": admin_membership,
                        "notes": notes,
                    },
                )
                scan = CloudScan.all_objects.create(
                    tenant=tenant,
                    account=acc,
                    scan_type="FULL_AUDIT",
                    status="QUEUED",
                    initiated_by=admin_membership,
                )
                CloudScannerEngine.execute_scan(str(scan.id))
    except Exception:
        pass

    try:
        from apps.network.models import NetworkDevice
        from apps.network.traversal_engine import seed_demo_network

        if not NetworkDevice.all_objects.filter(tenant=tenant).exists():
            seed_demo_network(tenant)
    except Exception:
        pass


class Command(BaseCommand):
    help = "Creates the synthetic HireLens demo organisation, demo users (including 'admin'), sample AI audits, cloud scans, and network topology."

    def add_arguments(self, parser):
        parser.add_argument("--password", help="Password for the demo users. Defaults to 'Password123!' if omitted.")
        parser.add_argument("--compas-file", help="Path to compas-scores-two-years.csv if the automatic download is not possible.")
        parser.add_argument("--offline", action="store_true", help="Skip the real-data download and use the synthetic tabular sample instead.")
        parser.add_argument("--skip-runs", action="store_true", help="Skip executing initial baseline audit runs during seed.")

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        password = options["password"] or DEFAULT_DEMO_PASSWORD
        tenant, _ = Tenant.objects.get_or_create(slug="hirelens-demo", defaults={"name": "HireLens (demo)"})

        memberships = {}
        for username, email, role, full_name, is_super in USERS:
            user, created = User.objects.get_or_create(username=username, defaults={"email": email})
            user.set_password(password)
            user.email = email
            if is_super:
                user.is_staff = True
                user.is_superuser = True
            user.save()
            membership, _ = Membership.all_objects.update_or_create(
                tenant=tenant,
                email=email,
                defaults={"user": user, "full_name": full_name, "role": role, "status": "ACTIVE"},
            )
            memberships[username] = membership

        founder = memberships["founder@hirelens.example"]
        admin_member = memberships["admin"]
        systems = [seed_finsum(tenant, founder)]
        if options["offline"]:
            systems.append(seed_hirelens(tenant, founder))
        else:
            try:
                systems.append(seed_compas(tenant, founder, options["compas_file"]))
            except RealDataUnavailable as exc:
                self.stdout.write(self.style.WARNING(f"Real data not loaded: {exc}"))
                self.stdout.write(self.style.WARNING("Loading the synthetic tabular sample instead."))
                systems.append(seed_hirelens(tenant, founder))

        if not options["skip_runs"]:
            for sys_obj in systems:
                _seed_completed_runs(tenant, sys_obj, founder)

        _seed_cloud_and_network_demos(tenant, admin_member)

        self.stdout.write(self.style.SUCCESS("Demo organisation ready."))
        self.stdout.write(f"  Tenant id : {tenant.id}")
        for system in systems:
            self.stdout.write(f"  System    : {system.name} ({system.system_type})")
        self.stdout.write("  Users (all synthetic):")
        for username, _, role, _, _ in USERS:
            self.stdout.write(f"    {username}  [{role}]")
        self.stdout.write(f"  Password  : {password}")
