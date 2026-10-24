from rest_framework import serializers

from apps.ai_audit import models as m
from apps.ai_audit.sample.registry import features_for, known_keys
from apps.core.models import Membership
from apps.core.serializers import TenantBoundSerializer

JURISDICTIONS = {"DPDP", "GDPR"}


def _name(member):
    return (member.full_name or member.email) if member else None


class AISystemSerializer(TenantBoundSerializer):
    owner_name = serializers.SerializerMethodField()
    reviewer_name = serializers.SerializerMethodField()
    latest_run = serializers.SerializerMethodField()
    open_findings = serializers.SerializerMethodField()

    class Meta:
        model = m.AISystem
        fields = [
            "id", "name", "purpose", "decision_affected", "intended_population", "owner", "owner_name", "reviewer",
            "reviewer_name", "jurisdictions", "automated_decision", "processes_children_data",
            "is_significant_data_fiduciary", "system_type", "requires_citations", "status", "latest_run", "open_findings", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def get_reviewer_name(self, obj):
        return _name(obj.reviewer)

    def get_latest_run(self, obj):
        run = obj.runs.order_by("-created_at").first()
        if not run:
            return None
        return {"id": str(run.id), "status": run.status, "finished_at": run.finished_at,
                "model_version": run.model_version.version_label}

    def get_open_findings(self, obj):
        return obj.findings.exclude(status__in=["accepted", "resolved"]).count()

    def validate_jurisdictions(self, value):
        if not isinstance(value, list) or not set(value) <= JURISDICTIONS:
            raise serializers.ValidationError(f"Use a list containing only: {sorted(JURISDICTIONS)}.")
        return sorted(set(value))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None and attrs.get("system_type", self.instance.system_type) != self.instance.system_type:
            raise serializers.ValidationError({"system_type": "The system type cannot be changed once the system exists. Register a new system instead."})
        reviewer, owner = attrs.get("reviewer"), attrs.get("owner")
        if reviewer and owner and reviewer.id == owner.id:
            raise serializers.ValidationError({"reviewer": "The reviewer must be a different person from the owner."})
        return attrs


class ModelVersionSerializer(TenantBoundSerializer):
    system_name = serializers.CharField(source="system.name", read_only=True)

    class Meta:
        model = m.ModelVersion
        fields = [
            "id", "system", "system_name", "version_label", "source", "sample_key", "model_type", "provider", "model_name",
            "prompt_version", "feature_columns", "favourable_label", "threshold", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        source = attrs.get("source", getattr(self.instance, "source", "predictions_only"))
        key = attrs.get("sample_key", getattr(self.instance, "sample_key", ""))
        system = attrs.get("system") or getattr(self.instance, "system", None)
        is_llm_source = source in ("llm_hosted", "llm_self_hosted")
        if system is not None and system.system_type == "llm" and source not in ("llm_hosted", "llm_self_hosted"):
            raise serializers.ValidationError({"source": "An LLM system uses a hosted or self-hosted LLM model version."})
        if system is not None and system.system_type == "tabular" and is_llm_source:
            raise serializers.ValidationError({"source": "A tabular system cannot use an LLM model version."})
        if source == "server_sample":
            if key not in known_keys():
                raise serializers.ValidationError({"sample_key": f"Choose one of: {known_keys()}."})
            attrs.setdefault("model_type", "GradientBoostingClassifier")
            if not attrs.get("feature_columns"):
                attrs["feature_columns"] = features_for(key)
        elif key:
            raise serializers.ValidationError({"sample_key": "Only built-in sample models use a sample key."})
        return attrs


class DatasetSerializer(serializers.ModelSerializer):
    suggested_config = serializers.SerializerMethodField()

    class Meta:
        model = m.Dataset
        fields = [
            "id", "system", "role", "name", "original_filename", "sha256", "row_count", "column_schema", "pii_scan",
            "period_start", "period_end", "is_sample", "is_real_data", "source_note", "delete_after", "created_at", "suggested_config",
        ]
        read_only_fields = fields

    def get_suggested_config(self, obj):
        # Only the synthetic sample gets a pre-filled mapping; real data columns are chosen by the user.
        return obj.sample_config if obj.is_sample else None


class DatasetUploadSerializer(serializers.Serializer):
    system = serializers.UUIDField()
    role = serializers.ChoiceField(choices=["reference", "current"])
    name = serializers.CharField(max_length=200)
    file = serializers.FileField()
    period_start = serializers.DateField(required=False, allow_null=True)
    period_end = serializers.DateField(required=False, allow_null=True)
    delete_after = serializers.DateField(required=False, allow_null=True)


class ExplanationBundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.ExplanationBundle
        fields = ["id", "system", "model_version", "sha256", "producer", "created_at"]
        read_only_fields = fields


class CheckResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.CheckResult
        fields = [
            "id", "run", "category", "check_key", "subject", "metric", "value", "unit", "support_n", "ci_low", "ci_high",
            "threshold", "state", "summary", "detail", "origin",
        ]
        read_only_fields = fields


class AuditRunSerializer(serializers.ModelSerializer):
    system_name = serializers.CharField(source="system.name", read_only=True)
    model_version_label = serializers.CharField(source="model_version.version_label", read_only=True)
    state_counts = serializers.SerializerMethodField()
    reference_dataset_name = serializers.CharField(source="reference_dataset.name", read_only=True)
    current_dataset_name = serializers.CharField(source="current_dataset.name", read_only=True, default=None)

    class Meta:
        model = m.AuditRun
        fields = [
            "id", "system", "system_name", "model_version", "model_version_label", "reference_dataset",
            "reference_dataset_name", "current_dataset", "current_dataset_name", "config", "control_pack_versions",
            "library_versions", "status", "progress", "progress_message", "error", "started_at", "finished_at",
            "created_at", "state_counts",
        ]
        read_only_fields = fields

    def get_state_counts(self, obj):
        out: dict = {}
        for category, state in obj.results.values_list("category", "state"):
            out.setdefault(category, {}).setdefault(state, 0)
            out[category][state] += 1
        return out


class RunRequestSerializer(serializers.Serializer):
    system = serializers.UUIDField()
    model_version = serializers.UUIDField()
    reference_dataset = serializers.UUIDField()
    current_dataset = serializers.UUIDField(required=False, allow_null=True)
    config = serializers.DictField()


class FindingSerializer(TenantBoundSerializer):
    owner_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    system_name = serializers.CharField(source="system.name", read_only=True)
    history = serializers.SerializerMethodField()
    result_ids = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = m.Finding
        fields = [
            "id", "system", "system_name", "run", "category", "title", "plain_language", "next_step", "severity",
            "status", "owner", "owner_name", "due_date", "priority", "assigned_by_name", "assigned_at",
            "submitted_by", "submitted_by_name", "is_overdue", "remediation_note", "reviewed_by_name", "reviewed_at",
            "review_comment", "attachments", "history", "result_ids", "created_at",
        ]
        read_only_fields = [
            "id", "system", "run", "category", "title", "plain_language", "next_step", "severity", "status",
            "priority", "assigned_at", "submitted_by", "reviewed_at", "review_comment", "created_at",
        ]

    def get_assigned_by_name(self, obj):
        return _name(obj.assigned_by)

    def get_submitted_by_name(self, obj):
        return _name(obj.submitted_by)

    def get_is_overdue(self, obj):
        from datetime import date

        return bool(obj.due_date and obj.due_date < date.today() and obj.status not in ("accepted", "resolved"))

    def get_attachments(self, obj):
        return [
            {"id": str(a.id), "kind": a.kind, "title": a.title, "url": a.url or None, "filename": a.original_filename,
             "size_bytes": a.size_bytes, "sha256": a.sha256, "by": _name(a.uploaded_by), "at": a.created_at}
            for a in obj.attachments.select_related("uploaded_by")
        ]

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def get_reviewed_by_name(self, obj):
        return _name(obj.reviewed_by)

    def get_history(self, obj):
        return [
            {"action": e.action, "from": e.from_status, "to": e.to_status, "comment": e.comment,
             "actor": _name(e.actor) or "system", "at": e.created_at}
            for e in obj.events.select_related("actor")
        ]

    def get_result_ids(self, obj):
        return [str(i) for i in obj.results.values_list("id", flat=True)]


class ControlEvidenceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = m.ControlEvidence
        fields = ["id", "assessment", "title", "original_filename", "sha256", "size_bytes", "content_type",
                  "uploaded_by_name", "created_at"]
        read_only_fields = fields

    def get_uploaded_by_name(self, obj):
        return _name(obj.uploaded_by)


class ControlAssessmentSerializer(TenantBoundSerializer):
    reviewer_name = serializers.SerializerMethodField()
    evidence_files = ControlEvidenceSerializer(many=True, read_only=True)
    control = serializers.SerializerMethodField()

    class Meta:
        model = m.ControlAssessment
        fields = [
            "id", "system", "pack_id", "pack_version", "control_id", "control", "applicable", "applicability_rationale",
            "state", "owner_note", "reviewer_name", "reviewed_at", "review_comment", "evidence_files", "updated_at",
        ]
        read_only_fields = ["id", "system", "pack_id", "pack_version", "control_id", "state", "reviewed_at",
                            "review_comment", "updated_at"]

    def get_reviewer_name(self, obj):
        return _name(obj.reviewer)

    def get_control(self, obj):
        from apps.ai_audit.services.controls import get_control

        return get_control(obj.pack_id, obj.control_id)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("applicable") is False and not (attrs.get("applicability_rationale") or getattr(self.instance, "applicability_rationale", "")):
            raise serializers.ValidationError({"applicability_rationale": "Say why this control does not apply."})
        return attrs


class DependencySerializer(TenantBoundSerializer):
    class Meta:
        model = m.Dependency
        fields = [
            "id", "system", "name", "service", "role", "personal_data_shared", "data_categories", "region", "outside_india",
            "outside_eea", "transfer_mechanism", "contract_in_place", "contract_reviewed_on", "trains_on_customer_data",
            "retention_days", "subprocessors_listed", "exit_plan", "criticality", "last_reviewed", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_data_categories(self, value):
        if not isinstance(value, list) or not all(isinstance(v, str) and len(v) <= 100 for v in value):
            raise serializers.ValidationError("Use a list of short text labels.")
        return value


class RightsProcessSerializer(TenantBoundSerializer):
    owner_name = serializers.SerializerMethodField()
    right_label = serializers.CharField(source="get_right_display", read_only=True)

    class Meta:
        model = m.RightsProcess
        fields = [
            "id", "system", "right", "right_label", "procedure_exists", "owner", "owner_name", "channel", "sla_days", "last_tested",
            "requests_12m", "closed_on_time_12m", "evidence_note", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_owner_name(self, obj):
        return _name(obj.owner)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        requests = attrs.get("requests_12m", getattr(self.instance, "requests_12m", 0))
        on_time = attrs.get("closed_on_time_12m", getattr(self.instance, "closed_on_time_12m", 0))
        if on_time > requests:
            raise serializers.ValidationError({"closed_on_time_12m": "Cannot be more than the number of requests received."})
        return attrs


class ReportEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = m.ReportEvent
        fields = ["id", "action", "from_status", "to_status", "comment", "actor_name", "created_at"]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return _name(obj.actor) or "system"


class AuditReportSerializer(serializers.ModelSerializer):
    """List shape: no snapshot, so the list stays small."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    system_name = serializers.CharField(source="system.name", read_only=True)
    model_version_label = serializers.CharField(source="run.model_version.version_label", read_only=True)
    audit_date = serializers.DateTimeField(source="run.finished_at", read_only=True)
    generated_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    verdict = serializers.SerializerMethodField()

    class Meta:
        model = m.AuditReport
        fields = [
            "id", "run", "system", "system_name", "model_version_label", "generated_by", "submitted_by", "version", "status", "status_label", "audit_date",
            "fingerprint", "generated_by_name", "submitted_by_name", "submitted_at", "approved_by_name", "approved_at",
            "review_comment", "created_at", "verdict",
        ]
        read_only_fields = fields

    def get_generated_by_name(self, obj):
        return _name(obj.generated_by)

    def get_submitted_by_name(self, obj):
        return _name(obj.submitted_by)

    def get_approved_by_name(self, obj):
        return _name(obj.approved_by)

    def get_verdict(self, obj):
        return (obj.snapshot.get("executive_summary") or {}).get("verdict")


class AuditReportDetailSerializer(AuditReportSerializer):
    events = ReportEventSerializer(many=True, read_only=True)
    executive_summary = serializers.SerializerMethodField()
    regulatory_mapping = serializers.SerializerMethodField()

    class Meta(AuditReportSerializer.Meta):
        fields = AuditReportSerializer.Meta.fields + ["events", "executive_summary", "regulatory_mapping"]
        read_only_fields = fields

    def get_executive_summary(self, obj):
        return obj.snapshot.get("executive_summary")

    def get_regulatory_mapping(self, obj):
        return obj.snapshot.get("regulatory_mapping")
