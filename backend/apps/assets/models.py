import uuid
from django.db import models
from django.utils import timezone
from apps.core.models import TenantScopedModel, OrgUnit


class CloudConnection(TenantScopedModel):
    """
    Connected cloud infrastructure account (AWS, Azure, Google Cloud).
    """
    PROVIDER_CHOICES = [
        ("AWS", "Amazon Web Services"),
        ("AZURE", "Microsoft Azure"),
        ("GCP", "Google Cloud Platform"),
    ]

    STATUS_CHOICES = [
        ("ACTIVE", "Active & Connected"),
        ("ERROR", "Authentication Error"),
        ("DISABLED", "Disabled"),
    ]

    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    name = models.CharField(max_length=150)
    account_id = models.CharField(max_length=100, help_text="AWS Account ID, Azure Subscription ID, or GCP Project ID")
    role_or_client_arn = models.CharField(max_length=255, help_text="IAM Role ARN or Service Principal ID")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reskure_cloud_connection"
        unique_together = ("tenant", "provider", "account_id")

    def __str__(self):
        return f"{self.provider}: {self.name} ({self.account_id})"


class BusinessService(TenantScopedModel):
    """
    High-level business application or service (e.g. Core Banking API, Customer Portal).
    """
    CRITICALITY_CHOICES = [
        ("CRITICAL", "Tier 1 - Critical"),
        ("HIGH", "Tier 2 - High"),
        ("MEDIUM", "Tier 3 - Medium"),
        ("LOW", "Tier 4 - Low"),
    ]

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    criticality = models.CharField(max_length=20, choices=CRITICALITY_CHOICES, default="HIGH")
    owner_org_unit = models.ForeignKey(
        OrgUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name="business_services"
    )

    class Meta:
        db_table = "reskure_business_service"

    def __str__(self):
        return f"{self.name} ({self.criticality})"


class Asset(TenantScopedModel):
    """
    Asset inventory cataloging infrastructure, cloud resources, code repos, and data stores.
    """
    ASSET_TYPES = [
        ("CLOUD_RESOURCE", "Cloud Resource"),
        ("COMPUTE_HOST", "Virtual/Physical Compute Host"),
        ("DATABASE", "Database / Data Warehouse"),
        ("CODE_REPOSITORY", "Code Repository / CI/CD"),
        ("SAAS_APPLICATION", "Third-Party SaaS Application"),
    ]

    CLASSIFICATION_CHOICES = [
        ("RESTRICTED", "Restricted / High Sensitivity"),
        ("CONFIDENTIAL", "Confidential / Proprietary"),
        ("INTERNAL", "Internal Only"),
        ("PUBLIC", "Public"),
    ]

    name = models.CharField(max_length=255)
    asset_type = models.CharField(max_length=30, choices=ASSET_TYPES, default="CLOUD_RESOURCE")
    provider = models.CharField(max_length=50, default="AWS")
    external_ref = models.CharField(max_length=255, db_index=True, help_text="ARN, Resource URI, or Unique ID")
    region = models.CharField(max_length=50, blank=True)
    classification = models.CharField(max_length=30, choices=CLASSIFICATION_CHOICES, default="CONFIDENTIAL")
    
    cloud_connection = models.ForeignKey(
        CloudConnection, on_delete=models.SET_NULL, null=True, blank=True, related_name="assets"
    )
    business_service = models.ForeignKey(
        BusinessService, on_delete=models.SET_NULL, null=True, blank=True, related_name="assets"
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "reskure_asset"
        ordering = ["provider", "name"]

    def __str__(self):
        return f"[{self.provider}] {self.name} ({self.asset_type})"
