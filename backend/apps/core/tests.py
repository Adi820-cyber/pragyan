from django.test import TestCase
from apps.core.models import Tenant, OrgUnit, Membership, AccessDecisionLog
from apps.core.context import set_current_tenant_id
from apps.authorization.engine import PolicyEngine
from apps.risk.models import Risk, RiskMatrixConfig
from apps.evidence.models import Evidence, Attestation
from apps.workflows.models import ApprovalRequest, ApprovalStep, ApprovalDecision
from django.core.exceptions import ValidationError


class ReskureCoreArchitectureTests(TestCase):
    def setUp(self):
        # Create two distinct tenants to test hard isolation
        self.tenant_a = Tenant.objects.create(name="Tenant Alpha", slug="alpha")
        self.tenant_b = Tenant.objects.create(name="Tenant Beta", slug="beta")

        # Memberships
        self.admin_a = Membership.objects.create(
            tenant=self.tenant_a, email="admin@alpha.com", role="TENANT_ADMIN"
        )
        self.analyst_a = Membership.objects.create(
            tenant=self.tenant_a, email="analyst@alpha.com", role="CONTRIBUTOR"
        )
        self.auditor_a = Membership.objects.create(
            tenant=self.tenant_a, email="auditor@alpha.com", role="AUDITOR"
        )

        self.user_b = Membership.objects.create(
            tenant=self.tenant_b, email="user@beta.com", role="TENANT_ADMIN"
        )

    def test_tenant_isolation_at_data_layer(self):
        """Verify that TenantScopedModel manager strictly filters by current_tenant_id."""
        set_current_tenant_id(self.tenant_a.id)
        Risk.objects.create(title="Alpha Risk 1", tenant=self.tenant_a)

        set_current_tenant_id(self.tenant_b.id)
        Risk.objects.create(title="Beta Risk 1", tenant=self.tenant_b)

        # In context of Tenant A, only Alpha risks are returned
        set_current_tenant_id(self.tenant_a.id)
        alpha_risks = Risk.objects.all()
        self.assertEqual(alpha_risks.count(), 1)
        self.assertEqual(alpha_risks.first().title, "Alpha Risk 1")

        # In context of Tenant B, only Beta risks are returned
        set_current_tenant_id(self.tenant_b.id)
        beta_risks = Risk.objects.all()
        self.assertEqual(beta_risks.count(), 1)
        self.assertEqual(beta_risks.first().title, "Beta Risk 1")

    def test_cross_tenant_denial_in_policy_engine(self):
        """Cross-tenant operations must be rejected immediately with audit log."""
        set_current_tenant_id(self.tenant_a.id)
        risk_a = Risk.objects.create(title="Alpha Secret Risk", tenant=self.tenant_a)

        # Actor from Tenant B tries to access Tenant A resource
        decision = PolicyEngine.evaluate(actor=self.user_b, permission_code="risk.read", resource=risk_a)
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.decision_code, "DENY_CROSS_TENANT")

        # Verify decision was immutably logged
        log = AccessDecisionLog.objects.filter(actor_email="user@beta.com").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.decision, "DENY")
        self.assertIn("Hard Tenant Isolation violation", log.reason)

    def test_segregation_of_duties_requester_cannot_approve(self):
        """Requester/Creator cannot approve their own item."""
        set_current_tenant_id(self.tenant_a.id)
        risk = Risk.objects.create(
            title="Production Port Open",
            tenant=self.tenant_a,
            requester=self.analyst_a,
        )

        decision = PolicyEngine.evaluate(
            actor=self.analyst_a, permission_code="risk.approve", resource=risk
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.decision_code, "DENY_SOD_VIOLATION")
        self.assertIn("Requester/Creator is strictly prohibited", decision.reason)

    def test_segregation_of_duties_evidence_uploader_cannot_attest(self):
        """Evidence uploader cannot attest to their own evidence artifact."""
        set_current_tenant_id(self.tenant_a.id)
        evidence = Evidence.objects.create(
            tenant=self.tenant_a,
            title="Firewall Config Backup",
            storage_key="s3://evidence/fw.json",
            file_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            uploaded_by=self.analyst_a,
        )

        # Attestation by same user must raise ValidationError
        with self.assertRaises(ValidationError):
            Attestation.objects.create(
                tenant=self.tenant_a,
                evidence=evidence,
                attested_by=self.analyst_a,
                decision="VERIFIED",
                comments="Looks good to me",
            )

    def test_risk_scoring_matrix_default_and_calculation(self):
        """Default 5x5 multiplication (likelihood x impact = 1..25)."""
        set_current_tenant_id(self.tenant_a.id)
        risk = Risk.objects.create(
            tenant=self.tenant_a,
            title="Unpatched Edge Vulnerability",
            inherent_likelihood=4,
            inherent_impact=5,
            residual_likelihood=2,
            residual_impact=2,
        )
        self.assertEqual(risk.inherent_score, 20)  # 4 * 5
        self.assertEqual(risk.inherent_severity, "CRITICAL")
        self.assertEqual(risk.residual_score, 4)   # 2 * 2
        self.assertEqual(risk.residual_severity, "LOW")
