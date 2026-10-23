from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from apps.authorization.models import Permission, CustomRole, PolicyRule
from apps.authorization.serializers import PermissionSerializer, CustomRoleSerializer, PolicyRuleSerializer
from apps.authorization.permissions import HasReskurePermission


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [AllowAny]


class CustomRoleViewSet(viewsets.ModelViewSet):
    queryset = CustomRole.objects.all()
    serializer_class = CustomRoleSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "tenant"


class PolicyRuleViewSet(viewsets.ModelViewSet):
    queryset = PolicyRule.objects.all()
    serializer_class = PolicyRuleSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "tenant"
