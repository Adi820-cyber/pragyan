import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import TenantScopedModel, Membership
from apps.assets.models import CloudConnection


class CloudAccount(TenantScopedModel):
    """
    Cloud provider infrastructure account audited by Prowler (AWS, Azure, GCP).
    Can optionally bind to an existing Assets CloudConnection.
    """
    PROVIDER_CHOICES = [
        ("AWS", "Amazon Web Services"),
        ("AZURE", "Microsoft Azure"),
        ("GCP", "Google Cloud Platform"),
    ]

    STATUS_CHOICES = [
        ("CONNECTED", "Active & Connected"),
        ("ERROR", "Authentication / API Error"),
        ("PENDING", "Pending Initial Scan"),
        ("DISABLED", "Disabled"),
    ]

    ENVIRONMENT_CHOICES = [
        ("PRODUCTION", "Production"),
        ("STAGING", "Staging"),
        ("DEVELOPMENT", "Development / Sandbox"),
    ]

    name = models.CharField(max_length=200, help_text="e.g. AWS Production Workloads")
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, db_index=True)
    account_id = models.CharField(
        max_length=150,
        help_text="AWS Account ID (12 digits), Azure Subscription ID, or GCP Project ID",
        db_index=True,
    )
    region_default = models.CharField(max_length=60, default="us-east-1", help_text="Primary scanning region")
    role_arn = models.CharField(
        max_length=300,
        blank=True,
        help_text="AWS IAM Role ARN, Azure Service Principal ID, or GCP Service Account email",
    )
    credentials_ref = models.CharField(
        max_length=255,
        blank=True,
        help_text="Vault/Secrets reference or masked credential identifier",
    )
    environment = models.CharField(max_length=20, choices=ENVIRONMENT_CHOICES, default="PRODUCTION")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    compliance_score = models.FloatField(default=0.0, help_text="Security posture compliance percentage (0-100%)")
    last_scanned_at = models.DateTimeField(null=True, blank=True)
    last_scan_status = models.CharField(max_length=20, blank=True)
    total_findings_count = models.PositiveIntegerField(default=0)
    critical_findings_count = models.PositiveIntegerField(default=0)
    high_findings_count = models.PositiveIntegerField(default=0)
    medium_findings_count = models.PositiveIntegerField(default=0)
    low_findings_count = models.PositiveIntegerField(default=0)
    
    cloud_connection = models.ForeignKey(
        CloudConnection,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prowler_accounts",
    )
    created_by = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_cloud_accounts",
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "reskure_cloud_security_account"
        unique_together = ("tenant", "provider", "account_id")
        ordering = ["provider", "name"]

    def __str__(self):
        return f"[{self.provider}] {self.name} ({self.account_id})"


class CloudScan(TenantScopedModel):
    """
    Prowler security audit execution run against a cloud account.
    """
    STATUS_CHOICES = [
        ("QUEUED", "Queued"),
        ("RUNNING", "Running Checks"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
        ("CANCELLED", "Cancelled"),
    ]

    SCAN_TYPE_CHOICES = [
        ("FULL_AUDIT", "Full Prowler Security Audit"),
        ("CIS_BENCHMARK", "CIS Foundations Benchmark"),
        ("IAM_AND_STORAGE", "Identity, Access & Storage Security"),
        ("QUICK_SCAN", "Critical Threat & Public Exposure Surface"),
    ]

    account = models.ForeignKey(CloudAccount, on_delete=models.CASCADE, related_name="scans")
    scan_type = models.CharField(max_length=30, choices=SCAN_TYPE_CHOICES, default="FULL_AUDIT")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="QUEUED", db_index=True)
    
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(default=0.0)

    # Aggregated metrics
    total_checks = models.PositiveIntegerField(default=0)
    passed_checks = models.PositiveIntegerField(default=0)
    failed_checks = models.PositiveIntegerField(default=0)
    muted_checks = models.PositiveIntegerField(default=0)
    
    critical_findings = models.PositiveIntegerField(default=0)
    high_findings = models.PositiveIntegerField(default=0)
    medium_findings = models.PositiveIntegerField(default=0)
    low_findings = models.PositiveIntegerField(default=0)

    compliance_score = models.FloatField(default=0.0, help_text="Percentage of passing security checks")
    error_message = models.TextField(blank=True)
    prowler_version = models.CharField(max_length=20, default="4.3.0")
    initiated_by = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="initiated_scans",
    )

    class Meta:
        db_table = "reskure_cloud_security_scan"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Scan {self.id} [{self.account.name}] - {self.status}"


class CloudFinding(TenantScopedModel):
    """
    Individual security check result produced by Prowler.
    Identifies a cloud resource, compliance violation, risk, and remediation command.
    """
    SEVERITY_CHOICES = [
        ("CRITICAL", "Critical"),
        ("HIGH", "High"),
        ("MEDIUM", "Medium"),
        ("LOW", "Low"),
        ("INFORMATIONAL", "Informational"),
    ]

    STATUS_CHOICES = [
        ("FAIL", "Fail"),
        ("PASS", "Pass"),
        ("MUTED", "Muted"),
    ]

    LIFECYCLE_CHOICES = [
        ("OPEN", "Open"),
        ("IN_REMEDIATION", "In Remediation"),
        ("RESOLVED", "Resolved"),
        ("ACCEPTED", "Risk Accepted"),
        ("FALSE_POSITIVE", "False Positive"),
    ]

    scan = models.ForeignKey(CloudScan, on_delete=models.CASCADE, related_name="findings")
    account = models.ForeignKey(CloudAccount, on_delete=models.CASCADE, related_name="findings")
    
    provider = models.CharField(max_length=20, db_index=True)
    check_id = models.CharField(max_length=120, db_index=True, help_text="e.g. s3_bucket_default_encryption")
    check_title = models.CharField(max_length=300)
    service = models.CharField(max_length=80, db_index=True, help_text="e.g. s3, iam, ec2, rds, storage, compute")
    
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, db_index=True)
    status_extended = models.TextField(help_text="Detailed finding narrative and evidence rationale")
    
    resource_id = models.CharField(max_length=350, db_index=True, help_text="Resource ARN, Name, or Unique URI")
    resource_name = models.CharField(max_length=200, blank=True)
    region = models.CharField(max_length=60, default="global", db_index=True)
    
    remediation_recommendation_text = models.TextField(blank=True)
    remediation_recommendation_url = models.URLField(max_length=500, blank=True)
    remediation_code = models.TextField(
        blank=True,
        help_text="Copy-pasteable CLI or Terraform command to fix the issue",
    )
    compliance = models.JSONField(
        default=list,
        help_text='List of framework mappings, e.g. ["CIS-AWS-3.0: 2.1.1", "SOC2: CC6.1", "ISO27001: A.10.1.1"]',
    )
    risk_score = models.PositiveSmallIntegerField(default=50, help_text="Calculated risk weight (1-100)")
    
    lifecycle_status = models.CharField(
        max_length=25,
        choices=LIFECYCLE_CHOICES,
        default="OPEN",
        db_index=True,
    )
    is_latest = models.BooleanField(
        default=True,
        db_index=True,
        help_text="True if finding is from the most recent scan of the target account",
    )
    affected_asset = models.ForeignKey(
        "assets.Asset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prowler_findings",
    )
    resolution_note = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reskure_cloud_security_finding"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "is_latest", "status", "severity"]),
            models.Index(fields=["tenant", "is_latest", "service"]),
            models.Index(fields=["tenant", "account", "is_latest", "lifecycle_status"]),
        ]

    def __str__(self):
        return f"[{self.status}] {self.check_title} - {self.resource_name or self.resource_id}"


class ProwlerRule(models.Model):
    """
    Catalog of security checks provided by Prowler across AWS, Azure, and GCP.
    System-wide standard catalog.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    check_id = models.CharField(max_length=120, unique=True, db_index=True)
    provider = models.CharField(max_length=20, db_index=True)
    service = models.CharField(max_length=80, db_index=True)
    title = models.CharField(max_length=300)
    severity = models.CharField(max_length=20)
    description = models.TextField()
    rationale = models.TextField(blank=True)
    remediation_text = models.TextField(blank=True)
    remediation_url = models.URLField(max_length=500, blank=True)
    remediation_code_sample = models.TextField(blank=True)
    compliance_frameworks = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reskure_prowler_rule"
        ordering = ["provider", "service", "check_id"]

    def __str__(self):
        return f"[{self.provider}:{self.service}] {self.title} ({self.severity})"
