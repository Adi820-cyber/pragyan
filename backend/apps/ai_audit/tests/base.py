import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import Membership, Tenant

PASSWORD = "Test-pass-123456"


class AuditTestCase(TestCase):
    """Creates two tenants with users, and gives helpers to call the API as each of them."""

    @classmethod
    def setUpClass(cls):
        cls._media = tempfile.mkdtemp(prefix="reskure-test-media-")
        cls._override = override_settings(PRIVATE_MEDIA_ROOT=cls._media, ALLOW_DEMO_SEED=True)
        cls._override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._override.disable()
        shutil.rmtree(cls._media, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.tenant_a = Tenant.objects.create(name="Org A", slug="org-a")
        cls.tenant_b = Tenant.objects.create(name="Org B", slug="org-b")
        cls.users = {}
        cls.members = {}
        spec = [
            ("owner_a", cls.tenant_a, "RISK_OWNER"),
            ("reviewer_a", cls.tenant_a, "COMPLIANCE_OFFICER"),
            ("reader_a", cls.tenant_a, "AUDITOR"),
            ("owner_b", cls.tenant_b, "RISK_OWNER"),
        ]
        for name, tenant, role in spec:
            user = User.objects.create_user(username=name, email=f"{name}@example.org", password=PASSWORD)
            cls.users[name] = user
            cls.members[name] = Membership.all_objects.create(
                tenant=tenant, user=user, email=user.email, full_name=name, role=role, status="ACTIVE")

    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        cache.clear()  # reset login throttling between tests

    def client_for(self, name, tenant=None):
        client = APIClient()
        response = client.post("/api/v1/auth/login/", {"username": name, "password": PASSWORD}, format="json")
        assert response.status_code == 200, response.content
        client.credentials(HTTP_AUTHORIZATION=f"Token {response.json()['token']}")
        tenant = tenant or self.members[name].tenant
        client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)
        return client

    def seed_sample(self, owner="owner_a"):
        from apps.ai_audit.services.demo import seed_hirelens

        return seed_hirelens(self.members[owner].tenant, self.members[owner])

    def run_worker(self):
        call_command("run_audit_worker", "--once", verbosity=0)
