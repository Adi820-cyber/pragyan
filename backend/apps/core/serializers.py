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

class TenantBoundSerializer(serializers.ModelSerializer):
    """Rejects related objects that belong to a different tenant than the caller."""

    def _tenant_id(self):
        request = self.context.get("request")
        membership = getattr(request, "membership", None)
        return membership.tenant_id if membership else None

    def validate(self, attrs):
        tenant_id = self._tenant_id()
        for key, value in attrs.items():
            if hasattr(value, "tenant_id") and str(value.tenant_id) != str(tenant_id):
                raise serializers.ValidationError({key: "Not found."})
        return attrs
