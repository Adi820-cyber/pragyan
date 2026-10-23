from rest_framework import serializers
from apps.core.models import Tenant, OrgUnit, Membership, AccessDecisionLog, AuditLog


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "slug", "status", "region", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class OrgUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgUnit
        fields = ["id", "tenant", "parent", "name", "code", "created_at", "updated_at"]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]


class MembershipSerializer(serializers.ModelSerializer):
    org_unit_name = serializers.CharField(source="org_unit.name", read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id", "tenant", "email", "full_name", "status", "role",
            "org_unit", "org_unit_name", "authz_version", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]


class AccessDecisionLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessDecisionLog
        fields = [
            "id", "tenant", "actor_id", "actor_email", "permission",
            "resource_type", "resource_id", "decision", "reason",
            "context_snapshot", "timestamp",
        ]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "tenant", "actor_id", "actor_email", "action",
            "resource_type", "resource_id", "payload", "ip_address", "timestamp",
        ]
        read_only_fields = fields
