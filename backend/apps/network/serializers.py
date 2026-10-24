from rest_framework import serializers
from apps.network.models import NetworkDevice, DeviceInterface, CableLink, PacketInspectionRule


class DeviceInterfaceSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source="device.name", read_only=True)
    device_role = serializers.CharField(source="device.role", read_only=True)

    class Meta:
        model = DeviceInterface
        fields = [
            "id",
            "device",
            "device_name",
            "device_role",
            "name",
            "interface_type",
            "ip_address",
            "mac_address",
            "mtu",
            "enabled",
            "is_pass_through",
            "pass_through_counterpart",
        ]


class NetworkDeviceSerializer(serializers.ModelSerializer):
    interfaces = DeviceInterfaceSerializer(many=True, read_only=True)

    class Meta:
        model = NetworkDevice
        fields = [
            "id",
            "name",
            "role",
            "status",
            "primary_ip",
            "site_location",
            "rack_unit",
            "vendor_model",
            "metadata",
            "interfaces",
        ]


class CableLinkSerializer(serializers.ModelSerializer):
    termination_a_name = serializers.SerializerMethodField()
    termination_b_name = serializers.SerializerMethodField()
    cable_type_label = serializers.CharField(source="get_cable_type_display", read_only=True)

    class Meta:
        model = CableLink
        fields = [
            "id",
            "label",
            "termination_a",
            "termination_a_name",
            "termination_b",
            "termination_b_name",
            "cable_type",
            "cable_type_label",
            "status",
            "length_meters",
            "latency_ms",
            "bandwidth_gbps",
            "is_encrypted",
            "packet_loss_percent",
        ]

    def get_termination_a_name(self, obj):
        return f"{obj.termination_a.device.name}:{obj.termination_a.name}"

    def get_termination_b_name(self, obj):
        return f"{obj.termination_b.device.name}:{obj.termination_b.name}"


class PacketInspectionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PacketInspectionRule
        fields = [
            "id",
            "device",
            "priority",
            "action",
            "protocol",
            "destination_port",
            "rule_name",
            "notes",
        ]


class PacketTraceRequestSerializer(serializers.Serializer):
    source_interface_id = serializers.CharField(required=True)
    destination_interface_id = serializers.CharField(required=True)
    protocol = serializers.ChoiceField(choices=["HTTPS", "TCP", "UDP", "GRPC", "ICMP"], default="HTTPS")
    destination_port = serializers.CharField(default="443")
    packet_size_bytes = serializers.IntegerField(default=1420, min_value=64, max_value=65535)
    payload_label = serializers.CharField(default="AI Inference Payload / User Query", max_length=200)
