from rest_framework.filters import BaseFilterBackend


class TenantFilterBackend(BaseFilterBackend):
    """
    Fail-closed tenant scoping applied to every viewset.

    Querysets are filtered at request time by the authenticated membership's
    tenant. A model that has a tenant column and a request with no tenant
    context returns nothing rather than everything.
    """

    def filter_queryset(self, request, queryset, view):
        model = queryset.model
        membership = getattr(request, "membership", None)
        tenant_id = membership.tenant_id if membership else None

        if model._meta.model_name == "tenant":
            return queryset.filter(pk=tenant_id) if tenant_id else queryset.none()

        field_names = {f.name for f in model._meta.get_fields()}
        if "tenant" not in field_names:
            return queryset
        if not tenant_id:
            return queryset.none()
        return queryset.filter(tenant_id=tenant_id)
