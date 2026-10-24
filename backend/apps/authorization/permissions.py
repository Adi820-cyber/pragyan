from rest_framework.permissions import BasePermission
from apps.authorization.engine import PolicyEngine


class HasReskurePermission(BasePermission):
    """
    DRF permission class that delegates authorization to the central Reskure PolicyEngine.
    Usage in ViewSet:
        required_permission = "risk.read"
        permission_classes = [HasReskurePermission]
    """

    def has_permission(self, request, view):
        permission_code = getattr(view, "required_permission", None)
        if not permission_code:
            # Map default HTTP methods if no explicit permission set
            action_map = {
                "GET": "read",
                "HEAD": "read",
                "OPTIONS": "read",
                "POST": "create",
                "PUT": "update",
                "PATCH": "update",
                "DELETE": "delete",
            }
            resource_name = getattr(view, "resource_name", "general")
            permission_code = f"{resource_name}.{action_map.get(request.method, 'read')}"

        actor = getattr(request, "membership", None)

        # A client may not write rows into a tenant other than its own.
        if actor is not None and request.method in ("POST", "PUT", "PATCH"):
            data = request.data if hasattr(request.data, "get") else {}
            for key in ("tenant", "tenant_id"):
                supplied = data.get(key)
                if supplied and str(supplied) != str(actor.tenant_id):
                    self.message = "Cross-tenant write rejected."
                    return False

        decision = PolicyEngine.evaluate(actor, permission_code, context={"ip": request.META.get("REMOTE_ADDR")})
        self.message = decision.reason
        return decision.allowed

    def has_object_permission(self, request, view, obj):
        action_map = {
            "GET": "read",
            "PUT": "update",
            "PATCH": "update",
            "DELETE": "delete",
        }
        resource_name = getattr(view, "resource_name", obj.__class__.__name__.lower())
        permission_code = f"{resource_name}.{action_map.get(request.method, 'read')}"

        actor = getattr(request, "membership", None)
        decision = PolicyEngine.evaluate(actor, permission_code, resource=obj, context={"ip": request.META.get("REMOTE_ADDR")})
        self.message = decision.reason
        return decision.allowed
