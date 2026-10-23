from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

# Core & Authorization ViewSets
from apps.core.views import (
    TenantViewSet,
    OrgUnitViewSet,
    MembershipViewSet,
    AuditLogViewSet,
    AccessDecisionLogViewSet,
)
from apps.authorization.views import (
    PermissionViewSet,
    CustomRoleViewSet,
    PolicyRuleViewSet,
)

# Domain ViewSets
from apps.risk.views import RiskViewSet, RiskMatrixConfigViewSet
from apps.compliance.views import (
    FrameworkViewSet,
    ControlViewSet,
    ControlRiskMappingViewSet,
    FrameworkCrosswalkViewSet,
)
from apps.evidence.views import EvidenceViewSet, AttestationViewSet
from apps.workflows.views import WorkflowTemplateViewSet, ApprovalRequestViewSet
from apps.assets.views import (
    CloudConnectionViewSet,
    BusinessServiceViewSet,
    AssetViewSet,
)
from apps.secops.views import (
    AlertSourceViewSet,
    SecurityAlertViewSet,
    ContainmentActionViewSet,
)

router = DefaultRouter()

# Core & Tenancy
router.register(r"tenants", TenantViewSet, basename="tenant")
router.register(r"org-units", OrgUnitViewSet, basename="org-unit")
router.register(r"memberships", MembershipViewSet, basename="membership")
router.register(r"audit-logs", AuditLogViewSet, basename="audit-log")
router.register(r"access-decisions", AccessDecisionLogViewSet, basename="access-decision")

# Authorization
router.register(r"permissions", PermissionViewSet, basename="permission")
router.register(r"custom-roles", CustomRoleViewSet, basename="custom-role")
router.register(r"policy-rules", PolicyRuleViewSet, basename="policy-rule")

# Risk
router.register(r"risks", RiskViewSet, basename="risk")
router.register(r"risk-matrix-config", RiskMatrixConfigViewSet, basename="risk-matrix-config")

# Compliance & Controls
router.register(r"frameworks", FrameworkViewSet, basename="framework")
router.register(r"controls", ControlViewSet, basename="control")
router.register(r"control-risk-mappings", ControlRiskMappingViewSet, basename="control-risk-mapping")
router.register(r"framework-crosswalks", FrameworkCrosswalkViewSet, basename="framework-crosswalk")

# Evidence
router.register(r"evidence", EvidenceViewSet, basename="evidence")
router.register(r"attestations", AttestationViewSet, basename="attestation")

# Workflows & Approvals
router.register(r"workflow-templates", WorkflowTemplateViewSet, basename="workflow-template")
router.register(r"approval-requests", ApprovalRequestViewSet, basename="approval-request")

# Assets & Cloud
router.register(r"cloud-connections", CloudConnectionViewSet, basename="cloud-connection")
router.register(r"business-services", BusinessServiceViewSet, basename="business-service")
router.register(r"assets", AssetViewSet, basename="asset")

# SecOps & Incident Containment
router.register(r"alert-sources", AlertSourceViewSet, basename="alert-source")
router.register(r"security-alerts", SecurityAlertViewSet, basename="security-alert")
router.register(r"containment-actions", ContainmentActionViewSet, basename="containment-action")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(router.urls)),

    # OpenAPI Schema & Interactive Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
