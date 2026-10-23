from rest_framework import serializers
from apps.assets.models import CloudConnection, BusinessService, Asset


class CloudConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CloudConnection
        fields = [
            "id", "tenant", "provider", "name", "account_id",
            "role_or_client_arn", "status", "last_synced_at", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]


class BusinessServiceSerializer(serializers.ModelSerializer):
    owner_org_unit_name = serializers.CharField(source="owner_org_unit.name", read_only=True)

    class Meta:
        model = BusinessService
        fields = [
            "id", "tenant", "name", "description", "criticality",
            "owner_org_unit", "owner_org_unit_name", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]


class AssetSerializer(serializers.ModelSerializer):
    business_service_name = serializers.CharField(source="business_service.name", read_only=True)
    cloud_connection_name = serializers.CharField(source="cloud_connection.name", read_only=True)

    class Meta:
        model = Asset
        fields = [
            "id", "tenant", "name", "asset_type", "provider", "external_ref",
            "region", "classification", "cloud_connection", "cloud_connection_name",
            "business_service", "business_service_name", "metadata", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]
