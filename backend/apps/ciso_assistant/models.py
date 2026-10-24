from django.db import models


class CisoTenantState(models.Model):
    """
    A tenant's working copy of the CISO Assistant catalogue: control statuses and the risk
    register. Rows are written only by explicit user actions, never by a read.
    """

    tenant = models.OneToOneField("core.Tenant", on_delete=models.CASCADE, related_name="ciso_state")
    controls = models.JSONField(default=list)
    risks = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ciso_tenant_state"

    def __str__(self):
        return f"CISO state for {self.tenant_id}"
