import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from apps.core.context import get_current_tenant_id


class Tenant(models.Model):
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("SUSPENDED", "Suspended"),
        ("CLOSED", "Closed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    region = models.CharField(max_length=50, default="us-east-1")
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reskure_tenant"
        verbose_name = "Tenant"
        verbose_name_plural = "Tenants"

    def __str__(self):
        return f"{self.name} ({self.slug})"


class TenantScopedQuerySet(models.QuerySet):
    def filter_by_current_tenant(self):
        tenant_id = get_current_tenant_id()
        if tenant_id:
            return self.filter(tenant_id=tenant_id)
        return self


class TenantScopedManager(models.Manager):
    def get_queryset(self):
        tenant_id = get_current_tenant_id()
        qs = TenantScopedQuerySet(self.model, using=self._db)
        if tenant_id:
            return qs.filter(tenant_id=tenant_id)
        return qs

    def unfiltered(self):
        """Allows explicit system-level bypassing of tenant filter when strictly authorized."""
        return TenantScopedQuerySet(self.model, using=self._db)


class TenantScopedModel(models.Model):
    """
    Abstract base model that enforces tenant_id at the data layer.
    Ensures every business entity is bound to a tenant.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="%(class)s_set",
        db_index=True,
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantScopedManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # Auto-bind tenant from context if not explicitly provided
        if not self.tenant_id:
            context_tenant_id = get_current_tenant_id()
            if context_tenant_id:
                self.tenant_id = context_tenant_id
        super().save(*args, **kwargs)


class OrgUnit(TenantScopedModel):
    """
    Business unit or department hierarchy for scoping resources and access.
    """
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "reskure_org_unit"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name", "parent"],
                name="unique_org_unit_name_per_parent",
            )
        ]

    def __str__(self):
        return f"{self.name} [{self.code}]" if self.code else self.name


class Membership(TenantScopedModel):
    """
    Tenant membership mapping identity to tenant and coarse default role.
    """
    STATUS_CHOICES = [
        ("INVITED", "Invited"),
        ("ACTIVE", "Active"),
        ("SUSPENDED", "Suspended"),
        ("REVOKED", "Revoked"),
    ]

    ROLE_CHOICES = [
        ("TENANT_ADMIN", "Tenant Administrator"),
        ("COMPLIANCE_OFFICER", "Compliance & Security Officer"),
        ("RISK_OWNER", "Risk Owner"),
        ("AUDITOR", "Auditor (Read-Only)"),
        ("CONTRIBUTOR", "Contributor / Employee"),
        ("CUSTOM", "Custom Role"),
    ]

    # Login identity bound to this membership. A user may belong to several tenants.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reskure_memberships",
    )
    email = models.EmailField(db_index=True)
    full_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="CONTRIBUTOR")
    org_unit = models.ForeignKey(
        OrgUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    authz_version = models.PositiveBigIntegerField(default=1)

    class Meta:
        db_table = "reskure_membership"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "email"],
                name="unique_membership_email_per_tenant",
            )
        ]

    def __str__(self):
        return f"{self.email} ({self.role})"


class AuditLog(models.Model):
    """
    Immutable audit log for all data changes and operational events.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, db_index=True)
    actor_id = models.CharField(max_length=255, blank=True, null=True)
    actor_email = models.EmailField(blank=True, null=True)
    action = models.CharField(max_length=100, db_index=True)
    resource_type = models.CharField(max_length=100, db_index=True)
    resource_id = models.CharField(max_length=255, db_index=True)
    payload = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True, editable=False)

    class Meta:
        db_table = "reskure_audit_log"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"[{self.timestamp.isoformat()}] {self.actor_email}: {self.action} on {self.resource_type}:{self.resource_id}"


class AccessDecisionLog(models.Model):
    """
    Immutable log of authorization and permission decisions.
    Required for continuous GRC auditability.
    """
    DECISION_CHOICES = [
        ("ALLOW", "Allow"),
        ("DENY", "Deny"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, db_index=True)
    actor_id = models.CharField(max_length=255)
    actor_email = models.EmailField(blank=True)
    permission = models.CharField(max_length=150, db_index=True)
    resource_type = models.CharField(max_length=100, blank=True)
    resource_id = models.CharField(max_length=255, blank=True)
    decision = models.CharField(max_length=10, choices=DECISION_CHOICES, db_index=True)
    reason = models.TextField(blank=True)
    context_snapshot = models.JSONField(default=dict)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True, editable=False)

    class Meta:
        db_table = "reskure_access_decision_log"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.decision}: {self.actor_email} -> {self.permission} ({self.reason})"
