from rest_framework import serializers
from apps.secops.models import AlertSource, SecurityAlert, ContainmentAction


class AlertSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertSource
        fields = [
            "id", "tenant", "name", "source_type", "status",
            "webhook_secret", "last_event_received_at", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]


class ContainmentActionSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True)

    class Meta:
        model = ContainmentAction
        fields = [
            "id", "tenant", "alert", "action_type", "target_identifier",
            "status", "auto_approval_eligible", "approval_request",
            "requested_by", "requested_by_name", "executed_at",
            "execution_result", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]


class SecurityAlertSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source="source.name", read_only=True)
    containment_actions = ContainmentActionSerializer(many=True, read_only=True)

    class Meta:
        model = SecurityAlert
        fields = [
            "id", "tenant", "source", "source_name", "external_alert_id",
            "title", "description", "severity", "status", "affected_asset",
            "raw_normalized_payload", "ingested_at", "containment_actions",
        ]
        read_only_fields = ["id", "tenant", "ingested_at"]
