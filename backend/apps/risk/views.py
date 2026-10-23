from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.risk.models import Risk, RiskMatrixConfig
from apps.risk.serializers import RiskSerializer, RiskMatrixConfigSerializer
from apps.authorization.permissions import HasReskurePermission


class RiskMatrixConfigViewSet(viewsets.ModelViewSet):
    queryset = RiskMatrixConfig.objects.all()
    serializer_class = RiskMatrixConfigSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "tenant"


class RiskViewSet(viewsets.ModelViewSet):
    queryset = Risk.objects.all()
    serializer_class = RiskSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "risk"

    @action(detail=False, methods=["GET"])
    def heatmap_summary(self, request):
        """
        Returns the 5x5 risk distribution matrix count for the active tenant.
        """
        risks = self.get_queryset()
        matrix = [[0 for _ in range(5)] for _ in range(5)]  # matrix[likelihood-1][impact-1]

        for r in risks:
            l = max(1, min(5, r.inherent_likelihood)) - 1
            i = max(1, min(5, r.inherent_impact)) - 1
            matrix[l][i] += 1

        summary = {
            "total_risks": risks.count(),
            "critical_count": risks.filter(inherent_severity="CRITICAL").count(),
            "high_count": risks.filter(inherent_severity="HIGH").count(),
            "medium_count": risks.filter(inherent_severity="MEDIUM").count(),
            "low_count": risks.filter(inherent_severity="LOW").count(),
            "matrix_5x5": matrix,
        }
        return Response(summary)
