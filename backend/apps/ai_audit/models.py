from django.db import models
from django.utils import timezone

from apps.core.models import Membership, TenantScopedModel
from apps.ai_audit.storage import dataset_upload_path, evidence_upload_path, private_storage


class AISystem(TenantScopedModel):
    STATUS_CHOICES = [("ACTIVE", "Active"), ("ARCHIVED", "Archived")]
    TYPE_CHOICES = [("llm", "LLM / generative system"), ("tabular", "Tabular classifier")]

    name = models.CharField(max_length=200)
    purpose = models.TextField()
    decision_affected = models.CharField(max_length=300, blank=True)
    intended_population = models.CharField(max_length=300, blank=True)
    owner = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_ai_systems")
    reviewer = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_ai_systems")
    jurisdictions = models.JSONField(default=list, help_text='e.g. ["DPDP", "GDPR"]')
    automated_decision = models.BooleanField(default=False, help_text="Decisions about people are made or driven automatically.")
    processes_children_data = models.BooleanField(default=False)
    is_significant_data_fiduciary = models.BooleanField(default=False)
    system_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="llm")
    requires_citations = models.BooleanField(default=False, help_text="Outputs must cite their sources (LLM systems).")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE")

    class Meta:
        db_table = "ai_system"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ModelVersion(TenantScopedModel):
    SOURCE_CHOICES = [
        ("server_sample", "Built-in sample model (server-computed explanations)"),
        ("local_bundle", "Customer model (explanations from local audit tool)"),
        ("predictions_only", "Predictions only (no explanations)"),
        ("llm_hosted", "Hosted LLM (provider API)"),
        ("llm_self_hosted", "Self-hosted LLM"),
    ]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="model_versions")
    version_label = models.CharField(max_length=100)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default="predictions_only")
    sample_key = models.CharField(max_length=50, blank=True, help_text="Built-in sample model key, for server_sample only.")
    model_type = models.CharField(max_length=100, blank=True)
    provider = models.CharField(max_length=100, blank=True, help_text="LLM provider, for LLM systems.")
    model_name = models.CharField(max_length=100, blank=True, help_text="Provider model name or id.")
    prompt_version = models.CharField(max_length=100, blank=True, help_text="Version of the prompt template or pipeline.")
    feature_columns = models.JSONField(default=list)
    favourable_label = models.CharField(max_length=50, default="1")
    threshold = models.FloatField(default=0.5)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "ai_model_version"
        ordering = ["system__name", "version_label"]
        constraints = [
            models.UniqueConstraint(fields=["system", "version_label"], name="unique_model_version_label_per_system"),
        ]

    def __str__(self):
        return f"{self.system.name} {self.version_label}"


class Dataset(TenantScopedModel):
    ROLE_CHOICES = [("reference", "Reference"), ("current", "Current")]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="datasets")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    name = models.CharField(max_length=200)
    original_filename = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to=dataset_upload_path, storage=private_storage)
    sha256 = models.CharField(max_length=64)
    row_count = models.PositiveIntegerField(default=0)
    column_schema = models.JSONField(default=list)
    pii_scan = models.JSONField(default=dict)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    is_sample = models.BooleanField(default=False)
    is_real_data = models.BooleanField(default=False, help_text="Sample data that is real public data, not synthetic.")
    sample_config = models.JSONField(null=True, blank=True, help_text="Pre-filled column mapping, for sample data only.")
    source_note = models.CharField(max_length=300, blank=True, help_text="Where sample data came from.")
    uploaded_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="uploaded_datasets")
    delete_after = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "ai_dataset"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.role})"


class ExplanationBundle(TenantScopedModel):
    """Result bundle produced by the local audit tool in the customer's own environment."""

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="bundles")
    model_version = models.ForeignKey(ModelVersion, on_delete=models.CASCADE, related_name="bundles")
    payload = models.JSONField()
    sha256 = models.CharField(max_length=64)
    producer = models.JSONField(default=dict)
    uploaded_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "ai_explanation_bundle"
        ordering = ["-created_at"]


class AuditRun(TenantScopedModel):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("cancelled", "Cancelled"),
    ]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="runs")
    model_version = models.ForeignKey(ModelVersion, on_delete=models.PROTECT, related_name="runs")
    reference_dataset = models.ForeignKey(Dataset, on_delete=models.PROTECT, related_name="runs_as_reference")
    current_dataset = models.ForeignKey(Dataset, null=True, blank=True, on_delete=models.PROTECT, related_name="runs_as_current")
    config = models.JSONField(default=dict)
    control_pack_versions = models.JSONField(default=dict)
    library_versions = models.JSONField(default=dict)
    # System, model, dataset and control details as they were when the audit completed.
    # Reports read this, so later edits cannot rewrite a historical report.
    context_snapshot = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued", db_index=True)
    progress = models.PositiveSmallIntegerField(default=0)
    progress_message = models.CharField(max_length=200, blank=True)
    error = models.TextField(blank=True)
    cancel_requested = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="ai_runs")

    class Meta:
        db_table = "ai_audit_run"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} ({self.status})"


class CheckResult(TenantScopedModel):
    """Immutable measurement. Decisions about results live on Finding / ControlAssessment."""

    CATEGORY_CHOICES = [
        ("bias", "Bias"),
        ("drift", "Drift"),
        ("explainability", "Explainability"),
        ("grounding", "Groundedness and traceability"),
        ("privacy", "Privacy"),
        ("governance", "Vendors, rights and oversight"),
    ]
    STATE_CHOICES = [
        ("no_alert", "No alert under selected policy"),
        ("review_required", "Review required"),
        ("insufficient_evidence", "Insufficient evidence"),
        ("not_applicable", "Not applicable"),
        ("error", "Error"),
    ]
    ORIGIN_CHOICES = [
        ("server", "Computed by server"),
        ("local_bundle", "Supplied by local tool"),
        ("declared", "Declared by the organisation"),
    ]

    run = models.ForeignKey(AuditRun, on_delete=models.CASCADE, related_name="results")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    check_key = models.CharField(max_length=80)
    subject = models.CharField(max_length=200, blank=True)
    metric = models.CharField(max_length=80)
    value = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=40, blank=True)
    support_n = models.PositiveIntegerField(null=True, blank=True)
    ci_low = models.FloatField(null=True, blank=True)
    ci_high = models.FloatField(null=True, blank=True)
    threshold = models.FloatField(null=True, blank=True)
    state = models.CharField(max_length=30, choices=STATE_CHOICES)
    summary = models.TextField(blank=True, help_text="Plain-language statement of what was measured.")
    detail = models.JSONField(default=dict)
    origin = models.CharField(max_length=20, choices=ORIGIN_CHOICES, default="server")
    is_finding_candidate = models.BooleanField(default=False)

    class Meta:
        db_table = "ai_check_result"
        ordering = ["category", "check_key", "subject", "metric"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("CheckResult rows are immutable once written.")
        super().save(*args, **kwargs)


class Finding(TenantScopedModel):
    SEVERITY_CHOICES = [("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High")]
    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_remediation", "In remediation"),
        ("submitted", "Submitted for review"),
        ("accepted", "Risk accepted"),
        ("resolved", "Resolved"),
    ]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="findings")
    run = models.ForeignKey(AuditRun, on_delete=models.CASCADE, related_name="findings")
    results = models.ManyToManyField(CheckResult, related_name="findings", blank=True)
    category = models.CharField(max_length=20, choices=CheckResult.CATEGORY_CHOICES)
    fingerprint = models.CharField(max_length=200, db_index=True)
    title = models.CharField(max_length=300)
    plain_language = models.TextField()
    next_step = models.TextField(blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default="MEDIUM")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open", db_index=True)
    owner = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_findings")
    due_date = models.DateField(null=True, blank=True)
    remediation_note = models.TextField(blank=True)
    submitted_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="submitted_findings")
    reviewed_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_findings")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_comment = models.TextField(blank=True)

    class Meta:
        db_table = "ai_finding"
        ordering = ["-created_at"]


class FindingEvent(TenantScopedModel):
    finding = models.ForeignKey(Finding, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=40)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    comment = models.TextField(blank=True)

    class Meta:
        db_table = "ai_finding_event"
        ordering = ["created_at"]


class ControlAssessment(TenantScopedModel):
    STATE_CHOICES = [
        ("needs_evidence", "Needs evidence"),
        ("evidence_supplied", "Evidence supplied"),
        ("reviewed", "Reviewed"),
        ("gap_identified", "Gap identified"),
        ("not_applicable", "Not applicable"),
    ]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="control_assessments")
    pack_id = models.CharField(max_length=50)
    pack_version = models.CharField(max_length=20)
    control_id = models.CharField(max_length=50)
    applicable = models.BooleanField(default=True)
    applicability_rationale = models.TextField(blank=True)
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default="needs_evidence")
    owner_note = models.TextField(blank=True)
    reviewer = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_controls")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_comment = models.TextField(blank=True)
    owner = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_ai_controls")
    updated_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="updated_controls")

    class Meta:
        db_table = "ai_control_assessment"
        ordering = ["pack_id", "control_id"]
        constraints = [
            models.UniqueConstraint(fields=["system", "pack_id", "control_id"], name="unique_control_assessment_per_system"),
        ]


class ControlEvidence(TenantScopedModel):
    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="evidence_files")
    title = models.CharField(max_length=200)
    original_filename = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to=evidence_upload_path, storage=private_storage)
    sha256 = models.CharField(max_length=64)
    size_bytes = models.PositiveBigIntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "ai_control_evidence"
        ordering = ["-created_at"]


class Dependency(TenantScopedModel):
    """A vendor, cloud service or processor the AI system depends on."""

    ROLE_CHOICES = [
        ("model_provider", "Model / LLM provider"),
        ("cloud", "Cloud or hosting"),
        ("data_labelling", "Data labelling or annotation"),
        ("analytics", "Analytics or monitoring"),
        ("other", "Other"),
    ]
    TRAINING_CHOICES = [("yes", "Yes"), ("no", "No"), ("unknown", "Unknown")]
    CRITICALITY_CHOICES = [("low", "Low"), ("medium", "Medium"), ("high", "High")]
    RELATIONSHIP_CHOICES = [("processor", "Processor"), ("sub_processor", "Sub-processor"), ("joint_controller", "Joint controller"), ("other", "Other")]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="dependencies")
    name = models.CharField(max_length=200)
    service = models.CharField(max_length=200, blank=True)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="model_provider")
    personal_data_shared = models.BooleanField(default=False)
    data_categories = models.JSONField(default=list, blank=True)
    region = models.CharField(max_length=100, blank=True)
    outside_india = models.BooleanField(default=False)
    outside_eea = models.BooleanField(default=False)
    transfer_mechanism = models.CharField(max_length=300, blank=True)
    contract_in_place = models.BooleanField(default=False)
    contract_reviewed_on = models.DateField(null=True, blank=True)
    trains_on_customer_data = models.CharField(max_length=10, choices=TRAINING_CHOICES, default="unknown")
    retention_days = models.PositiveIntegerField(null=True, blank=True)
    subprocessors_listed = models.BooleanField(default=False)
    exit_plan = models.BooleanField(default=False)
    criticality = models.CharField(max_length=10, choices=CRITICALITY_CHOICES, default="medium")
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES, default="processor")
    is_demo = models.BooleanField(default=False, help_text="Synthetic demonstration record.")
    last_reviewed = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "ai_dependency"
        ordering = ["name"]


class RightsProcess(TenantScopedModel):
    """How one data-subject right is handled for this AI system."""

    RIGHT_CHOICES = [
        ("access", "Access to data"),
        ("correction", "Correction of data"),
        ("erasure", "Erasure of data"),
        ("withdraw_consent", "Withdrawal of consent"),
        ("grievance", "Grievance redressal"),
        ("human_review", "Human review of an automated decision"),
    ]

    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="rights_processes")
    right = models.CharField(max_length=30, choices=RIGHT_CHOICES)
    procedure_exists = models.BooleanField(default=False)
    owner = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="rights_processes")
    channel = models.CharField(max_length=300, blank=True, help_text="Where a person makes the request.")
    sla_days = models.PositiveIntegerField(null=True, blank=True)
    last_tested = models.DateField(null=True, blank=True)
    requests_12m = models.PositiveIntegerField(default=0)
    closed_on_time_12m = models.PositiveIntegerField(default=0)
    evidence_note = models.TextField(blank=True)

    class Meta:
        db_table = "ai_rights_process"
        ordering = ["right"]
        constraints = [models.UniqueConstraint(fields=["system", "right"], name="unique_right_per_system")]


class ControlAssessmentEvent(TenantScopedModel):
    """Append-only history of what happened to a control assessment."""
    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=30)
    from_state = models.CharField(max_length=30, blank=True)
    to_state = models.CharField(max_length=30, blank=True)
    note = models.TextField(blank=True)
    actor = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "ai_control_event"
        ordering = ["-created_at"]


class ControlLink(TenantScopedModel):
    """A link to evidence that lives elsewhere (policy page, ticket, wiki). Manual attestation, not verified."""
    assessment = models.ForeignKey(ControlAssessment, on_delete=models.CASCADE, related_name="links")
    title = models.CharField(max_length=200)
    url = models.URLField(max_length=500)
    added_by = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "ai_control_link"
        ordering = ["-created_at"]


class DataSubjectRequest(TenantScopedModel):
    """One request from a person exercising a right. The requester is a reference, not a name or contact."""
    KIND_CHOICES = RightsProcess.RIGHT_CHOICES + [("consent", "Consent query or record")]
    STATUS_CHOICES = [
        ("received", "Received"), ("in_progress", "In progress"), ("completed", "Completed"),
        ("rejected", "Rejected with reasons"),
    ]
    system = models.ForeignKey(AISystem, on_delete=models.CASCADE, related_name="subject_requests")
    reference = models.CharField(max_length=60, help_text="Internal ticket or pseudonymous reference. No names or contact details.")
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="received")
    received_on = models.DateField()
    due_on = models.DateField()
    closed_on = models.DateField(null=True, blank=True)
    assignee = models.ForeignKey(Membership, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_subject_requests")
    notes = models.TextField(blank=True)
    is_demo = models.BooleanField(default=False, help_text="Synthetic demonstration record.")

    class Meta:
        db_table = "ai_subject_request"
        ordering = ["due_on", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["tenant", "reference"], name="unique_subject_request_reference")]
