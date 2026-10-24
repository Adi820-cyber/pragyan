"""Network topology and packet-path tracing.

Every endpoint requires an authenticated tenant membership and a role permission
(network.read to look and trace, network.create/update/delete to edit). Reading never
changes data. Loading the sample network is an explicit, admin-only action.
"""
from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasReskurePermission
from apps.network.models import CableLink, DeviceInterface, NetworkDevice, PacketInspectionRule
from apps.network.serializers import (
    CableLinkSerializer,
    DeviceInterfaceSerializer,
    NetworkDeviceSerializer,
    PacketInspectionRuleSerializer,
    PacketTraceRequestSerializer,
)
from apps.network.traversal_engine import seed_demo_network, trace_packet_path


def _membership(request):
    membership = getattr(request, "membership", None)
    if membership is None:
        raise PermissionDenied("Authentication with an active tenant membership is required.")
    return membership


class NetworkBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [HasReskurePermission]
    resource_name = "network"

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(tenant_id=_membership(self.request).tenant_id)
        except IntegrityError:
            raise ValidationError({"detail": "An item with the same name already exists here."})

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "An item with the same name already exists here."})


class NetworkDeviceViewSet(NetworkBaseViewSet):
    queryset = NetworkDevice.objects.prefetch_related("interfaces").all()
    serializer_class = NetworkDeviceSerializer


class DeviceInterfaceViewSet(NetworkBaseViewSet):
    queryset = DeviceInterface.objects.select_related("device").all()
    serializer_class = DeviceInterfaceSerializer


class CableLinkViewSet(NetworkBaseViewSet):
    queryset = CableLink.objects.select_related("termination_a__device", "termination_b__device").all()
    serializer_class = CableLinkSerializer


class PacketInspectionRuleViewSet(NetworkBaseViewSet):
    queryset = PacketInspectionRule.objects.select_related("device").all()
    serializer_class = PacketInspectionRuleSerializer


class PacketTraceView(APIView):
    """Trace a packet from one port to another. A simulation: it reads the topology and changes nothing."""

    permission_classes = [HasReskurePermission]
    resource_name = "network"
    required_permission = "network.read"

    def post(self, request):
        membership = _membership(request)
        serializer = PacketTraceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = trace_packet_path(
            tenant_id=str(membership.tenant_id),
            source_interface_id=str(data["source_interface_id"]),
            destination_interface_id=str(data["destination_interface_id"]),
            protocol=data["protocol"],
            destination_port=str(data["destination_port"]),
            packet_size_bytes=data["packet_size_bytes"],
            payload_label=data["payload_label"],
            assume_severed_cables=data.get("assume_severed_cables"),
        )
        if result.get("status") == "ERROR":
            return Response({"detail": result["message"]}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)


class NetworkTopologyView(APIView):
    """The whole graph for the visualiser. Empty if nothing has been recorded; never seeds on read."""

    permission_classes = [HasReskurePermission]
    resource_name = "network"
    required_permission = "network.read"

    def get(self, request):
        membership = _membership(request)
        tid = membership.tenant_id
        devices = NetworkDevice.all_objects.filter(tenant_id=tid).prefetch_related("interfaces")
        cables = CableLink.all_objects.filter(tenant_id=tid).select_related("termination_a__device", "termination_b__device")
        rules = PacketInspectionRule.all_objects.filter(tenant_id=tid).select_related("device")
        return Response({
            "tenant_id": str(tid),
            "tenant_name": membership.tenant.name,
            "devices": NetworkDeviceSerializer(devices, many=True, context={"request": request}).data,
            "cables": CableLinkSerializer(cables, many=True, context={"request": request}).data,
            "rules": PacketInspectionRuleSerializer(rules, many=True, context={"request": request}).data,
        })


class NetworkSeedDemoView(APIView):
    """Loads the sample enterprise network. Admin only, and it will not overwrite an existing network unless asked."""

    permission_classes = [HasReskurePermission]
    resource_name = "tenant"  # tenant.create is held by administrators only

    def post(self, request):
        if not settings.ALLOW_DEMO_SEED:
            raise PermissionDenied("Demo data loading is disabled on this deployment.")
        membership = _membership(request)
        exists = NetworkDevice.all_objects.filter(tenant_id=membership.tenant_id).exists()
        if exists and request.data.get("replace") is not True:
            return Response(
                {"detail": "This organisation already has a network. Send replace=true to delete it and load the sample."},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            summary = seed_demo_network(membership.tenant)
        return Response({"message": "Sample enterprise network loaded.", "summary": summary}, status=status.HTTP_201_CREATED)
