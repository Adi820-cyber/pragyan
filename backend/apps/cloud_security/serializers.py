from rest_framework import serializers
from apps.cloud_security.models import CloudAccount, CloudScan, CloudFinding, ProwlerRule


class CloudAccountSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    cloud_connection_name = serializers.CharField(source="cloud_connection.name", read_only=True)

    class Meta:
        model = CloudAccount
        fields = [
            "id",
            "tenant",
            "name",
            "provider",
            "account_id",
            "region_default",
            "role_arn",
            "credentials_ref",
            "environment",
            "status",
            "compliance_score",
            "last_scanned_at",
            "last_scan_status",
            "total_findings_count",
            "critical_findings_count",
            "high_findings_count",
            "medium_findings_count",
            "low_findings_count",
            "cloud_connection",
            "cloud_connection_name",
            "created_by",
            "created_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "compliance_score",
            "last_scanned_at",
            "last_scan_status",
            "total_findings_count",
            "critical_findings_count",
            "high_findings_count",
            "medium_findings_count",
            "low_findings_count",
            "created_at",
            "updated_at",
        ]


class CloudScanSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)
    account_provider = serializers.CharField(source="account.provider", read_only=True)
    account_id_val = serializers.CharField(source="account.account_id", read_only=True)
    initiated_by_name = serializers.CharField(source="initiated_by.full_name", read_only=True)

    class Meta:
        model = CloudScan
        fields = [
            "id",
            "tenant",
            "account",
            "account_name",
            "account_provider",
            "account_id_val",
            "scan_type",
            "status",
            "started_at",
            "completed_at",
            "duration_seconds",
            "total_checks",
            "passed_checks",
            "failed_checks",
            "muted_checks",
            "critical_findings",
            "high_findings",
            "medium_findings",
            "low_findings",
            "compliance_score",
            "error_message",
            "prowler_version",
            "initiated_by",
            "initiated_by_name",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "started_at",
            "completed_at",
            "duration_seconds",
            "total_checks",
            "passed_checks",
            "failed_checks",
            "muted_checks",
            "critical_findings",
            "high_findings",
            "medium_findings",
            "low_findings",
            "compliance_score",
            "error_message",
            "prowler_version",
            "created_at",
        ]


class CloudFindingSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)
    affected_asset_name = serializers.CharField(source="affected_asset.name", read_only=True)

    class Meta:
        model = CloudFinding
        fields = [
            "id",
            "tenant",
            "scan",
            "account",
            "account_name",
            "provider",
            "check_id",
            "check_title",
            "service",
            "severity",
            "status",
            "status_extended",
            "resource_id",
            "resource_name",
            "region",
            "remediation_recommendation_text",
            "remediation_recommendation_url",
            "remediation_code",
            "compliance",
            "risk_score",
            "lifecycle_status",
            "is_latest",
            "affected_asset",
            "affected_asset_name",
            "resolution_note",
            "resolved_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "scan",
            "account",
            "provider",
            "check_id",
            "check_title",
            "service",
            "severity",
            "status",
            "status_extended",
            "resource_id",
            "resource_name",
            "region",
            "remediation_recommendation_text",
            "remediation_recommendation_url",
            "remediation_code",
            "compliance",
            "risk_score",
            "created_at",
        ]


class ProwlerRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProwlerRule
        fields = [
            "id",
            "check_id",
            "provider",
            "service",
            "title",
            "severity",
            "description",
            "rationale",
            "remediation_text",
            "remediation_url",
            "remediation_code_sample",
            "compliance_frameworks",
            "is_active",
        ]


class TriggerScanInputSerializer(serializers.Serializer):
    account_id = serializers.UUIDField(required=True)
    scan_type = serializers.ChoiceField(
        choices=CloudScan.SCAN_TYPE_CHOICES,
        default="FULL_AUDIT",
    )
