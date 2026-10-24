from django.contrib.auth import get_user_model

from apps.ai_audit.tests.base import PASSWORD, AuditTestCase
from apps.core.models import Membership

BASE = "/api/v1/ciso"


class CisoAssistantApiTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.reader = self.client_for("reader_a")
        self.other = self.client_for("owner_b")
        user = get_user_model().objects.create_user(username="admin_a", email="admin_a@example.org", password=PASSWORD)
        self.members["admin_a"] = Membership.all_objects.create(
            tenant=self.tenant_a, user=user, email=user.email, full_name="admin_a", role="TENANT_ADMIN", status="ACTIVE")
        self.admin = self.client_for("admin_a")

    def first_control(self, client):
        return client.get(f"{BASE}/controls/").json()["controls"][0]

    def test_anonymous_and_membershipless_users_are_denied(self):
        from rest_framework.test import APIClient

        for path in ("overview", "controls", "risks", "gaps", "frameworks", "crosswalks"):
            self.assertIn(APIClient().get(f"{BASE}/{path}/").status_code, (401, 403), path)

    def test_reads_do_not_create_rows_and_are_labelled_baseline(self):
        from apps.ciso_assistant.models import CisoTenantState

        data = self.reader.get(f"{BASE}/overview/").json()
        self.assertTrue(data["is_baseline"])
        self.assertEqual(CisoTenantState.objects.count(), 0)

    def test_status_change_is_stored_per_tenant_and_isolated(self):
        control = self.first_control(self.owner)
        new = "NOT_STARTED" if control["status"] != "NOT_STARTED" else "IN_PROGRESS"
        resp = self.owner.patch(f"{BASE}/controls/", {"code": control["code"], "status": new}, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        mine = next(c for c in self.owner.get(f"{BASE}/controls/").json()["controls"] if c["code"] == control["code"])
        theirs = next(c for c in self.other.get(f"{BASE}/controls/").json()["controls"] if c["code"] == control["code"])
        self.assertEqual(mine["status"], new)
        self.assertEqual(theirs["status"], control["status"])
        self.assertFalse(self.owner.get(f"{BASE}/overview/").json()["is_baseline"])

    def test_invalid_status_and_missing_fields_are_rejected(self):
        control = self.first_control(self.owner)
        self.assertEqual(self.owner.patch(f"{BASE}/controls/", {"code": control["code"], "status": "DONE!"}, format="json").status_code, 400)
        self.assertEqual(self.owner.patch(f"{BASE}/controls/", {"code": control["code"]}, format="json").status_code, 400)
        self.assertEqual(self.owner.patch(f"{BASE}/controls/", {"code": "NOPE", "status": "IMPLEMENTED"}, format="json").status_code, 404)

    def test_read_only_role_cannot_write(self):
        control = self.first_control(self.reader)
        self.assertEqual(self.reader.patch(f"{BASE}/controls/", {"code": control["code"], "status": "IN_PROGRESS"}, format="json").status_code, 403)
        self.assertEqual(self.reader.post(f"{BASE}/risks/", {"title": "x"}, format="json").status_code, 403)

    def test_risk_validation(self):
        bad = [{}, {"title": "t", "inherent_likelihood": 9}, {"title": "t", "inherent_impact": "abc"},
               {"title": "t", "category": "WEIRD"}, {"title": "t" * 500}]
        for payload in bad:
            self.assertEqual(self.owner.post(f"{BASE}/risks/", payload, format="json").status_code, 400, payload)
        ok = self.owner.post(f"{BASE}/risks/", {"title": "Model theft", "inherent_likelihood": 4, "inherent_impact": 5}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.json()["inherent_severity"], "CRITICAL")
        titles = [r["title"] for r in self.owner.get(f"{BASE}/risks/").json()["risks"]]
        self.assertIn("Model theft", titles)
        other_titles = [r["title"] for r in self.other.get(f"{BASE}/risks/").json()["risks"]]
        self.assertNotIn("Model theft", other_titles)

    def test_reset_is_admin_only(self):
        control = self.first_control(self.owner)
        self.owner.patch(f"{BASE}/controls/", {"code": control["code"], "status": "IN_PROGRESS"}, format="json")
        self.assertEqual(self.owner.post(f"{BASE}/seed/", {}, format="json").status_code, 403)
        self.assertEqual(self.admin.post(f"{BASE}/seed/", {}, format="json").status_code, 200)
        self.assertTrue(self.owner.get(f"{BASE}/overview/").json()["is_baseline"])
