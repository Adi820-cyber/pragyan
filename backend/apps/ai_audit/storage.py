import hashlib
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage


def private_storage() -> FileSystemStorage:
    """Private storage outside any served path. Files are only returned via authorised API calls."""
    return FileSystemStorage(location=str(settings.PRIVATE_MEDIA_ROOT), base_url=None)


def dataset_upload_path(instance, filename: str) -> str:
    # The client filename is never used on disk.
    return f"datasets/{instance.tenant_id}/{uuid.uuid4().hex}.csv"


def evidence_upload_path(instance, filename: str) -> str:
    return f"control_evidence/{instance.tenant_id}/{uuid.uuid4().hex}.bin"


def finding_evidence_upload_path(instance, filename: str) -> str:
    return f"finding_evidence/{instance.tenant_id}/{uuid.uuid4().hex}.bin"


def sha256_of_uploaded(uploaded_file) -> str:
    digest = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        digest.update(chunk)
    uploaded_file.seek(0)
    return digest.hexdigest()
