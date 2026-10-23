from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.compliance.models import Framework, Control, ControlRiskMapping, FrameworkCrosswalk
from apps.compliance.serializers import (
    FrameworkSerializer, ControlSerializer,
    ControlRiskMappingSerializer, FrameworkCrosswalkSerializer
)
from apps.authorization.permissions import HasReskurePermission
from apps.core.context import get_current_tenant_id


class FrameworkViewSet(viewsets.ModelViewSet):
    serializer_class = FrameworkSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "compliance"

    def get_queryset(self):
        tenant_id = get_current_tenant_id()
        if tenant_id:
            return Framework.objects.filter(is_system=True) | Framework.objects.filter(tenant_id=tenant_id)
        return Framework.objects.filter(is_system=True)


class ControlViewSet(viewsets.ModelViewSet):
    serializer_class = ControlSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "control"

    def get_queryset(self):
        tenant_id = get_current_tenant_id()
        qs = Control.objects.all()
        framework_id = self.request.query_params.get("framework")
        if framework_id:
            qs = qs.filter(framework_id=framework_id)
        if tenant_id:
            return qs.filter(tenant_id=tenant_id) | qs.filter(tenant_id__isnull=True)
        return qs

    @action(detail=False, methods=["GET"])
    def posture_summary(self, request):
        qs = self.get_queryset()
        total = qs.count()
        implemented = qs.filter(status="IMPLEMENTED").count()
        in_progress = qs.filter(status="IN_PROGRESS").count()
        not_started = qs.filter(status="NOT_STARTED").count()
        posture_percent = round((implemented / total) * 100, 1) if total > 0 else 0.0

        return Response({
            "total_controls": total,
            "implemented": implemented,
            "in_progress": in_progress,
            "not_started": not_started,
            "compliance_posture_percentage": posture_percent,
        })


class ControlRiskMappingViewSet(viewsets.ModelViewSet):
    queryset = ControlRiskMapping.objects.all()
    serializer_class = ControlRiskMappingSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "compliance"


class FrameworkCrosswalkViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FrameworkCrosswalk.objects.all()
    serializer_class = FrameworkCrosswalkSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "compliance"
