import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.ai_audit.sample.compas import RealDataUnavailable
from apps.ai_audit.services.demo import seed_audit_runs, seed_compas, seed_finsum, seed_hirelens
from apps.cloud_security.views import seed_demo_cloud
from apps.core.models import Membership, Tenant
from apps.network.models import NetworkDevice
from apps.network.traversal_engine import seed_demo_network

USERS = [
    # (username, role, full name)
    ("admin@hirelens.example", "TENANT_ADMIN", "Operations Admin"),
    ("founder@hirelens.example", "RISK_OWNER", "Asha Rao (ML lead)"),
    ("advisor@hirelens.example", "COMPLIANCE_OFFICER", "Vikram Shah (external advisor)"),
]


class Command(BaseCommand):
    help = "Creates the synthetic HireLens demo organisation, three demo users and sample audit inputs."

    def add_arguments(self, parser):
        parser.add_argument("--password", help="Password for the demo users. A random one is generated if omitted.")
        parser.add_argument("--compas-file", help="Path to compas-scores-two-years.csv if the automatic download is not possible.")
        parser.add_argument("--offline", action="store_true", help="Skip the real-data download and use the synthetic tabular sample instead.")

    def handle(self, *args, **options):
        with transaction.atomic():
            systems, tenant, memberships, founder, password = self._seed_base(options)
        self._seed_rest(options, systems, tenant, memberships, founder, password)

    def _seed_base(self, options):
        User = get_user_model()
        password = options["password"] or secrets.token_urlsafe(12)
        tenant, _ = Tenant.objects.get_or_create(slug="hirelens-demo", defaults={"name": "HireLens (demo)"})

        memberships = {}
        for username, role, full_name in USERS:
            user, created = User.objects.get_or_create(username=username, defaults={"email": username})
            if created or options["password"]:
                user.set_password(password)
                user.email = username
                user.save()
            membership, _ = Membership.all_objects.update_or_create(
                tenant=tenant, email=username,
                defaults={"user": user, "full_name": full_name, "role": role, "status": "ACTIVE"},
            )
            memberships[username] = membership

        founder = memberships["founder@hirelens.example"]
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

        return systems, tenant, memberships, founder, password

    def _seed_rest(self, options, systems, tenant, memberships, founder, password):
        # Completed audits, computed by the real audit engine from the stored sample data. Run outside the
        # base transaction so the long computation does not hold the database write lock.
        for system in systems:
            versions = ("v1", "v2") if system.system_type == "llm" else (("v1", "v2") if system.name.startswith("HireLens") else ("tool", "v1"))
            for run in seed_audit_runs(tenant, founder, system, versions):
                run.refresh_from_db()
                self.stdout.write(f"  Audit     : {system.name} {run.model_version.version_label} -> {run.status}")

        if not NetworkDevice.all_objects.filter(tenant_id=tenant.id).exists():
            seed_demo_network(tenant)
            self.stdout.write("  Network   : sample enterprise network loaded (synthetic)")
        seed_demo_cloud(memberships["admin@hirelens.example"])
        self.stdout.write("  Cloud     : sample accounts and simulated scans present (no cloud calls)")

        self.stdout.write(self.style.SUCCESS("Demo organisation ready."))
        self.stdout.write(f"  Tenant id : {tenant.id}")
        for system in systems:
            self.stdout.write(f"  System    : {system.name} ({system.system_type})")
        self.stdout.write("  Users (all synthetic):")
        for username, role, _ in USERS:
            self.stdout.write(f"    {username}  [{role}]")
        if options["password"]:
            self.stdout.write("  Password  : the one you supplied")
        else:
            self.stdout.write(f"  Password  : {password}   (shown once; existing users keep their old password)")
