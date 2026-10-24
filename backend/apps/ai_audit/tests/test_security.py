import io

from rest_framework.test import APIClient

from apps.ai_audit import models as m
from apps.ai_audit.tests.base import PASSWORD, AuditTestCase


class SecurityTests(AuditTestCase):
    def test_anonymous_requests_are_denied_everywhere(self):
        anon = APIClient()
        for url in (
            "/api/v1/ai/systems/", "/api/v1/ai/runs/", "/api/v1/ai/findings/", "/api/v1/ai/datasets/",
            "/api/v1/ai/overview/", "/api/v1/risks/", "/api/v1/tenants/", "/api/v1/memberships/", "/api/v1/permissions/",
            "/api/v1/evidence/", "/api/v1/approval-requests/",
        ):
            self.assertIn(anon.get(url).status_code, (401, 403), url)
        self.assertIn(anon.post("/api/v1/tenants/", {"name": "x", "slug": "x"}, format="json").status_code, (401, 403, 405))

    def test_client_headers_cannot_choose_identity(self):
        anon = APIClient()
        response = anon.get(
            "/api/v1/ai/systems/",
            HTTP_X_TENANT_ID=str(self.tenant_a.id),
            HTTP_X_ACTOR_ID=str(self.members["owner_a"].id),
            HTTP_X_MEMBERSHIP_ID=str(self.members["owner_a"].id),
        )
        self.assertIn(response.status_code, (401, 403))

    def test_cannot_select_a_tenant_without_membership(self):
        client = self.client_for("owner_a")
        client.defaults["HTTP_X_TENANT_ID"] = str(self.tenant_b.id)
        self.assertEqual(client.get("/api/v1/ai/systems/").status_code, 403)

    def test_cross_tenant_reads_and_writes_are_blocked(self):
        system_a = self.seed_sample("owner_a")
        client_b = self.client_for("owner_b")

        # Lists are empty and details are 404 for the other tenant.
        self.assertEqual(client_b.get("/api/v1/ai/systems/").json()["results"], [])
        self.assertEqual(client_b.get(f"/api/v1/ai/systems/{system_a.id}/").status_code, 404)
        ds = m.Dataset.all_objects.filter(system=system_a).first()
        self.assertEqual(client_b.get(f"/api/v1/ai/datasets/{ds.id}/").status_code, 404)
        self.assertEqual(client_b.get(f"/api/v1/ai/datasets/{ds.id}/preview/").status_code, 404)
        self.assertEqual(client_b.get("/api/v1/ai/datasets/").json()["results"], [])

        # B cannot create a model version or dataset on A's system.
        response = client_b.post(
            "/api/v1/ai/model-versions/",
            {"system": str(system_a.id), "version_label": "evil", "source": "predictions_only"}, format="json")
        self.assertEqual(response.status_code, 400)
        upload = io.BytesIO(b"a,b\n1,2\n")
        upload.name = "x.csv"
        response = client_b.post(
            "/api/v1/ai/datasets/",
            {"system": str(system_a.id), "role": "reference", "name": "x", "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 404)

        # B cannot start a run mixing A's objects.
        mv = m.ModelVersion.all_objects.filter(system=system_a).first()
        response = client_b.post(
            "/api/v1/ai/runs/",
            {"system": str(system_a.id), "model_version": str(mv.id), "reference_dataset": str(ds.id), "config": {}},
            format="json")
        self.assertEqual(response.status_code, 404)

        # B cannot write into A by naming its tenant.
        response = client_b.post("/api/v1/ai/systems/", {"name": "S", "purpose": "p", "tenant": str(self.tenant_a.id)}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_legacy_endpoints_are_tenant_scoped(self):
        from apps.risk.models import Risk

        owner_a = self.client_for("owner_a")
        client_b = self.client_for("owner_b")
        self.assertEqual(client_b.get("/api/v1/memberships/").status_code, 403)  # RISK_OWNER lacks tenant.read
        tenants_b = client_b.get("/api/v1/tenants/").json()["results"]
        self.assertEqual([t["slug"] for t in tenants_b], ["org-b"])
        # Tenants cannot be created through the API.
        self.assertEqual(owner_a.post("/api/v1/tenants/", {"name": "n", "slug": "n"}, format="json").status_code, 405)
        self.assertIsNotNone(Risk)

    def test_upload_validation(self):
        system = self.seed_sample()
        owner = self.client_for("owner_a")

        def upload(content, name="x.csv"):
            f = io.BytesIO(content)
            f.name = name
            return owner.post("/api/v1/ai/datasets/", {"system": str(system.id), "role": "reference", "name": "t", "file": f}, format="multipart")

        self.assertEqual(upload(b"a,b\n1,2\n", "x.exe").status_code, 400)
        self.assertEqual(upload(b"").status_code, 400)
        self.assertEqual(upload(b"a,a\n1,2\n").status_code, 400)  # duplicate columns
        self.assertEqual(upload(b"a,b\n\xff\xfe,2\n").status_code, 400)  # not UTF-8
        self.assertEqual(upload(b"a,b\n").status_code, 400)  # no rows
        good = upload(b"a,b\n1,2\n3,4\n")
        self.assertEqual(good.status_code, 201, good.content)
        self.assertEqual(good.json()["row_count"], 2)
        self.assertEqual(len(good.json()["sha256"]), 64)

    def test_read_only_role_cannot_create(self):
        reader = self.client_for("reader_a")
        response = reader.post("/api/v1/ai/systems/", {"name": "S", "purpose": "p"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(reader.get("/api/v1/ai/systems/").status_code, 200)

    def test_login_failure_and_logout(self):
        client = APIClient()
        self.assertEqual(client.post("/api/v1/auth/login/", {"username": "owner_a", "password": "wrong"}, format="json").status_code, 401)
        authed = self.client_for("owner_a")
        self.assertEqual(authed.get("/api/v1/auth/me/").json()["active_membership"]["role"], "RISK_OWNER")
        self.assertEqual(authed.post("/api/v1/auth/logout/").status_code, 204)
        self.assertEqual(authed.get("/api/v1/auth/me/").status_code, 401)
