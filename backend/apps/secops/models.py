import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import TenantScopedModel, Membership
from apps.assets.models import Asset
from apps.workflows.models import ApprovalRequest


class AlertSource(TenantScopedModel):
    """
    Connected SIEM, EDR, or Cloud Security feed.
    Ingestion only; no raw log storage infrastructure.
    """
    SOURCE_TYPES = [
        ("AWS_SECURITY_HUB", "AWS Security Hub / GuardDuty"),
        ("AZURE_SENTINEL", "Microsoft Sentinel / Defender for Cloud"),
        ("GCP_SCC", "Google Cloud Security Command Center"),
        ("WAZUH_SIEM", "Wazuh SIEM / XDR"),
        ("CUSTOM_WEBHOOK", "Custom Security Webhook / SIEM"),
    ]

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("PAUSED", "Paused"),
        ("ERROR", "Error"),
    ]

    name = models.CharField(max_length=150)
    source_type = models.CharField(max_length=30, choices=SOURCE_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    webhook_secret = models.CharField(max_length=128, blank=True)
    last_event_received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reskure_alert_source"

    def __str__(self):
        return f"{self.name} [{self.source_type}]"


class SecurityAlert(TenantScopedModel):
    """
    Normalized security alert ingested from customer's SIEM/CSPM.
    """
    SEVERITY_CHOICES = [
        ("CRITICAL", "Critical"),
        ("HIGH", "High"),
        ("MEDIUM", "Medium"),
        ("LOW", "Low"),
        ("INFORMATIONAL", "Informational"),
    ]

    STATUS_CHOICES = [
        ("NEW", "New / Unassigned"),
        ("TRIAGED", "Triaged / Under Review"),
        ("CONTAINMENT_REQUESTED", "Containment Requested"),
        ("RESOLVED", "Resolved"),
        ("FALSE_POSITIVE", "False Positive"),
    ]

    source = models.ForeignKey(AlertSource, on_delete=models.CASCADE, related_name="alerts")
    external_alert_id = models.CharField(max_length=255, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="MEDIUM")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="NEW")
    
    affected_asset = models.ForeignKey(
        Asset, on_delete=models.SET_NULL, null=True, blank=True, related_name="alerts"
    )
    raw_normalized_payload = models.JSONField(default=dict)
    ingested_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "reskure_security_alert"
        ordering = ["-ingested_at"]
        unique_together = ("tenant", "source", "external_alert_id")

    def __str__(self):
        return f"[{self.severity}] {self.title} ({self.status})"


class ContainmentAction(TenantScopedModel):
    """
    Containment or remediation action for an alert.
    Default: Requires human approval via workflow engine.
    Tenant toggle / policy: Allows automated approval.
    """
    ACTION_TYPES = [
        ("ISOLATE_HOST", "Isolate Compute Host from Network"),
        ("REVOKE_CREDENTIALS", "Revoke IAM Credentials / Session"),
        ("BLOCK_IP", "Block Malicious IP at WAF/Security Group"),
        ("QUARANTINE_FILE", "Quarantine Suspicious File / Artifact"),
        ("DISABLE_USER", "Temporarily Disable User Account"),
    ]

    STATUS_CHOICES = [
        ("PENDING_APPROVAL", "Pending Human Approval"),
        ("AUTO_APPROVED", "Auto-Approved by Tenant Policy"),
        ("APPROVED", "Approved by Security Lead"),
        ("EXECUTING", "Execution in Progress"),
        ("COMPLETED", "Executed Successfully"),
        ("REJECTED", "Approval Rejected"),
        ("FAILED", "Execution Failed"),
    ]

    alert = models.ForeignKey(SecurityAlert, on_delete=models.CASCADE, related_name="containment_actions")
    action_type = models.CharField(max_length=30, choices=ACTION_TYPES)
    target_identifier = models.CharField(max_length=255, help_text="Target IP, ARN, Username, or Instance ID")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="PENDING_APPROVAL")
    
    # Human approval vs Auto-approval toggle
    auto_approval_eligible = models.BooleanField(
        default=False,
        help_text="Set to true if tenant policy permits auto-approval for this action type.",
    )
    approval_request = models.ForeignKey(
        ApprovalRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name="containment_actions"
    )
    
    requested_by = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, related_name="containment_actions_requested"
    )
    executed_at = models.DateTimeField(null=True, blank=True)
    execution_result = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "reskure_containment_action"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action_type} on {self.target_identifier} ({self.status})"
