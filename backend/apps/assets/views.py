from rest_framework import viewsets
from apps.assets.models import CloudConnection, BusinessService, Asset
from apps.assets.serializers import CloudConnectionSerializer, BusinessServiceSerializer, AssetSerializer
from apps.authorization.permissions import HasReskurePermission


class CloudConnectionViewSet(viewsets.ModelViewSet):
    queryset = CloudConnection.objects.all()
    serializer_class = CloudConnectionSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"


class BusinessServiceViewSet(viewsets.ModelViewSet):
    queryset = BusinessService.objects.all()
    serializer_class = BusinessServiceSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"
