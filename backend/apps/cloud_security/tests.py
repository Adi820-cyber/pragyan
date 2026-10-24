from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tenant, Membership
from apps.cloud_security.models import CloudAccount, CloudScan, CloudFinding, ProwlerRule
from apps.cloud_security.engine.rules import PROWLER_RULES_CATALOG
from apps.cloud_security.engine.scanner import CloudScannerEngine

PASSWORD = "Test-pass-123456"


class CloudSecurityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.tenant_a = Tenant.objects.create(name="Acme Security", slug="acme-sec")
        cls.tenant_b = Tenant.objects.create(name="Globex Corp", slug="globex-corp")

        cls.user_a = User.objects.create_user(username="admin_a", email="admin_a@acme.org", password=PASSWORD)
        cls.member_a = Membership.all_objects.create(
            tenant=cls.tenant_a,
            user=cls.user_a,
            email=cls.user_a.email,
            full_name="Admin A",
            role="TENANT_ADMIN",
            status="ACTIVE",
        )

        cls.user_b = User.objects.create_user(username="admin_b", email="admin_b@globex.org", password=PASSWORD)
        cls.member_b = Membership.all_objects.create(
            tenant=cls.tenant_b,
            user=cls.user_b,
            email=cls.user_b.email,
            full_name="Admin B",
            role="TENANT_ADMIN",
            status="ACTIVE",
        )

    def client_for(self, user, member):
        client = APIClient()
        res = client.post("/api/v1/auth/login/", {"username": user.username, "password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 200)
        token = res.json()["token"]
        client.credentials(HTTP_AUTHORIZATION=f"Token {token}", HTTP_X_TENANT_ID=str(member.tenant_id))
        return client

    def test_rules_catalog_validity(self):
        """Verifies Prowler catalog rules have required fields and valid frameworks."""
        self.assertGreater(len(PROWLER_RULES_CATALOG), 10)
        providers = {r["provider"] for r in PROWLER_RULES_CATALOG}
        self.assertIn("AWS", providers)
        self.assertIn("AZURE", providers)
        self.assertIn("GCP", providers)

        for rule in PROWLER_RULES_CATALOG:
            self.assertTrue(rule["check_id"])
            self.assertIn(rule["severity"], ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"])
            self.assertTrue(rule["title"])
            self.assertTrue(rule["remediation_text"])
            self.assertTrue(isinstance(rule["compliance_frameworks"], list))

    def test_cloud_account_and_scan_flow(self):
        """Creates an AWS account, triggers a Prowler scan, and validates findings generation."""
        client_a = self.client_for(self.user_a, self.member_a)

        # 1. Create account
        acc_payload = {
            "name": "AWS Production Workloads",
            "provider": "AWS",
            "account_id": "123456789012",
            "region_default": "us-east-1",
            "role_arn": "arn:aws:iam::123456789012:role/SecurityAuditRole",
            "environment": "PRODUCTION",
            "notes": "Main payment workloads",
        }
        res = client_a.post("/api/v1/cloud-security/accounts/", acc_payload, format="json")
        self.assertEqual(res.status_code, 201)
        account_id = res.json()["id"]

        # 2. Trigger scan
        scan_payload = {
            "account_id": account_id,
            "scan_type": "FULL_AUDIT",
        }
        res_scan = client_a.post("/api/v1/cloud-security/scans/trigger/", scan_payload, format="json")
        self.assertEqual(res_scan.status_code, 201)
        scan_data = res_scan.json()
        self.assertEqual(scan_data["status"], "COMPLETED")
        self.assertGreater(scan_data["total_checks"], 0)
        self.assertGreater(scan_data["failed_checks"], 0)
        self.assertGreater(scan_data["passed_checks"], 0)
        self.assertGreater(scan_data["compliance_score"], 0)

        # 3. List findings
        res_findings = client_a.get(f"/api/v1/cloud-security/findings/?account_id={account_id}")
        self.assertEqual(res_findings.status_code, 200)
        findings_data = res_findings.json()
        findings_list = findings_data.get("results", findings_data)
        self.assertGreater(len(findings_list), 0)

        first_finding = findings_list[0]
        self.assertIn("remediation_code", first_finding)
        self.assertIn("compliance", first_finding)

        # 4. Resolve finding action
        res_resolve = client_a.post(
            f"/api/v1/cloud-security/findings/{first_finding['id']}/resolve/",
            {"note": "Remediated via applied CLI command"},
            format="json",
        )
        self.assertEqual(res_resolve.status_code, 200)
        self.assertEqual(res_resolve.json()["lifecycle_status"], "RESOLVED")

    def test_overview_endpoint(self):
        """Tests aggregated security posture overview."""
        client_a = self.client_for(self.user_a, self.member_a)

        # Seed demo data
        seed_res = client_a.post("/api/v1/cloud-security/demo/seed/", format="json")
        self.assertEqual(seed_res.status_code, 201)

        # Check overview
        res = client_a.get("/api/v1/cloud-security/overview/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_accounts"], 3)
        self.assertGreater(data["overall_score"], 0)
        self.assertIn("AWS", data["providers_summary"])
        self.assertIn("AZURE", data["providers_summary"])
        self.assertIn("GCP", data["providers_summary"])
        self.assertGreater(len(data["critical_findings"]), 0)

    def test_tenant_isolation(self):
        """Ensures Tenant B cannot see or tamper with Tenant A's cloud security scans."""
        client_a = self.client_for(self.user_a, self.member_a)
        client_b = self.client_for(self.user_b, self.member_b)

        # Tenant A creates an account
        res_a = client_a.post("/api/v1/cloud-security/accounts/", {
            "name": "Secret A Cloud",
            "provider": "AWS",
            "account_id": "999888777666",
            "region_default": "us-east-1",
        }, format="json")
        self.assertEqual(res_a.status_code, 201)
        acc_id = res_a.json()["id"]

        # Tenant B should NOT see Tenant A's account
        res_b_list = client_b.get("/api/v1/cloud-security/accounts/")
        self.assertEqual(res_b_list.status_code, 200)
        b_accounts = res_b_list.json().get("results", res_b_list.json())
        self.assertEqual(len(b_accounts), 0)

        # Tenant B cannot access Tenant A's account detail
        res_b_detail = client_b.get(f"/api/v1/cloud-security/accounts/{acc_id}/")
        self.assertEqual(res_b_detail.status_code, 404)

    def test_findings_export_csv(self):
        """Verifies CSV export endpoint returns valid CSV file with findings."""
        client_a = self.client_for(self.user_a, self.member_a)
        client_a.post("/api/v1/cloud-security/demo/seed/", format="json")

        res = client_a.get("/api/v1/cloud-security/findings/export/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", res["Content-Disposition"])
        content = res.content.decode("utf-8")
        self.assertIn("Check ID,Check Title,Provider", content)
        self.assertIn("iam_root_mfa_enabled", content)

    def test_multi_scan_is_latest_and_score_sync(self):
        """Verifies running multiple scans marks previous findings as not latest and resolution updates score."""
        client_a = self.client_for(self.user_a, self.member_a)

        acc_res = client_a.post("/api/v1/cloud-security/accounts/", {
            "name": "AWS Production Test",
            "provider": "AWS",
            "account_id": "111222333444",
            "region_default": "us-east-1",
        }, format="json")
        acc_id = acc_res.json()["id"]

        # Run Scan 1
        client_a.post(f"/api/v1/cloud-security/accounts/{acc_id}/scan/", format="json")
        initial_findings = client_a.get(f"/api/v1/cloud-security/findings/?account_id={acc_id}").json()
        count_1 = len(initial_findings.get("results", initial_findings))

        # Run Scan 2
        client_a.post(f"/api/v1/cloud-security/accounts/{acc_id}/scan/", format="json")
        second_findings = client_a.get(f"/api/v1/cloud-security/findings/?account_id={acc_id}").json()
        count_2 = len(second_findings.get("results", second_findings))

        # Without duplicates, count_2 equals count_1
        self.assertEqual(count_1, count_2)

        # Historical query contains 2x
        historical = client_a.get(f"/api/v1/cloud-security/findings/?account_id={acc_id}&include_historical=true").json()
        hist_count = len(historical.get("results", historical))
        self.assertEqual(hist_count, count_1 * 2)

        # Resolving a finding increases account compliance score
        acc_before = CloudAccount.all_objects.get(id=acc_id)
        score_before = acc_before.compliance_score

        first_finding = second_findings.get("results", second_findings)[0]
        client_a.post(f"/api/v1/cloud-security/findings/{first_finding['id']}/resolve/", {"note": "Fixed"}, format="json")

        acc_after = CloudAccount.all_objects.get(id=acc_id)
        self.assertGreaterEqual(acc_after.compliance_score, score_before)

