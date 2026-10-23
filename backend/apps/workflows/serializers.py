from rest_framework import serializers
from apps.workflows.models import WorkflowTemplate, ApprovalRequest, ApprovalStep, ApprovalDecision


class WorkflowTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowTemplate
        fields = ["id", "tenant", "name", "target_entity", "description", "is_active", "auto_approval_enabled", "auto_approval_rules"]
        read_only_fields = ["id", "tenant"]


class ApprovalDecisionSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source="approver.full_name", read_only=True)

    class Meta:
        model = ApprovalDecision
        fields = ["id", "tenant", "step", "approver", "approver_name", "decision", "comments", "decided_at"]
        read_only_fields = ["id", "tenant", "decided_at"]


class ApprovalStepSerializer(serializers.ModelSerializer):
    decisions = ApprovalDecisionSerializer(many=True, read_only=True)

    class Meta:
        model = ApprovalStep
        fields = [
            "id", "tenant", "request", "step_order", "step_type",
            "required_quorum", "status", "assigned_role", "assigned_members", "decisions",
        ]
        read_only_fields = ["id", "tenant"]


class ApprovalRequestSerializer(serializers.ModelSerializer):
    steps = ApprovalStepSerializer(many=True, read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = [
            "id", "tenant", "template", "title", "entity_type", "entity_id",
            "requester", "requester_name", "status", "is_auto_approved",
            "auto_approval_reason", "steps", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]
