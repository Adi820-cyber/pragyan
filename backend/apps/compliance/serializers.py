from rest_framework import serializers
from apps.compliance.models import Framework, Control, ControlRiskMapping, FrameworkCrosswalk


class FrameworkSerializer(serializers.ModelSerializer):
    controls_count = serializers.IntegerField(source="controls.count", read_only=True)

    class Meta:
        model = Framework
        fields = [
            "id", "tenant_id", "name", "code", "version", "publisher",
            "description", "is_system", "controls_count", "created_at"
        ]


class ControlSerializer(serializers.ModelSerializer):
    framework_code = serializers.CharField(source="framework.code", read_only=True)
    framework_name = serializers.CharField(source="framework.name", read_only=True)

    class Meta:
        model = Control
        fields = [
            "id", "tenant_id", "framework", "framework_code", "framework_name",
            "domain", "code", "title", "description", "implementation_guidance",
            "status", "owner_org_unit", "owner",
        ]


class ControlRiskMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ControlRiskMapping
        fields = ["id", "tenant_id", "control", "risk", "mitigation_weight"]


class FrameworkCrosswalkSerializer(serializers.ModelSerializer):
    class Meta:
        model = FrameworkCrosswalk
        fields = ["id", "source_control", "target_control", "relationship"]
