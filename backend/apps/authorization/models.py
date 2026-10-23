import uuid
from django.db import models
from apps.core.models import TenantScopedModel, Tenant


class Permission(models.Model):
    """
    Standard coarse-grained permission token (e.g. risk.read, risk.approve, control.attest).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True, db_index=True)
    category = models.CharField(max_length=50)  # risk, compliance, evidence, secops, audit, tenant
    description = models.TextField(blank=True)

    class Meta:
        db_table = "reskure_permission"
        ordering = ["category", "code"]

    def __str__(self):
        return f"{self.code} ({self.category})"


class CustomRole(TenantScopedModel):
    """
    Tenant-specific custom role for enterprise RBAC.
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    permissions = models.ManyToManyField(Permission, related_name="custom_roles", blank=True)

    class Meta:
        db_table = "reskure_custom_role"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="unique_custom_role_name_per_tenant",
            )
        ]

    def __str__(self):
        return f"{self.name} (Tenant: {self.tenant_id})"


class SystemRoleDefaultPermission(models.Model):
    """
    Default permission matrix for standard system roles (TENANT_ADMIN, COMPLIANCE_OFFICER, etc.).
    """
    role = models.CharField(max_length=30, db_index=True)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        db_table = "reskure_system_role_permission"
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission"],
                name="unique_system_role_permission",
            )
        ]


class PolicyRule(TenantScopedModel):
    """
    Fine-grained ABAC and Segregation of Duties (SoD) policy rules.
    Evaluated by the central Policy Engine.
    """
    RULE_KINDS = [
        ("ABAC_SCOPING", "Attribute-Based Scoping"),
        ("SEGREGATION_OF_DUTIES", "Segregation of Duties (SoD)"),
        ("APPROVAL_CONSTRAINT", "Approval Constraint"),
    ]

    EFFECT_CHOICES = [
        ("ALLOW", "Allow"),
        ("DENY", "Deny"),
    ]

    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=30, choices=RULE_KINDS)
    target_resource = models.CharField(max_length=100, db_index=True)  # e.g., 'risk', 'control', 'evidence'
    target_action = models.CharField(max_length=100, db_index=True)    # e.g., 'approve', 'attest', 'close'
    effect = models.CharField(max_length=10, choices=EFFECT_CHOICES, default="DENY")
    
    # JSON-encoded rule expression:
    # Example SoD: {"field_equals": {"actor_id": "resource.requester_id"}} -> DENY
    # Example ABAC: {"field_in": {"actor.org_unit_id": "resource.authorized_org_units"}} -> ALLOW
    rule_definition = models.JSONField(default=dict)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "reskure_policy_rule"

    def __str__(self):
        return f"[{self.kind}] {self.name} -> {self.effect}"
