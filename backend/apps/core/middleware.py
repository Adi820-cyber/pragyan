import uuid
from django.db import connection
from apps.core.context import (
    set_current_tenant_id,
    set_current_user_id,
)
from apps.core.models import Tenant


class TenantContextMiddleware:
    """
    Extracts tenant context from request header (X-Tenant-ID) or authenticated user session.
    Configures contextvars and PostgreSQL session variables for RLS enforcement.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant_header = request.headers.get("X-Tenant-ID")
        tenant_id = None

        if tenant_header:
            try:
                tenant_id = uuid.UUID(tenant_header)
            except ValueError:
                tenant_id = None

        # Fallback to user membership if user is authenticated and has tenant attached
        if not tenant_id and hasattr(request, "user") and request.user.is_authenticated:
            user_tenant_id = getattr(request.user, "tenant_id", None)
            if user_tenant_id:
                tenant_id = user_tenant_id

        # Bind thread-local context
        set_current_tenant_id(tenant_id)
        if hasattr(request, "user") and request.user.is_authenticated:
            set_current_user_id(str(request.user.pk))
        else:
            set_current_user_id(None)

        # Set PostgreSQL RLS session variable if database backend supports it and tenant_id is set
        if tenant_id and connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL app.current_tenant_id = %s", [str(tenant_id)])

        response = self.get_response(request)

        # Reset context
        set_current_tenant_id(None)
        set_current_user_id(None)

        return response
