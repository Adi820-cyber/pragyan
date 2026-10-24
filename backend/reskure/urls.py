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

from apps.core.auth_views import LoginView, LogoutView, MeView

# Responsible AI audit
from apps.ai_audit import views as ai

router.register(r"ai/systems", ai.AISystemViewSet, basename="ai-system")
router.register(r"ai/model-versions", ai.ModelVersionViewSet, basename="ai-model-version")
router.register(r"ai/datasets", ai.DatasetViewSet, basename="ai-dataset")
router.register(r"ai/runs", ai.AuditRunViewSet, basename="ai-run")
router.register(r"ai/dependencies", ai.DependencyViewSet, basename="ai-dependency")
router.register(r"ai/rights-processes", ai.RightsProcessViewSet, basename="ai-rights-process")
router.register(r"ai/findings", ai.FindingViewSet, basename="ai-finding")
router.register(r"ai/control-assessments", ai.ControlAssessmentViewSet, basename="ai-control-assessment")
router.register(r"ai/control-evidence", ai.ControlEvidenceViewSet, basename="ai-control-evidence")

# NetBox-style Network & Data Path Traversal
from apps.network import views as net

# CISO Assistant GRC Suite
from apps.ciso_assistant import views as ciso

router.register(r"network/devices", net.NetworkDeviceViewSet, basename="network-device")
router.register(r"network/interfaces", net.DeviceInterfaceViewSet, basename="network-interface")
router.register(r"network/cables", net.CableLinkViewSet, basename="network-cable")
router.register(r"network/rules", net.PacketInspectionRuleViewSet, basename="network-rule")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/ai/overview/", ai.OverviewView.as_view(), name="ai-overview"),
    path("api/v1/ai/bundles/", ai.BundleView.as_view(), name="ai-bundles"),
    path("api/v1/ai/members/", ai.MemberListView.as_view(), name="ai-members"),
    path("api/v1/ai/control-packs/", ai.ControlPackView.as_view(), name="ai-control-packs"),
    path("api/v1/ai/demo/seed/", ai.DemoSeedView.as_view(), name="ai-demo-seed"),
    path("api/v1/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/v1/auth/me/", MeView.as_view(), name="auth-me"),
    path("api/v1/network/trace/", net.PacketTraceView.as_view(), name="network-packet-trace"),
    path("api/v1/network/topology/", net.NetworkTopologyView.as_view(), name="network-topology"),
    path("api/v1/network/demo/seed/", net.NetworkSeedDemoView.as_view(), name="network-seed-demo"),
    
    # CISO Assistant Community GRC Suite
    path("api/v1/ciso/overview/", ciso.CisoOverviewView.as_view(), name="ciso-overview"),
    path("api/v1/ciso/frameworks/", ciso.CisoFrameworksView.as_view(), name="ciso-frameworks"),
    path("api/v1/ciso/controls/", ciso.CisoControlsView.as_view(), name="ciso-controls"),
    path("api/v1/ciso/crosswalks/", ciso.CisoCrosswalkView.as_view(), name="ciso-crosswalks"),
    path("api/v1/ciso/risks/", ciso.CisoRisksView.as_view(), name="ciso-risks"),
    path("api/v1/ciso/gaps/", ciso.CisoGapAnalysisView.as_view(), name="ciso-gaps"),
    path("api/v1/ciso/seed/", ciso.CisoResetCatalogView.as_view(), name="ciso-seed"),
    path("api/v1/cloud-security/", include("apps.cloud_security.urls")),
    path("api/v1/", include(router.urls)),

    # OpenAPI Schema & Interactive Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
