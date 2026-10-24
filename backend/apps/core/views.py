from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from apps.core.models import Tenant, OrgUnit, Membership, AccessDecisionLog, AuditLog
from apps.core.serializers import (
    TenantSerializer, OrgUnitSerializer, MembershipSerializer,
    AccessDecisionLogSerializer, AuditLogSerializer
)
from apps.authorization.permissions import HasReskurePermission


class TenantViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only: callers only ever see their own tenant. Tenants are created by operators."""
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated]


class OrgUnitViewSet(viewsets.ModelViewSet):
    queryset = OrgUnit.objects.all()
    serializer_class = OrgUnitSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "tenant"


class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "tenant"


class AccessDecisionLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AccessDecisionLog.objects.all()
    serializer_class = AccessDecisionLogSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "audit"


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "audit"
