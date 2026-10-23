from rest_framework import serializers
from apps.risk.models import Risk, RiskMatrixConfig


class RiskMatrixConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskMatrixConfig
        fields = ["id", "tenant", "algorithm", "low_max", "medium_max", "high_max", "parameters"]
        read_only_fields = ["id", "tenant"]


class RiskSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    org_unit_name = serializers.CharField(source="owner_org_unit.name", read_only=True)

    class Meta:
        model = Risk
        fields = [
            "id", "tenant", "identifier", "title", "description", "category", "status",
            "inherent_likelihood", "inherent_impact", "inherent_score", "inherent_severity",
            "residual_likelihood", "residual_impact", "residual_score", "residual_severity",
            "owner_org_unit", "org_unit_name", "owner", "owner_name", "requester", "requester_name",
            "treatment_strategy", "treatment_plan", "accepted_rationale", "accepted_until",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "tenant", "inherent_score", "inherent_severity",
            "residual_score", "residual_severity", "created_at", "updated_at",
        ]
