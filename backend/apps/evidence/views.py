from rest_framework import viewsets
from apps.evidence.models import Evidence, Attestation
from apps.evidence.serializers import EvidenceSerializer, AttestationSerializer
from apps.authorization.permissions import HasReskurePermission


class EvidenceViewSet(viewsets.ModelViewSet):
    queryset = Evidence.objects.all()
    serializer_class = EvidenceSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "evidence"


class AttestationViewSet(viewsets.ModelViewSet):
    queryset = Attestation.objects.all()
    serializer_class = AttestationSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "evidence"
