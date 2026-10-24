from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.core.models import Tenant
from apps.network.models import NetworkDevice, DeviceInterface, CableLink, PacketInspectionRule
from apps.network.serializers import (
    NetworkDeviceSerializer,
    DeviceInterfaceSerializer,
    CableLinkSerializer,
    PacketInspectionRuleSerializer,
    PacketTraceRequestSerializer,
)
from apps.network.traversal_engine import trace_packet_path, seed_demo_network


def _resolve_tenant(request):
    membership = getattr(request, "membership", None)
    if membership and membership.tenant:
        return membership.tenant
    # Fallback to first active tenant or create a default demo tenant
    tenant = Tenant.objects.filter(status="ACTIVE").first()
    if not tenant:
        tenant, _ = Tenant.objects.get_or_create(
            slug="hirelens-corp",
            defaults={"name": "HireLens AI Corp", "region": "us-east-1"}
        )
    return tenant


class NetworkDeviceViewSet(viewsets.ModelViewSet):
    serializer_class = NetworkDeviceSerializer

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        # Auto-seed if completely empty
        if not NetworkDevice.objects.filter(tenant=tenant).exists():
            seed_demo_network(tenant)
        return NetworkDevice.objects.filter(tenant=tenant).prefetch_related("interfaces")


class DeviceInterfaceViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceInterfaceSerializer

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        return DeviceInterface.objects.filter(tenant=tenant).select_related("device")


class CableLinkViewSet(viewsets.ModelViewSet):
    serializer_class = CableLinkSerializer

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        return CableLink.objects.filter(tenant=tenant).select_related(
            "termination_a__device", "termination_b__device"
        )


class PacketInspectionRuleViewSet(viewsets.ModelViewSet):
    serializer_class = PacketInspectionRuleSerializer

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        return PacketInspectionRule.objects.filter(tenant=tenant).select_related("device")


class PacketTraceView(APIView):
    """
    Simulates and traces the packet traversal of data from source interface to destination.
    NetBox-inspired cable path & cross-connect analysis.
    """
    def post(self, request):
        tenant = _resolve_tenant(request)
        serializer = PacketTraceRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Auto-seed if needed
        if not NetworkDevice.objects.filter(tenant=tenant).exists():
            seed_demo_network(tenant)

        data = serializer.validated_data
        result = trace_packet_path(
            tenant_id=str(tenant.id),
            source_interface_id=data["source_interface_id"],
            destination_interface_id=data["destination_interface_id"],
            protocol=data["protocol"],
            destination_port=data["destination_port"],
            packet_size_bytes=data["packet_size_bytes"],
            payload_label=data["payload_label"],
        )
        return Response(result, status=status.HTTP_200_OK)


class NetworkTopologyView(APIView):
    """
    Returns full network graph (nodes, interfaces, cables) for interactive visualizer.
    """
    def get(self, request):
        tenant = _resolve_tenant(request)
        if not NetworkDevice.objects.filter(tenant=tenant).exists():
            seed_demo_network(tenant)

        devices = NetworkDevice.objects.filter(tenant=tenant).prefetch_related("interfaces")
        cables = CableLink.objects.filter(tenant=tenant).select_related(
            "termination_a__device", "termination_b__device"
        )
        rules = PacketInspectionRule.objects.filter(tenant=tenant).select_related("device")

        devices_data = NetworkDeviceSerializer(devices, many=True).data
        cables_data = CableLinkSerializer(cables, many=True).data
        rules_data = PacketInspectionRuleSerializer(rules, many=True).data

        return Response({
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.name,
            "devices": devices_data,
            "cables": cables_data,
            "rules": rules_data,
        })


class NetworkSeedDemoView(APIView):
    """
    Endpoint to seed or reset the NetBox enterprise demonstration network topology.
    """
    def post(self, request):
        tenant = _resolve_tenant(request)
        summary = seed_demo_network(tenant)
        return Response({
            "message": "Demo enterprise network seeded successfully.",
            "summary": summary,
        }, status=status.HTTP_201_CREATED)
