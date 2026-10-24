from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.models import Tenant
from apps.ciso_assistant.engine import (
    get_ciso_overview,
    get_framework_controls,
    update_control_status,
    get_crosswalk_table,
    get_gap_analysis,
    add_custom_risk,
    _get_risks_for_tenant,
    _TENANT_CONTROLS_CACHE,
    _TENANT_RISKS_CACHE,
)
from apps.ciso_assistant.catalog import FRAMEWORKS_CATALOG


def _resolve_tenant_id(request) -> str:
    membership = getattr(request, "membership", None)
    if membership and membership.tenant_id:
        return str(membership.tenant_id)
    tenant = Tenant.objects.filter(status="ACTIVE").first()
    if tenant:
        return str(tenant.id)
    return "hirelens-demo-tenant"


class CisoOverviewView(APIView):
    """
    Executive GRC Command Center Overview.
    Delivers real-time multi-framework posture, 5x5 risk matrix, and critical gap counts.
    """
    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        data = get_ciso_overview(tenant_id)
        return Response(data, status=status.HTTP_200_OK)


class CisoFrameworksView(APIView):
    """
    Catalog of global compliance frameworks (ISO 27001, NIST CSF, SOC 2, CIS, DPDP, ISO 42001).
    """
    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        overview = get_ciso_overview(tenant_id)
        return Response({
            "count": len(overview["frameworks"]),
            "frameworks": overview["frameworks"],
        }, status=status.HTTP_200_OK)


class CisoControlsView(APIView):
    """
    Controls querying and status management.
    Supports CISO Assistant's decoupled 'Assess Once, Comply with Many' cross-framework sync.
    """
    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        fw_code = request.query_params.get("framework")
        controls = get_framework_controls(tenant_id, framework_code=fw_code)
        return Response({
            "count": len(controls),
            "controls": controls,
        }, status=status.HTTP_200_OK)

    def patch(self, request):
        tenant_id = _resolve_tenant_id(request)
        code = request.data.get("code")
        new_status = request.data.get("status")
        sync_crosswalks = request.data.get("sync_crosswalks", True)

        if not code or not new_status:
            return Response(
                {"error": "Both 'code' and 'status' are required fields."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = update_control_status(
            tenant_id=tenant_id,
            control_code=code,
            new_status=new_status,
            sync_crosswalks=sync_crosswalks,
        )
        if "error" in result:
            return Response(result, status=status.HTTP_404_NOT_FOUND)
        return Response(result, status=status.HTTP_200_OK)


class CisoCrosswalkView(APIView):
    """
    Decoupled Crosswalk matrix showing how technical safeguards satisfy multiple standards simultaneously.
    """
    def get(self, request):
        matrix = get_crosswalk_table()
        return Response({
            "count": len(matrix),
            "crosswalks": matrix,
        }, status=status.HTTP_200_OK)


class CisoRisksView(APIView):
    """
    Risk Register management and 5x5 Inherent vs Residual risk evaluation.
    """
    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        risks = _get_risks_for_tenant(tenant_id)
        return Response({
            "count": len(risks),
            "risks": risks,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        tenant_id = _resolve_tenant_id(request)
        new_risk = add_custom_risk(tenant_id, request.data)
        return Response(new_risk, status=status.HTTP_201_CREATED)


class CisoGapAnalysisView(APIView):
    """
    Compliance gaps prioritized by severity with automated remediation recommendations.
    """
    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        gaps = get_gap_analysis(tenant_id)
        return Response({
            "count": len(gaps),
            "gaps": gaps,
        }, status=status.HTTP_200_OK)


class CisoResetCatalogView(APIView):
    """
    Reset or initialize standard CISO Assistant catalog.
    """
    def post(self, request):
        tenant_id = _resolve_tenant_id(request)
        if tenant_id in _TENANT_CONTROLS_CACHE:
            del _TENANT_CONTROLS_CACHE[tenant_id]
        if tenant_id in _TENANT_RISKS_CACHE:
            del _TENANT_RISKS_CACHE[tenant_id]
        return Response({
            "message": "CISO Assistant GRC catalog reset to default standard baseline.",
        }, status=status.HTTP_200_OK)
