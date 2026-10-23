import uuid
from django.db import connection
from apps.core.context import (
    set_current_tenant_id,
    set_current_user_id,
)
from apps.core.models import Tenant, Membership


class TenantContextMiddleware:
    """
    Extracts tenant and actor context from request headers or authenticated user session.
    Configures contextvars and PostgreSQL session variables for RLS enforcement.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant_header = request.headers.get("X-Tenant-ID")
        actor_header = request.headers.get("X-Actor-ID") or request.headers.get("X-Membership-ID")
        tenant_id = None
        membership = None

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

        # Resolve actor membership within the active tenant
        if tenant_id and actor_header:
            try:
                actor_uuid = uuid.UUID(actor_header)
                membership = Membership.objects.filter(tenant_id=tenant_id, id=actor_uuid).first()
            except ValueError:
                membership = Membership.objects.filter(tenant_id=tenant_id, email=actor_header).first()
        elif tenant_id and hasattr(request, "user") and request.user.is_authenticated:
            membership = Membership.objects.filter(tenant_id=tenant_id, email=request.user.email).first()

        request.membership = membership

        if membership:
            set_current_user_id(str(membership.id))
        elif hasattr(request, "user") and request.user.is_authenticated:
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
