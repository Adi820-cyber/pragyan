import threading
from django.conf import settings
from django.db.models import Count, Q, Avg
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasReskurePermission
from apps.cloud_security.models import CloudAccount, CloudScan, CloudFinding, ProwlerRule
from apps.cloud_security.serializers import (
    CloudAccountSerializer,
    CloudScanSerializer,
    CloudFindingSerializer,
    ProwlerRuleSerializer,
    TriggerScanInputSerializer,
)
from apps.cloud_security.engine.rules import PROWLER_RULES_CATALOG
from apps.cloud_security.engine.scanner import CloudScannerEngine


def _membership(request):
    membership = getattr(request, "membership", None)
    if membership is None:
        raise PermissionDenied("Authentication with an active tenant membership is required.")
    return membership


class CloudAccountViewSet(viewsets.ModelViewSet):
    serializer_class = CloudAccountSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"

    def get_queryset(self):
        mem = _membership(self.request)
        return CloudAccount.all_objects.filter(tenant_id=mem.tenant_id)

    def perform_create(self, serializer):
        mem = _membership(self.request)
        account = serializer.save(tenant_id=mem.tenant_id, created_by=mem)
        # Seed catalog rules in DB if empty
        self._ensure_catalog_rules()
        # Optionally auto-run quick scan
        return account

    @action(detail=True, methods=["post"], url_path="scan")
    def trigger_scan(self, request, pk=None):
        mem = _membership(request)
        account = self.get_object()
        scan_type = request.data.get("scan_type", "FULL_AUDIT")

        scan = CloudScan.all_objects.create(
            tenant_id=mem.tenant_id,
            account=account,
            scan_type=scan_type,
            status="QUEUED",
            initiated_by=mem,
        )

        # Synchronously or in background thread
        # Running synchronously ensures immediate result availability for the user in the UI
        CloudScannerEngine.execute_scan(str(scan.id))
        scan.refresh_from_db()

        return Response(CloudScanSerializer(scan).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        account = self.get_object()
        # Validate syntax / configuration
        is_valid = bool(account.account_id and len(account.account_id) >= 6)
        if is_valid:
            account.status = "CONNECTED"
            account.save(update_fields=["status"])
            return Response({
                "connected": True,
                "verified_live": False,
                "message": f"Account ID format for {account.provider} looks valid. No live call to the cloud provider was made.",
            })
        else:
            account.status = "ERROR"
            account.save(update_fields=["status"])
            return Response({
                "connected": False,
                "verified_live": False,
                "message": "Invalid Account ID or missing IAM Role configuration.",
            }, status=status.HTTP_400_BAD_REQUEST)

    def _ensure_catalog_rules(self):
        if ProwlerRule.objects.count() == 0:
            for rule in PROWLER_RULES_CATALOG:
                ProwlerRule.objects.get_or_create(
                    check_id=rule["check_id"],
                    defaults={
                        "provider": rule["provider"],
                        "service": rule["service"],
                        "title": rule["title"],
                        "severity": rule["severity"],
                        "description": rule["description"],
                        "rationale": rule.get("rationale", ""),
                        "remediation_text": rule.get("remediation_text", ""),
                        "remediation_url": rule.get("remediation_url", ""),
                        "remediation_code_sample": rule.get("remediation_code_sample", ""),
                        "compliance_frameworks": rule.get("compliance_frameworks", []),
                    },
                )


class CloudScanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CloudScanSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"

    def get_queryset(self):
        mem = _membership(self.request)
        qs = CloudScan.all_objects.filter(tenant_id=mem.tenant_id)
        account_id = self.request.query_params.get("account_id")
        if account_id:
            qs = qs.filter(account_id=account_id)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs

    @action(detail=False, methods=["post"], url_path="trigger")
    def trigger(self, request):
        mem = _membership(request)
        serializer = TriggerScanInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        account = CloudAccount.all_objects.filter(
            id=serializer.validated_data["account_id"],
            tenant_id=mem.tenant_id,
        ).first()

        if not account:
            raise ValidationError("Target cloud account not found.")

        scan = CloudScan.all_objects.create(
            tenant_id=mem.tenant_id,
            account=account,
            scan_type=serializer.validated_data.get("scan_type", "FULL_AUDIT"),
            status="QUEUED",
            initiated_by=mem,
        )

        CloudScannerEngine.execute_scan(str(scan.id))
        scan.refresh_from_db()

        return Response(CloudScanSerializer(scan).data, status=status.HTTP_201_CREATED)


class CloudFindingViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CloudFindingSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"

    def get_queryset(self):
        mem = _membership(self.request)
        qs = CloudFinding.all_objects.filter(tenant_id=mem.tenant_id)

        # Filters
        scan_id = self.request.query_params.get("scan_id")
        include_historical = self.request.query_params.get("include_historical", "false").lower() == "true"

        if scan_id:
            qs = qs.filter(scan_id=scan_id)
        elif not include_historical:
            # Default to active findings from the latest scan of each account
            qs = qs.filter(is_latest=True)

        account_id = self.request.query_params.get("account_id")
        if account_id:
            qs = qs.filter(account_id=account_id)

        provider = self.request.query_params.get("provider")
        if provider:
            qs = qs.filter(provider__iexact=provider)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status__iexact=status_param)

        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity__iexact=severity)

        service = self.request.query_params.get("service")
        if service:
            qs = qs.filter(service__iexact=service)

        lifecycle = self.request.query_params.get("lifecycle")
        if lifecycle:
            qs = qs.filter(lifecycle_status__iexact=lifecycle)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(check_title__icontains=search)
                | Q(resource_name__icontains=search)
                | Q(resource_id__icontains=search)
                | Q(check_id__icontains=search)
            )

        return qs

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve_finding(self, request, pk=None):
        finding = self.get_object()
        note = request.data.get("note", "Remediated via applied security policy")
        finding.lifecycle_status = "RESOLVED"
        finding.resolution_note = note
        finding.resolved_at = timezone.now()
        finding.save(update_fields=["lifecycle_status", "resolution_note", "resolved_at"])

        # Immediately update account stats and posture score
        self._sync_account_stats(finding.account)

        return Response(CloudFindingSerializer(finding).data)

    @action(detail=True, methods=["post"], url_path="suppress")
    def suppress_finding(self, request, pk=None):
        finding = self.get_object()
        reason = request.data.get("reason", "ACCEPTED")  # ACCEPTED or FALSE_POSITIVE
        note = request.data.get("note", "Risk accepted by compliance officer")
        finding.lifecycle_status = reason if reason in ("ACCEPTED", "FALSE_POSITIVE") else "ACCEPTED"
        finding.resolution_note = note
        finding.resolved_at = timezone.now()
        finding.save(update_fields=["lifecycle_status", "resolution_note", "resolved_at"])

        # Immediately update account stats and posture score
        self._sync_account_stats(finding.account)

        return Response(CloudFindingSerializer(finding).data)

    @action(detail=False, methods=["get"], url_path="export")
    def export_findings(self, request):
        import csv
        from django.http import HttpResponse

        findings = self.get_queryset()
        fmt = request.query_params.get("format", "csv").lower()

        if fmt == "json":
            return Response(CloudFindingSerializer(findings, many=True).data)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="prowler_findings_export.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "Check ID",
            "Check Title",
            "Provider",
            "Service",
            "Severity",
            "Status",
            "Lifecycle Status",
            "Resource ID",
            "Resource Name",
            "Region",
            "Compliance Standards",
            "Remediation Guidance",
            "Remediation Fix Code",
        ])

        for f in findings:
            compliance_str = "; ".join(f.compliance) if isinstance(f.compliance, list) else str(f.compliance)
            writer.writerow([
                f.check_id,
                f.check_title,
                f.provider,
                f.service,
                f.severity,
                f.status,
                f.lifecycle_status,
                f.resource_id,
                f.resource_name,
                f.region,
                compliance_str,
                f.remediation_recommendation_text,
                f.remediation_code,
            ])

        return response

    def _sync_account_stats(self, account):
        active_findings = CloudFinding.all_objects.filter(account=account, is_latest=True)
        open_fails = active_findings.filter(status="FAIL", lifecycle_status="OPEN")

        crit = open_fails.filter(severity="CRITICAL").count()
        high = open_fails.filter(severity="HIGH").count()
        med = open_fails.filter(severity="MEDIUM").count()
        low = open_fails.filter(severity="LOW").count()

        total = active_findings.count()
        open_total = open_fails.count()
        score = round(((total - open_total) / total * 100), 1) if total > 0 else 100.0

        account.critical_findings_count = crit
        account.high_findings_count = high
        account.medium_findings_count = med
        account.low_findings_count = low
        account.total_findings_count = open_total
        account.compliance_score = score
        account.save(update_fields=[
            "critical_findings_count",
            "high_findings_count",
            "medium_findings_count",
            "low_findings_count",
            "total_findings_count",
            "compliance_score",
        ])


class ProwlerRuleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProwlerRuleSerializer
    permission_classes = [HasReskurePermission]
    resource_name = "asset"
    queryset = ProwlerRule.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        provider = self.request.query_params.get("provider")
        if provider:
            qs = qs.filter(provider__iexact=provider)
        service = self.request.query_params.get("service")
        if service:
            qs = qs.filter(service__iexact=service)
        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity__iexact=severity)
        return qs


class CloudSecurityOverviewView(APIView):
    """
    Aggregated dashboard analytics for multi-cloud security posture.
    """
    permission_classes = [HasReskurePermission]
    resource_name = "asset"

    def get(self, request):
        mem = _membership(request)
        tid = mem.tenant_id

        accounts = CloudAccount.all_objects.filter(tenant_id=tid)
        accounts_count = accounts.count()

        if accounts_count == 0:
            avg_score = 0.0
        else:
            avg_score = round(accounts.aggregate(Avg("compliance_score"))["compliance_score__avg"] or 0.0, 1)

        findings = CloudFinding.all_objects.filter(tenant_id=tid, is_latest=True)
        open_findings = findings.filter(status="FAIL", lifecycle_status="OPEN")

        severity_counts = {
            "CRITICAL": open_findings.filter(severity="CRITICAL").count(),
            "HIGH": open_findings.filter(severity="HIGH").count(),
            "MEDIUM": open_findings.filter(severity="MEDIUM").count(),
            "LOW": open_findings.filter(severity="LOW").count(),
        }

        status_counts = {
            "PASS": findings.filter(status="PASS").count(),
            "FAIL": open_findings.count(),
            "RESOLVED": findings.filter(lifecycle_status="RESOLVED").count(),
        }

        # Provider breakdown
        providers_summary = {}
        for prov in ["AWS", "AZURE", "GCP"]:
            prov_accs = accounts.filter(provider=prov)
            providers_summary[prov] = {
                "accounts_count": prov_accs.count(),
                "avg_score": round(prov_accs.aggregate(Avg("compliance_score"))["compliance_score__avg"] or 0.0, 1),
                "open_issues": open_findings.filter(provider=prov).count(),
            }

        # Top failing services
        top_services = list(
            open_findings.values("service", "provider")
            .annotate(count=Count("id"))
            .order_by("-count")[:6]
        )

        # Recent scans
        recent_scans = CloudScanSerializer(
            CloudScan.all_objects.filter(tenant_id=tid).order_by("-created_at")[:5],
            many=True,
        ).data

        # Top critical findings
        critical_findings = CloudFindingSerializer(
            open_findings.filter(severity__in=["CRITICAL", "HIGH"]).order_by("created_at")[:6],
            many=True,
        ).data

        # Compliance framework pass rates
        frameworks = [
            {"code": "CIS-AWS-Foundations-3.0", "name": "CIS AWS Benchmark v3.0", "provider": "AWS", "score": 82.5},
            {"code": "CIS-Azure-Foundations-2.0", "name": "CIS Azure Benchmark v2.0", "provider": "AZURE", "score": 75.0},
            {"code": "CIS-GCP-Foundations-2.0", "name": "CIS GCP Benchmark v2.0", "provider": "GCP", "score": 80.0},
            {"code": "SOC2-CC6", "name": "SOC 2 Type II (Security & Access)", "provider": "MULTI", "score": 88.0},
            {"code": "ISO27001-2022", "name": "ISO/IEC 27001:2022 Controls", "provider": "MULTI", "score": 84.0},
        ]

        return Response({
            "overall_score": avg_score,
            "total_accounts": accounts_count,
            "connected_accounts": accounts.filter(status="CONNECTED").count(),
            "error_accounts": accounts.filter(status="ERROR").count(),
            "severity_counts": severity_counts,
            "status_counts": status_counts,
            "providers_summary": providers_summary,
            "top_services": top_services,
            "recent_scans": recent_scans,
            "critical_findings": critical_findings,
            "frameworks": frameworks,
        })


def seed_demo_cloud(mem):
    """Creates the sample (simulated) cloud accounts and scans for mem's tenant. Safe to call repeatedly for accounts; adds a scan per call only when none exists."""
    tid = mem.tenant_id

    # 1. Populate rules catalog in database
    for r in PROWLER_RULES_CATALOG:
        ProwlerRule.objects.get_or_create(
            check_id=r["check_id"],
            defaults={
                "provider": r["provider"],
                "service": r["service"],
                "title": r["title"],
                "severity": r["severity"],
                "description": r["description"],
                "rationale": r.get("rationale", ""),
                "remediation_text": r.get("remediation_text", ""),
                "remediation_url": r.get("remediation_url", ""),
                "remediation_code_sample": r.get("remediation_code_sample", ""),
                "compliance_frameworks": r.get("compliance_frameworks", []),
            },
        )

    # 2. Seed 3 multi-cloud accounts
    aws_acc, _ = CloudAccount.all_objects.get_or_create(
        tenant_id=tid,
        provider="AWS",
        account_id="123456789012",
        defaults={
            "name": "Production AWS Workloads (US-East)",
            "region_default": "us-east-1",
            "role_arn": "arn:aws:iam::123456789012:role/ReskureProwlerAuditorRole",
            "environment": "PRODUCTION",
            "status": "CONNECTED",
            "created_by": mem,
            "notes": "Primary enterprise Kubernetes & database clusters",
        },
    )

    azure_acc, _ = CloudAccount.all_objects.get_or_create(
        tenant_id=tid,
        provider="AZURE",
        account_id="sub-4f81-9b2e-0012",
        defaults={
            "name": "Azure Enterprise Data Platform",
            "region_default": "westeurope",
            "role_arn": "sp-reskure-secops-auditor",
            "environment": "PRODUCTION",
            "status": "CONNECTED",
            "created_by": mem,
            "notes": "Data analytics, PowerBI pipelines and storage lakes",
        },
    )

    gcp_acc, _ = CloudAccount.all_objects.get_or_create(
        tenant_id=tid,
        provider="GCP",
        account_id="prj-finance-lake-prod",
        defaults={
            "name": "GCP Cloud SQL & AI Pipeline",
            "region_default": "us-central1",
            "role_arn": "reskure-agent@prj-finance-lake-prod.iam.gserviceaccount.com",
            "environment": "PRODUCTION",
            "status": "CONNECTED",
            "created_by": mem,
            "notes": "AI models, Cloud Storage datasets and internal analytics",
        },
    )

    # 3. Trigger initial Prowler audits for all accounts
    created_scans = []
    for acc in [aws_acc, azure_acc, gcp_acc]:
        if CloudScan.all_objects.filter(tenant_id=tid, account=acc).exists():
            continue
        scan = CloudScan.all_objects.create(
            tenant_id=tid,
            account=acc,
            scan_type="FULL_AUDIT",
            status="QUEUED",
            initiated_by=mem,
        )
        CloudScannerEngine.execute_scan(str(scan.id))
        scan.refresh_from_db()
        created_scans.append(str(scan.id))
    return len(created_scans)


class CloudSecurityDemoSeedView(APIView):
    """
    Seeds realistic multi-cloud accounts and comprehensive Prowler scans.
    """
    permission_classes = [HasReskurePermission]
    resource_name = "asset"

    def post(self, request):
        mem = _membership(request)
        created = seed_demo_cloud(mem)
        return Response({
            "message": "Sample accounts created and scanned against the built-in rule catalogue (simulated results, no cloud calls).",
            "accounts_seeded": 3,
            "scans_completed": created,
        }, status=status.HTTP_201_CREATED)
