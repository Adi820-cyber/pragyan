from django.core.management.base import BaseCommand
from django.db import transaction

from apps.ai_audit.services.demo import seed_compas, seed_german_credit
from apps.core.models import Membership, Tenant


class Command(BaseCommand):
    help = "Seeds real public datasets (Kaggle German Credit and ProPublica COMPAS) across all active tenants."

    def handle(self, *args, **options):
        tenants = Tenant.objects.filter(status="ACTIVE")
        self.stdout.write(f"Seeding real datasets for {tenants.count()} tenant(s)...")

        for tenant in tenants:
            actor = (
                Membership.all_objects.filter(tenant=tenant, status="ACTIVE", role="TENANT_ADMIN").first()
                or Membership.all_objects.filter(tenant=tenant, status="ACTIVE").first()
            )
            if not actor:
                self.stdout.write(self.style.WARNING(f"Skipping {tenant.name}: no active member found."))
                continue

            self.stdout.write(f"\nProcessing tenant: {tenant.name} (admin: {actor.email})")

            # 1. Seed Kaggle German Credit Real Dataset
            try:
                gc_system = seed_german_credit(tenant, actor)
                self.stdout.write(self.style.SUCCESS(f"  + Added: {gc_system.name} (id={gc_system.id})"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  - German Credit error: {e}"))

            # 2. Seed ProPublica COMPAS Real Dataset
            try:
                compas_system = seed_compas(tenant, actor)
                self.stdout.write(self.style.SUCCESS(f"  + Added: {compas_system.name} (id={compas_system.id})"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  - COMPAS note/error: {e}"))

        self.stdout.write(self.style.SUCCESS("\nAll real public datasets successfully seeded into Reskure!"))
