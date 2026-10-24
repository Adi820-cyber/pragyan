from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.cloud_security.views import (
    CloudAccountViewSet,
    CloudScanViewSet,
    CloudFindingViewSet,
    ProwlerRuleViewSet,
    CloudSecurityOverviewView,
    CloudSecurityDemoSeedView,
)

router = DefaultRouter()
router.register(r"accounts", CloudAccountViewSet, basename="cloud-security-account")
router.register(r"scans", CloudScanViewSet, basename="cloud-security-scan")
router.register(r"findings", CloudFindingViewSet, basename="cloud-security-finding")
router.register(r"rules", ProwlerRuleViewSet, basename="cloud-security-rule")

urlpatterns = [
    path("overview/", CloudSecurityOverviewView.as_view(), name="cloud-security-overview"),
    path("demo/seed/", CloudSecurityDemoSeedView.as_view(), name="cloud-security-demo-seed"),
    path("", include(router.urls)),
]
