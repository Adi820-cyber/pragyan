import uuid
from django.db import models
from apps.core.models import TenantScopedModel, OrgUnit, Membership
from apps.risk.models import Risk


class Framework(models.Model):
    """
    Compliance and security framework catalog (e.g. NIST CSF 2.0, ISO 27001:2022, SOC 2, CIS Controls v8).
    Can be a system-level built-in standard (CC0/Public Domain/Permissive) or tenant-specific.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, blank=True, db_index=True)  # Null if system-wide standard
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, db_index=True)
    version = models.CharField(max_length=50)
    publisher = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reskure_framework"
        unique_together = ("tenant_id", "code", "version")

    def __str__(self):
        return f"{self.name} v{self.version} ({self.code})"


class Control(models.Model):
    """
    Individual requirement or security control within a framework.
    """
    STATUS_CHOICES = [
        ("NOT_STARTED", "Not Started"),
        ("IN_PROGRESS", "In Progress"),
        ("IMPLEMENTED", "Implemented & Operating"),
        ("EXEMPT", "Exempt / Accepted"),
        ("NOT_APPLICABLE", "Not Applicable"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(null=True, blank=True, db_index=True)  # Null if system reference
    framework = models.ForeignKey(Framework, on_delete=models.CASCADE, related_name="controls")
    domain = models.CharField(max_length=150, blank=True)
    code = models.CharField(max_length=50, db_index=True)  # e.g., AC-1, PR.AC-01, 1.1
    title = models.CharField(max_length=255)
    description = models.TextField()
    implementation_guidance = models.TextField(blank=True)
    
    # State tracking per tenant
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="NOT_STARTED")
    owner_org_unit = models.ForeignKey(
        OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name="controls"
    )
    owner = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_controls"
    )

    class Meta:
        db_table = "reskure_control"
        unique_together = ("framework", "code", "tenant_id")
        ordering = ["framework", "code"]

    def __str__(self):
        return f"{self.framework.code} [{self.code}] {self.title}"


class ControlRiskMapping(models.Model):
    """
    Bi-directional mapping between Risks and Mitigating Controls.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.UUIDField(db_index=True)
    control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="risk_mappings")
    risk = models.ForeignKey(Risk, on_delete=models.CASCADE, related_name="control_mappings")
    mitigation_weight = models.PositiveSmallIntegerField(default=100)  # Percentage efficacy

    class Meta:
        db_table = "reskure_control_risk_mapping"
        unique_together = ("tenant_id", "control", "risk")


class FrameworkCrosswalk(models.Model):
    """
    Cross-framework mapping (e.g. NIST CSF 2.0 PR.AC-1 -> ISO 27001:2022 A.9.1.1).
    Enables 'Assess Once, Comply with Many'.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="source_mappings")
    target_control = models.ForeignKey(Control, on_delete=models.CASCADE, related_name="target_mappings")
    relationship = models.CharField(max_length=50, default="EQUIVALENT")  # EQUIVALENT, SUBSET, SUPERSET, RELATED

    class Meta:
        db_table = "reskure_framework_crosswalk"
        unique_together = ("source_control", "target_control")
