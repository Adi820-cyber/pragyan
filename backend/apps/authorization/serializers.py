from rest_framework import serializers
from apps.authorization.models import Permission, CustomRole, PolicyRule


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "category", "description"]


class CustomRoleSerializer(serializers.ModelSerializer):
    permissions_list = PermissionSerializer(source="permissions", many=True, read_only=True)

    class Meta:
        model = CustomRole
        fields = ["id", "tenant", "name", "description", "is_active", "permissions", "permissions_list", "created_at"]
        read_only_fields = ["id", "tenant", "created_at"]


class PolicyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyRule
        fields = ["id", "tenant", "name", "kind", "target_resource", "target_action", "effect", "rule_definition", "description", "is_active"]
        read_only_fields = ["id", "tenant"]
