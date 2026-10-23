import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.core.models import TenantScopedModel, Membership


class WorkflowTemplate(TenantScopedModel):
    """
    Reusable multi-step approval workflow template.
    """
    TARGET_ENTITIES = [
        ("RISK_ACCEPTANCE", "Risk Acceptance Sign-off"),
        ("CONTROL_EXCEPTION", "Control Exception / Policy Deviation"),
        ("SECOPS_CONTAINMENT", "SecOps Incident Containment Action"),
        ("POLICY_PUBLISH", "Policy Version Publishing"),
    ]

    name = models.CharField(max_length=200)
    target_entity = models.CharField(max_length=30, choices=TARGET_ENTITIES)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    auto_approval_enabled = models.BooleanField(
        default=False,
        help_text="Tenant toggle to enable auto-approval if defined criteria are met.",
    )
    auto_approval_rules = models.JSONField(
        default=dict,
        blank=True,
        help_text="Criteria for auto-approval (e.g. severity <= LOW, risk_score <= 4)",
    )

    class Meta:
        db_table = "reskure_workflow_template"

    def __str__(self):
        return f"{self.name} ({self.target_entity})"


class ApprovalRequest(TenantScopedModel):
    """
    Active approval request tracking multi-party sign-offs.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending Approval"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("CANCELLED", "Cancelled"),
    ]

    template = models.ForeignKey(
        WorkflowTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    title = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=50, db_index=True)
    entity_id = models.CharField(max_length=255, db_index=True)
    requester = models.ForeignKey(
        Membership, on_delete=models.SET_NULL, null=True, related_name="approval_requests_created"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    
    # Auto-approval tracking
    is_auto_approved = models.BooleanField(default=False)
    auto_approval_reason = models.TextField(blank=True)

    class Meta:
        db_table = "reskure_approval_request"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.status}] {self.title} ({self.entity_type}:{self.entity_id})"


class ApprovalStep(TenantScopedModel):
    """
    A single stage in an approval chain (Sequential, Parallel, or Quorum).
    """
    STEP_TYPES = [
        ("SEQUENTIAL", "Sequential (Single designated role or user)"),
        ("PARALLEL", "Parallel (All designated members must approve)"),
        ("QUORUM", "Quorum (N of M members must approve)"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("SKIPPED", "Skipped"),
    ]

    request = models.ForeignKey(ApprovalRequest, on_delete=models.CASCADE, related_name="steps")
    step_order = models.PositiveIntegerField(default=1)
    step_type = models.CharField(max_length=20, choices=STEP_TYPES, default="SEQUENTIAL")
    required_quorum = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    
    assigned_role = models.CharField(max_length=50, blank=True)
    assigned_members = models.ManyToManyField(
        Membership, related_name="assigned_approval_steps", blank=True
    )

    class Meta:
        db_table = "reskure_approval_step"
        ordering = ["step_order"]

    def __str__(self):
        return f"Step {self.step_order} [{self.step_type}] for Request {self.request_id} ({self.status})"


class ApprovalDecision(TenantScopedModel):
    """
    Individual decision recorded by an approver on an approval step.
    Enforces Segregation of Duties (requester cannot approve).
    """
    DECISION_CHOICES = [
        ("APPROVE", "Approve"),
        ("REJECT", "Reject"),
    ]

    step = models.ForeignKey(ApprovalStep, on_delete=models.CASCADE, related_name="decisions")
    approver = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="decisions_recorded")
    decision = models.CharField(max_length=20, choices=DECISION_CHOICES)
    comments = models.TextField(blank=True)
    decided_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "reskure_approval_decision"
        unique_together = ("step", "approver")

    def clean(self):
        super().clean()
        # Segregation of Duties: Requester cannot approve
        req = self.step.request
        if req and req.requester and self.approver:
            if req.requester.id == self.approver.id:
                raise ValidationError("Segregation of Duties: Requester cannot approve their own approval request.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
        self._evaluate_step_progress()

    def _evaluate_step_progress(self):
        step = self.step
        if self.decision == "REJECT":
            step.status = "REJECTED"
            step.save(update_fields=["status", "updated_at"])
            step.request.status = "REJECTED"
            step.request.save(update_fields=["status", "updated_at"])
            return

        # If approved, check quorum or parallel completion
        decisions = step.decisions.filter(decision="APPROVE")
        if step.step_type == "QUORUM":
            if decisions.count() >= step.required_quorum:
                step.status = "APPROVED"
                step.save(update_fields=["status", "updated_at"])
        elif step.step_type == "PARALLEL":
            total_assigned = step.assigned_members.count()
            if total_assigned > 0 and decisions.count() >= total_assigned:
                step.status = "APPROVED"
                step.save(update_fields=["status", "updated_at"])
        else:  # SEQUENTIAL
            step.status = "APPROVED"
            step.save(update_fields=["status", "updated_at"])

        # Check if all steps in request are complete
        all_steps = step.request.steps.all()
        if all_steps.filter(status="REJECTED").exists():
            step.request.status = "REJECTED"
            step.request.save(update_fields=["status", "updated_at"])
        elif all(s.status == "APPROVED" for s in all_steps):
            step.request.status = "APPROVED"
            step.request.save(update_fields=["status", "updated_at"])
