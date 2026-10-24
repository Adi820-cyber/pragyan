from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings

from apps.ai_audit.tests.base import PASSWORD, AuditTestCase
from apps.core.models import Membership
from apps.network.models import CableLink, DeviceInterface, NetworkDevice
from apps.network.traversal_engine import port_matches, seed_demo_network, trace_packet_path


class PortMatchingTests(SimpleTestCase):
    def test_rule_port_formats(self):
        self.assertTrue(port_matches("*", "443"))
        self.assertTrue(port_matches("443", "443"))
        self.assertFalse(port_matches("443", "80"))
        self.assertTrue(port_matches("23,3389", "23"))
        self.assertTrue(port_matches("23,3389", "3389"))
        self.assertFalse(port_matches("23,3389", "443"))
        self.assertTrue(port_matches("8000-9000", "8443"))
        self.assertFalse(port_matches("8000-9000", "9001"))
        self.assertTrue(port_matches("22, 8000-9000", "8000"))
        self.assertFalse(port_matches("abc", "443"))
        self.assertFalse(port_matches("443", "not-a-port"))


class TraceEngineTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.tenant = self.members["owner_a"].tenant
        seed_demo_network(self.tenant)

    def iface(self, device_prefix, name_part):
        return next(
            i for i in DeviceInterface.all_objects.select_related("device").filter(tenant=self.tenant)
            if i.device.name.startswith(device_prefix) and name_part in i.name
        )

    def trace(self, port="443", protocol="HTTPS", size=1420, cut=None, dst=("dgx-infer-01", "net0")):
        return trace_packet_path(
            str(self.tenant.id), str(self.iface("edge-rt01", "Hundred").id), str(self.iface(*dst).id),
            protocol, str(port), size, "test payload", assume_severed_cables=cut,
        )

    def test_normal_traffic_is_delivered_through_the_patch_panel(self):
        result = self.trace()
        self.assertEqual(result["status"], "DELIVERED", result["termination_reason"])
        actions = [h["action"] for h in result["hops"]]
        self.assertIn("PASS_THROUGH", actions)
        self.assertEqual(actions[-1], "DELIVERED")
        self.assertGreaterEqual(result["total_hops"], 6)
        self.assertEqual(result["compliance_score"], "COMPLIANT")

    def test_legacy_ports_are_blocked_by_the_firewall_rule(self):
        for port in ("23", "3389"):
            result = self.trace(port=port, protocol="TCP", size=64)
            self.assertEqual(result["status"], "BLOCKED_FIREWALL", port)
            self.assertEqual(result["compliance_score"], "FAILED_DELIVERY")
            self.assertEqual(result["hops"][-1]["action"], "FIREWALL_DROP")
        self.assertEqual(self.trace(port="8443", protocol="GRPC")["status"], "DELIVERED")

    def test_what_if_cut_cable_does_not_change_stored_data(self):
        result = self.trace(cut=["TRK-MPO-003"])
        self.assertEqual(result["status"], "SEVERED_CABLE")
        self.assertIn("assumed cut", result["termination_reason"])
        self.assertEqual(CableLink.all_objects.get(tenant=self.tenant, label="TRK-MPO-003").status, "CONNECTED")
        self.assertEqual(self.trace()["status"], "DELIVERED")

    def test_really_severed_cable_and_offline_device(self):
        CableLink.all_objects.filter(tenant=self.tenant, label="TRK-MPO-003").update(status="SEVERED")
        self.assertEqual(self.trace()["status"], "SEVERED_CABLE")
        CableLink.all_objects.filter(tenant=self.tenant, label="TRK-MPO-003").update(status="CONNECTED")
        NetworkDevice.all_objects.filter(tenant=self.tenant, name__startswith="core-sw01").update(status="OFFLINE")
        self.assertEqual(self.trace()["status"], "DROPPED")

    def test_mtu_problem_is_reported(self):
        result = self.trace(size=8900)
        self.assertTrue(any(h.get("mtu_issue") for h in result["hops"]))
        self.assertLessEqual(result["bottleneck_mtu"], 1500)

    def test_bad_or_foreign_ids_are_errors_not_crashes(self):
        good = str(self.iface("edge-rt01", "Hundred").id)
        self.assertEqual(trace_packet_path(str(self.tenant.id), "not-a-uuid", good)["status"], "ERROR")
        other = self.members["owner_b"].tenant
        self.assertEqual(trace_packet_path(str(other.id), good, good)["status"], "ERROR")


class NetworkApiTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.reviewer = self.client_for("reviewer_a")
        self.reader = self.client_for("reader_a")
        self.other = self.client_for("owner_b")
        User = get_user_model()
        user = User.objects.create_user(username="admin_a", email="admin_a@example.org", password=PASSWORD)
        self.members["admin_a"] = Membership.all_objects.create(
            tenant=self.tenant_a, user=user, email=user.email, full_name="admin_a", role="TENANT_ADMIN", status="ACTIVE")
        self.admin = self.client_for("admin_a")

    def seed(self):
        return self.admin.post("/api/v1/network/demo/seed/", {}, format="json")

    def test_anonymous_and_membershipless_users_are_denied(self):
        from rest_framework.test import APIClient

        anon = APIClient()
        for url in ("/api/v1/network/topology/", "/api/v1/network/devices/", "/api/v1/network/cables/"):
            self.assertIn(anon.get(url).status_code, (401, 403), url)
        get_user_model().objects.create_user(username="nobody", email="nobody@example.org", password=PASSWORD)
        stray = APIClient()
        token = stray.post("/api/v1/auth/login/", {"username": "nobody", "password": PASSWORD}, format="json").json()["token"]
        stray.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.seed()
        # A user with no organisation must never be handed someone else's network.
        self.assertEqual(stray.get("/api/v1/network/topology/").status_code, 403)
        self.assertEqual(stray.get("/api/v1/network/devices/").status_code, 403)

    def test_reading_never_creates_data(self):
        topo = self.owner.get("/api/v1/network/topology/").json()
        self.assertEqual(topo["devices"], [])
        self.assertEqual(NetworkDevice.all_objects.count(), 0)
        self.assertEqual(self.owner.get("/api/v1/network/devices/").json()["results"], [])
        self.assertEqual(NetworkDevice.all_objects.count(), 0)

    def test_seeding_is_admin_only_explicit_and_not_destructive_by_default(self):
        self.assertEqual(self.owner.post("/api/v1/network/demo/seed/", {}, format="json").status_code, 403)
        self.assertEqual(self.reviewer.post("/api/v1/network/demo/seed/", {}, format="json").status_code, 403)
        first = self.seed()
        self.assertEqual(first.status_code, 201, first.content)
        before = NetworkDevice.all_objects.filter(tenant=self.tenant_a).count()
        self.assertGreater(before, 0)
        self.assertEqual(self.seed().status_code, 409)
        self.assertEqual(NetworkDevice.all_objects.filter(tenant=self.tenant_a).count(), before)
        replaced = self.admin.post("/api/v1/network/demo/seed/", {"replace": True}, format="json")
        self.assertEqual(replaced.status_code, 201)
        with override_settings(ALLOW_DEMO_SEED=False):
            self.assertEqual(self.admin.post("/api/v1/network/demo/seed/", {"replace": True}, format="json").status_code, 403)

    def test_tenants_cannot_see_or_trace_each_others_networks(self):
        self.seed()
        topo = self.owner.get("/api/v1/network/topology/").json()
        self.assertTrue(topo["devices"])
        self.assertEqual(self.other.get("/api/v1/network/topology/").json()["devices"], [])
        self.assertEqual(self.other.get("/api/v1/network/devices/").json()["results"], [])
        device_id = topo["devices"][0]["id"]
        self.assertEqual(self.other.get(f"/api/v1/network/devices/{device_id}/").status_code, 404)
        a = topo["devices"][0]["interfaces"][0]["id"]
        trace = self.other.post("/api/v1/network/trace/", {"source_interface_id": a, "destination_interface_id": a}, format="json")
        self.assertEqual(trace.status_code, 404)

    def test_roles_can_trace_but_only_reviewers_and_admins_can_edit(self):
        self.seed()
        topo = self.owner.get("/api/v1/network/topology/").json()
        ids = {d["name"].split(".")[0]: d for d in topo["devices"]}
        src = ids["edge-rt01"]["interfaces"][0]["id"]
        dst = next(i["id"] for i in ids["dgx-infer-01"]["interfaces"] if "net0" in i["name"])
        body = {"source_interface_id": src, "destination_interface_id": dst, "protocol": "HTTPS", "destination_port": 443}
        for client in (self.reader, self.owner, self.reviewer, self.admin):
            response = client.post("/api/v1/network/trace/", body, format="json")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()["status"], "DELIVERED")
        device = {"name": "new-sw", "role": "TOR_SWITCH"}
        self.assertEqual(self.reader.post("/api/v1/network/devices/", device, format="json").status_code, 403)
        self.assertEqual(self.owner.post("/api/v1/network/devices/", device, format="json").status_code, 403)
        created = self.reviewer.post("/api/v1/network/devices/", device, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(NetworkDevice.all_objects.get(name="new-sw").tenant_id, self.tenant_a.id)
        # Duplicate names are a clean 400, not a server error.
        self.assertEqual(self.reviewer.post("/api/v1/network/devices/", device, format="json").status_code, 400)
        self.assertEqual(self.reader.delete(f"/api/v1/network/devices/{created.json()['id']}/").status_code, 403)

    def test_cables_cannot_join_foreign_or_identical_ports(self):
        self.seed()
        topo = self.reviewer.get("/api/v1/network/topology/").json()
        ports = [i["id"] for d in topo["devices"] for i in d["interfaces"]]
        same = self.reviewer.post("/api/v1/network/cables/", {"label": "X", "termination_a": ports[0], "termination_b": ports[0]}, format="json")
        self.assertEqual(same.status_code, 400)
        # A second tenant with its own port tries to attach a cable to tenant A's port.
        self.members["owner_b"].tenant  # noqa: B018
        get_user_model().objects.create_user(username="rev_b", email="rev_b@example.org", password=PASSWORD)
        rev_b = Membership.all_objects.create(
            tenant=self.tenant_b, user=get_user_model().objects.get(username="rev_b"), email="rev_b@example.org",
            full_name="rev_b", role="COMPLIANCE_OFFICER", status="ACTIVE")
        client_b = self.client_for("rev_b", rev_b.tenant)
        dev_b = client_b.post("/api/v1/network/devices/", {"name": "b-sw", "role": "CORE_SWITCH"}, format="json").json()
        iface_b = client_b.post("/api/v1/network/interfaces/", {"device": dev_b["id"], "name": "e1"}, format="json").json()
        cross = client_b.post("/api/v1/network/cables/", {"label": "EVIL", "termination_a": iface_b["id"], "termination_b": ports[0]}, format="json")
        self.assertEqual(cross.status_code, 400)
        self.assertFalse(CableLink.all_objects.filter(label="EVIL").exists())
        foreign_dev = client_b.post("/api/v1/network/interfaces/", {"device": topo["devices"][0]["id"], "name": "x"}, format="json")
        self.assertEqual(foreign_dev.status_code, 400)

    def test_trace_input_is_validated(self):
        self.seed()
        topo = self.owner.get("/api/v1/network/topology/").json()
        a = topo["devices"][0]["interfaces"][0]["id"]
        base = {"source_interface_id": a, "destination_interface_id": a}
        self.assertEqual(self.owner.post("/api/v1/network/trace/", {**base, "protocol": "GOPHER"}, format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/v1/network/trace/", {**base, "destination_port": 99999}, format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/v1/network/trace/", {**base, "payload_label": "x" * 500}, format="json").status_code, 400)
        self.assertEqual(self.owner.post("/api/v1/network/trace/", {"source_interface_id": "nope", "destination_interface_id": a}, format="json").status_code, 400)

    def test_rule_port_syntax_is_validated(self):
        self.seed()
        topo = self.reviewer.get("/api/v1/network/topology/").json()
        fw = next(d for d in topo["devices"] if d["role"] == "FIREWALL_WAF")["id"]
        ok = self.reviewer.post("/api/v1/network/rules/", {"device": fw, "rule_name": "r", "destination_port": "22,8000-9000"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        bad = self.reviewer.post("/api/v1/network/rules/", {"device": fw, "rule_name": "r2", "destination_port": "drop table"}, format="json")
        self.assertEqual(bad.status_code, 400)
