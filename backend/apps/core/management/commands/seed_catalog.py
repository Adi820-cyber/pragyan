from django.core.management.base import BaseCommand
from django.db import transaction
from apps.core.models import Tenant, OrgUnit, Membership
from apps.core.context import set_current_tenant_id
from apps.authorization.models import Permission, SystemRoleDefaultPermission
from apps.compliance.models import Framework, Control
from apps.risk.models import Risk, RiskMatrixConfig
from apps.secops.models import AlertSource, SecurityAlert
from apps.assets.models import CloudConnection, BusinessService, Asset


class Command(BaseCommand):
    help = "Seeds initial permissions, default system roles, NIST CSF 2.0 framework, and demo tenant."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Starting Reskure initial catalog & data seed...")

        # 1. Seed Permissions
        permissions_data = [
            ("tenant.manage", "tenant", "Manage tenant settings, memberships, and billing"),
            ("risk.read", "risk", "View risk register items and scoring matrices"),
            ("risk.create", "risk", "Create new identified risks"),
            ("risk.update", "risk", "Update risk details and treatment plans"),
            ("risk.approve", "risk", "Approve risk treatment or formal risk acceptance"),
            ("risk.delete", "risk", "Delete or archive risks"),
            ("control.read", "compliance", "View compliance frameworks and controls"),
            ("control.create", "compliance", "Define custom security controls"),
            ("control.update", "compliance", "Update control implementation statements"),
            ("control.audit", "compliance", "Conduct formal control audits"),
            ("evidence.read", "evidence", "View and download compliance evidence files"),
            ("evidence.upload", "evidence", "Upload evidence files and automated collector output"),
            ("evidence.verify", "evidence", "Attest and verify evidence adequacy (SoD enforced)"),
            ("secops.read", "secops", "View normalized security alerts and sources"),
            ("secops.triage", "secops", "Triage alerts and mark false positives"),
            ("secops.contain", "secops", "Initiate host isolation, credential revocation, or IP blocks"),
            ("workflow.read", "workflows", "View approval requests and workflows"),
            ("workflow.approve", "workflows", "Record approval/rejection decisions"),
            ("audit.read", "audit", "Read immutable audit logs"),
            ("audit.export", "audit", "Export cryptographic compliance and audit reports"),
        ]

        created_perms = {}
        for code, category, desc in permissions_data:
            perm, _ = Permission.objects.get_or_create(
                code=code, defaults={"category": category, "description": desc}
            )
            created_perms[code] = perm

        self.stdout.write(f"[OK] Seeded {len(created_perms)} permissions.")

        # 2. Seed System Role Default Permissions
        role_assignments = {
            "TENANT_ADMIN": list(created_perms.keys()),
            "COMPLIANCE_OFFICER": [
                "risk.read", "risk.create", "risk.update", "control.read", "control.create",
                "control.update", "evidence.read", "evidence.verify", "secops.read",
                "workflow.read", "workflow.approve", "audit.read", "audit.export",
            ],
            "RISK_OWNER": [
                "risk.read", "risk.create", "risk.update", "control.read",
                "evidence.read", "evidence.upload", "workflow.read",
            ],
            "AUDITOR": [
                "risk.read", "control.read", "evidence.read", "secops.read",
                "workflow.read", "audit.read", "audit.export",
            ],
            "CONTRIBUTOR": [
                "risk.read", "control.read", "evidence.upload", "workflow.read",
            ],
        }

        for role, perm_codes in role_assignments.items():
            for code in perm_codes:
                SystemRoleDefaultPermission.objects.get_or_create(
                    role=role, permission=created_perms[code]
                )

        self.stdout.write("[OK] Seeded system role permission matrices.")

        # 3. Seed NIST CSF 2.0 (Clean-room public domain standard)
        nist_framework, _ = Framework.objects.get_or_create(
            code="NIST_CSF_2.0",
            version="2.0",
            tenant_id=None,
            defaults={
                "name": "NIST Cybersecurity Framework 2.0",
                "publisher": "National Institute of Standards and Technology (NIST)",
                "description": "NIST CSF 2.0 organized into six core functions: Govern, Identify, Protect, Detect, Respond, Recover.",
                "is_system": True,
            },
        )

        nist_controls = [
            ("Govern (GV)", "GV.OC-01", "Organizational Context", "The organizational context, mission, and stakeholders are understood and inform cybersecurity risk management."),
            ("Govern (GV)", "GV.RM-01", "Risk Management Strategy", "Cybersecurity risk management objectives, priorities, and risk tolerance are established and communicated."),
            ("Govern (GV)", "GV.SC-01", "Supply Chain Risk Management", "A cybersecurity supply chain risk management program is established and integrated into organizational processes."),
            ("Identify (ID)", "ID.AM-01", "Asset Inventory", "Inventories of hardware, software, services, and systems are maintained and managed."),
            ("Identify (ID)", "ID.RA-01", "Risk Assessment", "Vulnerabilities in assets are identified, validated, and documented."),
            ("Protect (PR)", "PR.AA-01", "Identity & Access Control", "Identities and credentials for authorized users, services, and hardware are managed."),
            ("Protect (PR)", "PR.DS-01", "Data Security", "Data-at-rest and data-in-transit are protected according to the organization's risk strategy."),
            ("Protect (PR)", "PR.PS-01", "Platform Security", "Configuration management practices are applied to harden systems and workloads."),
            ("Detect (DE)", "DE.CM-01", "Continuous Monitoring", "Assets are monitored to identify anomalous events and potential compromises."),
            ("Detect (DE)", "DE.AE-01", "Adverse Event Analysis", "Anomalous events are analyzed to determine whether an incident has occurred."),
            ("Respond (RS)", "RS.MA-01", "Incident Management", "Incident response plans are executed in coordination with relevant stakeholders."),
            ("Respond (RS)", "RS.AN-01", "Incident Analysis", "Investigations are conducted to categorize severity, root cause, and impact."),
            ("Recover (RC)", "RC.RP-01", "Recovery Execution", "Restoration activities are performed to return systems and services to normal operations."),
        ]

        for domain, code, title, desc in nist_controls:
            Control.objects.get_or_create(
                framework=nist_framework,
                code=code,
                tenant_id=None,
                defaults={
                    "domain": domain,
                    "title": title,
                    "description": desc,
                    "implementation_guidance": f"Ensure organizational evidence and technical controls substantiate {code}.",
                },
            )

        self.stdout.write(f"[OK] Seeded NIST CSF 2.0 with {len(nist_controls)} foundational controls.")

        # 4. Seed Demo Tenant: Acme Corp
        tenant, _ = Tenant.objects.get_or_create(
            slug="acme-corp",
            defaults={"name": "Acme Global Financial Technologies", "status": "ACTIVE", "region": "us-east-1"},
        )
        set_current_tenant_id(tenant.id)

        # Risk Matrix Config
        RiskMatrixConfig.objects.get_or_create(
            tenant=tenant,
            defaults={"algorithm": "5X5_MULTIPLICATION", "low_max": 5, "medium_max": 12, "high_max": 19},
        )

        # Org Units
        sec_dept, _ = OrgUnit.objects.get_or_create(
            tenant=tenant, name="Information Security & Trust", defaults={"code": "SEC"}
        )
        eng_dept, _ = OrgUnit.objects.get_or_create(
            tenant=tenant, name="Core Engineering", defaults={"code": "ENG"}
        )

        # Memberships
        admin_member, _ = Membership.objects.get_or_create(
            tenant=tenant, email="ciso@acme.com",
            defaults={"full_name": "Sarah Connor (CISO)", "role": "TENANT_ADMIN", "org_unit": sec_dept},
        )
        compliance_lead, _ = Membership.objects.get_or_create(
            tenant=tenant, email="compliance.lead@acme.com",
            defaults={"full_name": "Marcus Wright", "role": "COMPLIANCE_OFFICER", "org_unit": sec_dept},
        )
        engineer, _ = Membership.objects.get_or_create(
            tenant=tenant, email="lead.dev@acme.com",
            defaults={"full_name": "Kyle Reese", "role": "RISK_OWNER", "org_unit": eng_dept},
        )
        auditor, _ = Membership.objects.get_or_create(
            tenant=tenant, email="external.auditor@pwc-example.com",
            defaults={"full_name": "Independent Auditor", "role": "AUDITOR"},
        )

        # Business Service & Assets
        banking_app, _ = BusinessService.objects.get_or_create(
            tenant=tenant, name="Customer Payment Gateway",
            defaults={"criticality": "CRITICAL", "owner_org_unit": eng_dept},
        )

        aws_conn, _ = CloudConnection.objects.get_or_create(
            tenant=tenant, provider="AWS", account_id="123456789012",
            defaults={"name": "Production AWS Workloads", "role_or_client_arn": "arn:aws:iam::123456789012:role/ReskureAuditorRole"},
        )

        db_asset, _ = Asset.objects.get_or_create(
            tenant=tenant, external_ref="arn:aws:rds:us-east-1:123456789012:db/payment-prod-db",
            defaults={
                "name": "Production Payment Aurora Cluster",
                "asset_type": "DATABASE",
                "provider": "AWS",
                "region": "us-east-1",
                "classification": "RESTRICTED",
                "business_service": banking_app,
                "cloud_connection": aws_conn,
            },
        )

        # Seed Sample Risks
        Risk.objects.get_or_create(
            tenant=tenant,
            identifier="RSK-001",
            defaults={
                "title": "Unencrypted Database Backup in S3",
                "description": "Production database snapshots discovered without AWS KMS customer managed key encryption.",
                "category": "CYBERSECURITY",
                "status": "MITIGATION_PLANNED",
                "inherent_likelihood": 4,
                "inherent_impact": 5,
                "residual_likelihood": 2,
                "residual_impact": 2,
                "owner_org_unit": sec_dept,
                "owner": compliance_lead,
                "requester": engineer,
                "treatment_strategy": "MITIGATE",
                "treatment_plan": "Enforce S3 bucket policy requiring aws:kms encryption header on all PutObject calls.",
            },
        )

        Risk.objects.get_or_create(
            tenant=tenant,
            identifier="RSK-002",
            defaults={
                "title": "Legacy API Key with Overprivileged IAM Permissions",
                "description": "Payment microservice relies on hardcoded IAM credentials with AdministratorAccess.",
                "category": "CYBERSECURITY",
                "status": "IDENTIFIED",
                "inherent_likelihood": 5,
                "inherent_impact": 4,
                "residual_likelihood": 1,
                "residual_impact": 4,
                "owner_org_unit": eng_dept,
                "owner": engineer,
                "requester": engineer,
                "treatment_strategy": "MITIGATE",
                "treatment_plan": "Migrate workload to AWS IAM Roles for Service Accounts (IRSA).",
            },
        )

        # Seed Alert Source & Alert
        alert_src, _ = AlertSource.objects.get_or_create(
            tenant=tenant, name="AWS Security Hub (Prod)",
            defaults={"source_type": "AWS_SECURITY_HUB", "status": "ACTIVE"},
        )

        SecurityAlert.objects.get_or_create(
            tenant=tenant, source=alert_src, external_alert_id="arn:aws:securityhub:us-east-1:123456789012:finding/1a2b3c",
            defaults={
                "title": "S3.1 S3 Block Public Access setting should be enabled",
                "description": "The S3 bucket 'acme-payment-receipts' allows public READ access via bucket policy.",
                "severity": "CRITICAL",
                "status": "NEW",
                "affected_asset": db_asset,
                "raw_normalized_payload": {
                    "resource_id": "acme-payment-receipts",
                    "region": "us-east-1",
                    "compliance_standard": "CIS AWS Foundations Benchmark v1.4.0",
                },
            },
        )

        self.stdout.write(self.style.SUCCESS(
            "[OK] Reskure initial catalog & Acme Corp demo tenant successfully seeded!"
        ))
