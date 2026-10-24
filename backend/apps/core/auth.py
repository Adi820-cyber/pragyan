"""
Authentication and tenant resolution.

The caller never chooses an identity. The authenticated Django user is the only
source of identity. A client may *select* one of its own tenants with the
X-Tenant-ID header, but only if the user holds an ACTIVE Membership there.
"""
import uuid
from typing import Optional

from rest_framework.authentication import SessionAuthentication, TokenAuthentication

from apps.core.context import set_current_tenant_id, set_current_user_id
from apps.core.models import Membership


def resolve_membership(user, tenant_header: Optional[str]) -> Optional[Membership]:
    """Return the user's ACTIVE membership for the requested tenant, or None."""
    if user is None or not user.is_authenticated:
        return None
    memberships = Membership.all_objects.filter(user=user, status="ACTIVE").select_related("tenant")
    memberships = memberships.filter(tenant__status="ACTIVE")
    if tenant_header:
        try:
            tenant_id = uuid.UUID(tenant_header)
        except ValueError:
            return None
        return memberships.filter(tenant_id=tenant_id).first()
    # No explicit choice: only unambiguous when the user belongs to exactly one tenant.
    candidates = list(memberships[:2])
    return candidates[0] if len(candidates) == 1 else None


def bind_request_context(request, user) -> None:
    """Attach the membership to the request and set tenant context for managers."""
    http_request = getattr(request, "_request", request)
    membership = resolve_membership(user, http_request.headers.get("X-Tenant-ID"))
    http_request.membership = membership
    if membership:
        set_current_tenant_id(membership.tenant_id)
        set_current_user_id(str(membership.id))
    else:
        set_current_tenant_id(None)
        set_current_user_id(str(user.pk) if user and user.is_authenticated else None)


class TenantSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result:
            bind_request_context(request, result[0])
        return result


class TenantTokenAuthentication(TokenAuthentication):
    keyword = "Token"

    def authenticate(self, request):
        result = super().authenticate(request)
        if result:
            bind_request_context(request, result[0])
        return result
