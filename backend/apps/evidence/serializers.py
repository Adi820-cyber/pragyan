from rest_framework import serializers
from apps.evidence.models import Evidence, Attestation


class EvidenceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)

    class Meta:
        model = Evidence
        fields = [
            "id", "tenant", "title", "description", "status", "source_type",
            "storage_key", "file_sha256", "file_size_bytes", "mime_type",
            "uploaded_by", "uploaded_by_name", "controls", "collected_at",
            "valid_until", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]


class AttestationSerializer(serializers.ModelSerializer):
    attested_by_name = serializers.CharField(source="attested_by.full_name", read_only=True)

    class Meta:
        model = Attestation
        fields = [
            "id", "tenant", "evidence", "attested_by", "attested_by_name",
            "decision", "comments", "attested_at", "created_at",
        ]
        read_only_fields = ["id", "tenant", "created_at"]
