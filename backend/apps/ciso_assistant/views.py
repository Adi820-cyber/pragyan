from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasReskurePermission
from apps.ciso_assistant.engine import (
    CisoValidationError,
    add_custom_risk,
    get_ciso_overview,
    get_crosswalk_table,
    get_framework_controls,
    get_gap_analysis,
    _get_risks_for_tenant,
    reset_tenant_state,
    update_control_status,
)


def _tenant_id(request) -> str:
    """The tenant comes only from the caller's validated membership."""
    membership = getattr(request, "membership", None)
    if membership is None:
        raise PermissionDenied("Authentication with an active tenant membership is required.")
    return str(membership.tenant_id)


class _CisoView(APIView):
    permission_classes = [HasReskurePermission]
    resource_name = "ciso"


class CisoOverviewView(_CisoView):
    """Multi-framework posture, 5x5 risk matrix and gap counts for the caller's tenant."""

    def get(self, request):
        return Response(get_ciso_overview(_tenant_id(request)))


class CisoFrameworksView(_CisoView):
    def get(self, request):
        overview = get_ciso_overview(_tenant_id(request))
        return Response({"count": len(overview["frameworks"]), "frameworks": overview["frameworks"]})


class CisoControlsView(_CisoView):
    """Control listing and status changes ('assess once, comply with many')."""

    def get(self, request):
        controls = get_framework_controls(_tenant_id(request), framework_code=request.query_params.get("framework"))
        return Response({"count": len(controls), "controls": controls})

    def patch(self, request):
        code = request.data.get("code")
        new_status = request.data.get("status")
        sync = request.data.get("sync_crosswalks", True)
        if not isinstance(code, str) or not code or not isinstance(new_status, str) or not new_status:
            return Response({"error": "Both 'code' and 'status' are required."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(sync, bool):
            return Response({"error": "'sync_crosswalks' must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = update_control_status(_tenant_id(request), code, new_status, sync_crosswalks=sync)
        except CisoValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if "error" in result:
            return Response(result, status=status.HTTP_404_NOT_FOUND)
        return Response(result)


class CisoCrosswalkView(_CisoView):
    def get(self, request):
        _tenant_id(request)
        matrix = get_crosswalk_table()
        return Response({"count": len(matrix), "crosswalks": matrix})


class CisoRisksView(_CisoView):
    def get(self, request):
        risks = _get_risks_for_tenant(_tenant_id(request))
        return Response({"count": len(risks), "risks": risks})

    def post(self, request):
        try:
            risk = add_custom_risk(_tenant_id(request), request.data)
        except CisoValidationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(risk, status=status.HTTP_201_CREATED)


class CisoGapAnalysisView(_CisoView):
    def get(self, request):
        gaps = get_gap_analysis(_tenant_id(request))
        return Response({"count": len(gaps), "gaps": gaps})


class CisoResetCatalogView(APIView):
    """Discard this tenant's edits and return to the shipped baseline. Administrators only."""

    permission_classes = [HasReskurePermission]
    resource_name = "tenant"  # tenant.create is held by administrators only

    def post(self, request):
        removed = reset_tenant_state(_tenant_id(request))
        return Response(
            {
                "message": "Catalogue reset to the shipped baseline." if removed else "Already at the shipped baseline.",
                "reset": removed,
            }
        )
