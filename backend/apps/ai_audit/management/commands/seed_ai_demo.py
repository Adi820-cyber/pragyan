import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.ai_audit.services.demo import seed_hirelens
from apps.core.models import Membership, Tenant

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

    @transaction.atomic
    def handle(self, *args, **options):
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

        system = seed_hirelens(tenant, memberships["founder@hirelens.example"])

        self.stdout.write(self.style.SUCCESS("Demo organisation ready."))
        self.stdout.write(f"  Tenant id : {tenant.id}")
        self.stdout.write(f"  System    : {system.name}")
        self.stdout.write("  Users (all synthetic):")
        for username, role, _ in USERS:
            self.stdout.write(f"    {username}  [{role}]")
        if options["password"]:
            self.stdout.write("  Password  : the one you supplied")
        else:
            self.stdout.write(f"  Password  : {password}   (shown once; existing users keep their old password)")
