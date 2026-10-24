from rest_framework import serializers

from apps.core.serializers import TenantBoundSerializer
from apps.network.models import CableLink, DeviceInterface, NetworkDevice, PacketInspectionRule


class DeviceInterfaceSerializer(TenantBoundSerializer):
    device_name = serializers.CharField(source="device.name", read_only=True)
    device_role = serializers.CharField(source="device.role", read_only=True)

    class Meta:
        model = DeviceInterface
        fields = [
            "id", "device", "device_name", "device_role", "name", "interface_type", "ip_address", "mac_address", "mtu",
            "enabled", "is_pass_through", "pass_through_counterpart",
        ]
        read_only_fields = ["id"]
        # tenant is not a serializer field, so uniqueness is checked in the view, not by DRF.
        validators: list = []

    def validate_mtu(self, value):
        if not 68 <= value <= 65535:
            raise serializers.ValidationError("MTU must be between 68 and 65535 bytes.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        counterpart = attrs.get("pass_through_counterpart")
        device = attrs.get("device") or getattr(self.instance, "device", None)
        if counterpart is not None:
            if device is not None and counterpart.device_id != device.id:
                raise serializers.ValidationError({"pass_through_counterpart": "A pass-through pair must be on the same device."})
            if self.instance is not None and counterpart.id == self.instance.id:
                raise serializers.ValidationError({"pass_through_counterpart": "A port cannot be its own counterpart."})
        return attrs


class NetworkDeviceSerializer(TenantBoundSerializer):
    interfaces = DeviceInterfaceSerializer(many=True, read_only=True)

    class Meta:
        model = NetworkDevice
        fields = ["id", "name", "role", "status", "primary_ip", "site_location", "rack_unit", "vendor_model", "metadata", "interfaces"]
        read_only_fields = ["id"]
        validators: list = []

    def validate_metadata(self, value):
        if not isinstance(value, dict) or len(str(value)) > 5000:
            raise serializers.ValidationError("Metadata must be a small JSON object.")
        return value


class CableLinkSerializer(TenantBoundSerializer):
    termination_a_name = serializers.SerializerMethodField()
    termination_b_name = serializers.SerializerMethodField()
    cable_type_label = serializers.CharField(source="get_cable_type_display", read_only=True)

    class Meta:
        model = CableLink
        fields = [
            "id", "label", "termination_a", "termination_a_name", "termination_b", "termination_b_name", "cable_type",
            "cable_type_label", "status", "length_meters", "latency_ms", "bandwidth_gbps", "is_encrypted", "packet_loss_percent",
        ]
        read_only_fields = ["id"]

    def get_termination_a_name(self, obj):
        return f"{obj.termination_a.device.name}:{obj.termination_a.name}"

    def get_termination_b_name(self, obj):
        return f"{obj.termination_b.device.name}:{obj.termination_b.name}"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        a = attrs.get("termination_a") or getattr(self.instance, "termination_a", None)
        b = attrs.get("termination_b") or getattr(self.instance, "termination_b", None)
        if a is not None and b is not None and a.id == b.id:
            raise serializers.ValidationError({"termination_b": "A cable must join two different ports."})
        for key in ("latency_ms", "bandwidth_gbps", "length_meters", "packet_loss_percent"):
            if key in attrs and attrs[key] < 0:
                raise serializers.ValidationError({key: "Must not be negative."})
        return attrs


class PacketInspectionRuleSerializer(TenantBoundSerializer):
    class Meta:
        model = PacketInspectionRule
        fields = ["id", "device", "priority", "action", "protocol", "destination_port", "rule_name", "notes"]
        read_only_fields = ["id"]

    def validate_destination_port(self, value):
        from apps.network.traversal_engine import port_matches

        value = value.strip()
        if value != "*" and not all(part.strip().replace("-", "").isdigit() for part in value.split(",")):
            raise serializers.ValidationError('Use "*", a port (443), a list (23,3389) or a range (8000-9000).')
        port_matches(value, "1")  # raises nothing; exercised so malformed ranges fail loudly in tests
        return value


class PacketTraceRequestSerializer(serializers.Serializer):
    source_interface_id = serializers.UUIDField()
    destination_interface_id = serializers.UUIDField()
    protocol = serializers.ChoiceField(choices=["HTTPS", "TCP", "UDP", "GRPC", "ICMP"], default="HTTPS")
    destination_port = serializers.IntegerField(default=443, min_value=0, max_value=65535)
    packet_size_bytes = serializers.IntegerField(default=1420, min_value=64, max_value=65535)
    payload_label = serializers.CharField(default="AI Inference Payload / User Query", max_length=200)
    assume_severed_cables = serializers.ListField(child=serializers.CharField(max_length=100), required=False, max_length=50)
