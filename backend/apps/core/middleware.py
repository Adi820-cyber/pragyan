from django.db import connection

from apps.core.auth import bind_request_context
from apps.core.context import set_current_tenant_id, set_current_user_id


class TenantContextMiddleware:
    """
    Binds tenant context for session-authenticated requests.

    Identity comes only from the authenticated Django user. Client-supplied
    actor or membership headers are ignored. The tenant header may only select
    a tenant in which the user holds an active membership. Token-authenticated
    API requests are bound by the DRF authentication class.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_tenant_id(None)
        set_current_user_id(None)
        request.membership = None

        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            bind_request_context(request, user)

        tenant_id = getattr(request.membership, "tenant_id", None)
        if tenant_id and connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant_id)])

        try:
            return self.get_response(request)
        finally:
            set_current_tenant_id(None)
            set_current_user_id(None)
