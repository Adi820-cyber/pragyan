import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.core.models import TenantScopedModel, Membership
from apps.compliance.models import Control


class Evidence(TenantScopedModel):
    """
    Evidence item with cryptographic SHA-256 fingerprint proving control compliance.
    """
    STATUS_CHOICES = [
        ("SUBMITTED", "Submitted"),
        ("VERIFIED", "Verified & Operating"),
        ("REJECTED", "Rejected / Inadequate"),
        ("EXPIRED", "Expired / Recertification Needed"),
    ]

    SOURCE_CHOICES = [
        ("MANUAL_UPLOAD", "Manual Upload"),
        ("AUTOMATED_COLLECTOR", "Automated Scanner / API Collector"),
        ("CLOUD_CSPM", "Cloud CSPM Integration (AWS/Azure/GCP)"),
        ("AUDIT_TRAIL", "Internal Audit Trail Export"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="SUBMITTED")
    source_type = models.CharField(max_length=30, choices=SOURCE_CHOICES, default="MANUAL_UPLOAD")
    
    # Cryptographic integrity and storage reference
    storage_key = models.CharField(max_length=512)
    file_sha256 = models.CharField(max_length=64, db_index=True)  # SHA-256 digest
    file_size_bytes = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)

    # Ownership & Controls
    uploaded_by = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, related_name="uploaded_evidence"
    )
    controls = models.ManyToManyField(Control, related_name="evidence_items", blank=True)
    collected_at = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reskure_evidence"
        ordering = ["-collected_at"]

    def __str__(self):
        return f"{self.title} [SHA: {self.file_sha256[:8]}] ({self.status})"


class Attestation(TenantScopedModel):
    """
    Formal attestation and verification of evidence by an authorized auditor or compliance manager.
    Enforces Segregation of Duties (uploader cannot attest).
    """
    DECISION_CHOICES = [
        ("VERIFIED", "Verified Valid"),
        ("REJECTED", "Rejected as Insufficient"),
    ]

    evidence = models.ForeignKey(Evidence, on_delete=models.CASCADE, related_name="attestations")
    attested_by = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, related_name="attestations_conducted"
    )
    decision = models.CharField(max_length=20, choices=DECISION_CHOICES)
    comments = models.TextField()
    attested_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "reskure_attestation"
        ordering = ["-attested_at"]

    def clean(self):
        super().clean()
        # Explicit Segregation of Duties validation
        if self.attested_by and self.evidence and self.evidence.uploaded_by:
            if self.attested_by.id == self.evidence.uploaded_by.id:
                raise ValidationError("Segregation of Duties: Evidence uploader cannot attest to their own evidence.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
        # Update parent evidence status
        if self.decision == "VERIFIED":
            self.evidence.status = "VERIFIED"
        else:
            self.evidence.status = "REJECTED"
        self.evidence.save(update_fields=["status", "updated_at"])
