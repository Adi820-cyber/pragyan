import io
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from apps.ai_audit import models as m
from apps.ai_audit.tests.base import PASSWORD, AuditTestCase
from apps.core.models import Membership

BASE = "/api/v1/ai/findings/"


class FindingsFlowTests(AuditTestCase):
    """Assign -> fix -> review between different people, with separation of duties and a timeline."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        User = get_user_model()
        for name, role in (("reviewer2_a", "COMPLIANCE_OFFICER"), ("owner2_a", "RISK_OWNER"), ("contrib_a", "CONTRIBUTOR")):
            user = User.objects.create_user(username=name, email=f"{name}@example.org", password=PASSWORD)
            cls.members[name] = Membership.all_objects.create(
                tenant=cls.tenant_a, user=user, email=user.email, full_name=name, role=role, status="ACTIVE")
        from apps.ai_audit.services.demo import DEMO_CONFIG, seed_hirelens

        system = seed_hirelens(cls.tenant_a, cls.members["owner_a"])
        mv = m.ModelVersion.all_objects.get(system=system, version_label="v1")
        ref = m.Dataset.all_objects.get(system=system, role="reference", name__contains="(v1")
        cur = m.Dataset.all_objects.get(system=system, role="current", name__contains="(v1")
        run = m.AuditRun.all_objects.create(
            tenant=cls.tenant_a, system=system, model_version=mv, reference_dataset=ref, current_dataset=cur,
            config={**DEMO_CONFIG, "bootstrap": 100}, status="queued", created_by=cls.members["owner_a"])
        call_command("run_audit_worker", "--once", verbosity=0)
        cls.run_id = run.id
        cls.finding_ids = [str(i) for i in m.Finding.all_objects.filter(run_id=run.id).order_by("created_at").values_list("id", flat=True)]

    def setUp(self):
        super().setUp()
        self.officer = self.client_for("reviewer_a")
        self.officer2 = self.client_for("reviewer2_a")
        self.worker = self.client_for("owner_a")
        self.worker2 = self.client_for("owner2_a")
        self.reader = self.client_for("reader_a")
        self.contrib = self.client_for("contrib_a")
        self.fid = self.finding_ids[0]
        self.url = f"{BASE}{self.fid}/"

    def assign(self, client, fid=None, owner="owner_a", days=7, priority="high", **extra):
        body = {"owner": str(self.members[owner].id), "due_date": (date.today() + timedelta(days=days)).isoformat(),
                "priority": priority, **extra}
        return client.post(f"{BASE}{fid or self.fid}/assign/", body, format="json")

    # ----------------------------------------------------------------- the story
    def test_findings_start_unassigned(self):
        self.assertTrue(self.finding_ids)
        data = self.officer.get(self.url).json()
        self.assertIsNone(data["owner"])
        self.assertEqual(data["status"], "open")

    def test_full_multi_user_story(self):
        # 1. Officer assigns to the risk owner.
        r = self.assign(self.officer, comment="Please take this first")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["owner"], str(self.members["owner_a"].id))
        self.assertEqual(body["priority"], "high")
        self.assertEqual(body["assigned_by_name"], "reviewer_a")

        # 2. The assignee sees it under "mine"; the officer does not.
        mine = [f["id"] for f in self.worker.get(f"{BASE}?mine=1").json()["results"]]
        self.assertEqual(mine, [self.fid])
        self.assertEqual(self.officer.get(f"{BASE}?mine=1").json()["count"], 0)

        # 3. A read-only colleague comments; the owner starts, attaches a link and a file, then hands over.
        self.assertEqual(self.reader.post(f"{self.url}comment/", {"comment": "Looks urgent"}, format="json").status_code, 201)
        self.assertEqual(self.worker.post(f"{self.url}start/", {}, format="json").status_code, 200)
        link = self.worker.post(f"{self.url}evidence/", {"title": "Ticket", "url": "https://example.org/t/1"}, format="json")
        self.assertEqual(link.status_code, 201, link.content)
        upload = SimpleUploadedFile("proof.txt", b"fixed", content_type="text/plain")
        filed = self.worker.post(f"{self.url}evidence/", {"title": "Proof", "file": upload}, format="multipart")
        self.assertEqual(filed.status_code, 201, filed.content)
        attachments = filed.json()["attachments"]
        self.assertEqual([a["kind"] for a in attachments], ["link", "file"])
        download = self.worker.get(f"{self.url}evidence/{attachments[1]['id']}/download/")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), b"fixed")
        self.assertEqual(self.worker.post(f"{self.url}submit/", {}, format="json").status_code, 400)  # note required
        ready = self.worker.post(f"{self.url}submit/", {"comment": "Removed the field"}, format="json")
        self.assertEqual(ready.status_code, 200, ready.content)
        self.assertEqual(ready.json()["status"], "submitted")
        self.assertEqual(ready.json()["remediation_note"], "Removed the field")

        # 4. The fixer cannot approve; the assigning officer can.
        self.assertEqual(self.worker.post(f"{self.url}resolve/", {"comment": "me"}, format="json").status_code, 403)
        self.assertEqual(self.officer.post(f"{self.url}send-back/", {}, format="json").status_code, 400)  # reason required
        back = self.officer.post(f"{self.url}send-back/", {"comment": "Add the test result"}, format="json")
        self.assertEqual(back.json()["status"], "in_remediation")
        self.assertEqual(self.worker.post(f"{self.url}submit/", {"comment": "Test result attached"}, format="json").status_code, 200)
        done = self.officer.post(f"{self.url}resolve/", {"comment": "Verified"}, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        data = done.json()
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["reviewed_by_name"], "reviewer_a")

        # 5. Timeline: who did what, in order.
        steps = [(h["action"], h["actor"]) for h in data["history"]]
        self.assertEqual(steps, [
            ("created", "system"), ("assign", "reviewer_a"), ("comment", "reader_a"), ("start", "owner_a"),
            ("evidence_added", "owner_a"), ("evidence_added", "owner_a"), ("submit", "owner_a"),
            ("send_back", "reviewer_a"), ("submit", "owner_a"), ("resolve", "reviewer_a"),
        ])

        # 6. Closed items cannot be worked or reassigned.
        self.assertEqual(self.assign(self.officer, owner="owner2_a").status_code, 400)
        self.assertEqual(self.worker.post(f"{self.url}evidence/", {"title": "x", "url": "https://example.org"}, format="json").status_code, 400)

    # ----------------------------------------------------------------- separation of duties and roles
    def test_officer_who_fixes_cannot_approve_but_another_officer_can(self):
        self.assertEqual(self.assign(self.officer, owner="reviewer_a").status_code, 200)
        self.assertEqual(self.officer.post(f"{self.url}submit/", {"comment": "fixed it myself"}, format="json").status_code, 200)
        denied = self.officer.post(f"{self.url}resolve/", {"comment": "self approve"}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.assertIn("Segregation of duties", str(denied.json()))
        self.assertEqual(self.officer.post(f"{self.url}accept/", {"comment": "self accept"}, format="json").status_code, 403)
        self.assertEqual(self.officer2.post(f"{self.url}resolve/", {"comment": "independent check"}, format="json").status_code, 200)

    def test_evidence_supplier_cannot_review(self):
        # Reassigned after the evidence was added: the person who supplied evidence stays barred from approving.
        self.assertEqual(self.assign(self.officer, owner="reviewer2_a").status_code, 200)
        self.assertEqual(self.officer2.post(f"{self.url}evidence/", {"title": "t", "url": "https://example.org/e"}, format="json").status_code, 201)
        self.assertEqual(self.assign(self.officer, owner="owner_a").status_code, 200)
        self.assertEqual(self.worker.post(f"{self.url}submit/", {"comment": "done"}, format="json").status_code, 200)
        self.assertEqual(self.officer2.post(f"{self.url}resolve/", {"comment": "ok"}, format="json").status_code, 403)
        self.assertEqual(self.officer.post(f"{self.url}resolve/", {"comment": "ok"}, format="json").status_code, 200)

    def test_contributor_and_reader_cannot_assign_work_or_approve(self):
        for client in (self.contrib, self.reader, self.worker):
            self.assertEqual(self.assign(client).status_code, 403)
        self.assertEqual(self.assign(self.officer).status_code, 200)
        for client in (self.contrib, self.reader):
            self.assertEqual(client.post(f"{self.url}start/", {}, format="json").status_code, 403)
            self.assertEqual(client.post(f"{self.url}evidence/", {"title": "t", "url": "https://example.org"}, format="json").status_code, 403)
            self.assertEqual(client.post(f"{self.url}submit/", {"comment": "x"}, format="json").status_code, 403)
            self.assertEqual(client.post(f"{self.url}resolve/", {"comment": "x"}, format="json").status_code, 403)
            self.assertEqual(client.post(f"{self.url}comment/", {"comment": "I can comment"}, format="json").status_code, 201)
            self.assertEqual(client.get(self.url).status_code, 200)
        self.assertEqual(self.reader.post(f"{self.url}comment/", {"comment": ""}, format="json").status_code, 400)

    def test_only_the_assignee_can_work_the_item(self):
        self.assertEqual(self.assign(self.officer, owner="owner_a").status_code, 200)
        self.assertEqual(self.worker2.post(f"{self.url}start/", {}, format="json").status_code, 403)
        self.assertEqual(self.worker2.post(f"{self.url}submit/", {"comment": "mine now"}, format="json").status_code, 403)
        self.assertEqual(self.worker2.post(f"{self.url}evidence/", {"title": "t", "url": "https://example.org"}, format="json").status_code, 403)
        # The owner cannot hand the item to themselves or someone else through PATCH.
        self.assertEqual(self.worker.patch(self.url, {"owner": str(self.members["owner2_a"].id)}, format="json").status_code, 400)
        self.assertEqual(self.worker.patch(self.url, {"due_date": "2099-01-01"}, format="json").status_code, 400)
        self.assertEqual(self.worker.patch(self.url, {"remediation_note": "plan"}, format="json").status_code, 200)
        self.assertEqual(self.worker2.patch(self.url, {"remediation_note": "plan"}, format="json").status_code, 403)

    def test_unassigned_item_is_claimed_by_whoever_starts_it(self):
        started = self.worker.post(f"{self.url}start/", {}, format="json")
        self.assertEqual(started.status_code, 200)
        self.assertEqual(started.json()["owner"], str(self.members["owner_a"].id))

    # ----------------------------------------------------------------- validation and tenant isolation
    def test_assign_validation(self):
        past = (date.today() - timedelta(days=1)).isoformat()
        good = {"owner": str(self.members["owner_a"].id), "due_date": (date.today() + timedelta(days=3)).isoformat(), "priority": "low"}
        self.assertEqual(self.officer.post(f"{self.url}assign/", {**good, "due_date": past}, format="json").status_code, 400)
        self.assertEqual(self.officer.post(f"{self.url}assign/", {**good, "due_date": "soon"}, format="json").status_code, 400)
        self.assertEqual(self.officer.post(f"{self.url}assign/", {**good, "priority": "urgent"}, format="json").status_code, 400)
        self.assertEqual(self.officer.post(f"{self.url}assign/", {**good, "owner": "not-an-id"}, format="json").status_code, 400)
        self.assertEqual(self.officer.post(f"{self.url}assign/", {**good, "owner": None}, format="json").status_code, 400)
        # A read-only person cannot be given work.
        self.assertEqual(self.assign(self.officer, owner="reader_a").status_code, 400)
        # Someone from another organisation cannot be given work either.
        outsider = self.officer.post(f"{self.url}assign/", {**good, "owner": str(self.members["owner_b"].id)}, format="json")
        self.assertEqual(outsider.status_code, 400)
        self.assertEqual(m.Finding.all_objects.get(id=self.fid).owner_id, None)

    def test_cross_tenant_access_is_denied(self):
        other = self.client_for("owner_b")
        self.assertEqual(other.get(self.url).status_code, 404)
        self.assertEqual(other.post(f"{self.url}comment/", {"comment": "hi"}, format="json").status_code, 404)
        self.assertEqual(other.post(f"{self.url}start/", {}, format="json").status_code, 404)
        self.assertEqual(other.get(BASE).json()["count"], 0)
        self.assertEqual(other.get(f"{BASE}summary/").json()["total"], 0)
        # An officer of the other organisation cannot assign across the boundary either.
        User = get_user_model()
        user = User.objects.create_user(username="officer_b", email="officer_b@example.org", password=PASSWORD)
        self.members["officer_b"] = Membership.all_objects.create(
            tenant=self.tenant_b, user=user, email=user.email, full_name="officer_b", role="COMPLIANCE_OFFICER", status="ACTIVE")
        officer_b = self.client_for("officer_b")
        self.assertEqual(self.assign(officer_b, owner="owner_b").status_code, 404)
        # Evidence downloads are tenant-scoped too.
        self.assign(self.officer)
        self.worker.post(f"{self.url}evidence/", {"title": "Proof", "file": SimpleUploadedFile("p.txt", b"x")}, format="multipart")
        att = m.FindingAttachment.all_objects.get(finding_id=self.fid)
        self.assertEqual(officer_b.get(f"{self.url}evidence/{att.id}/download/").status_code, 404)

    def test_link_must_be_http_and_title_required(self):
        self.assign(self.officer)
        url = f"{self.url}evidence/"
        self.assertEqual(self.worker.post(url, {"title": "x", "url": "javascript:alert(1)"}, format="json").status_code, 400)
        self.assertEqual(self.worker.post(url, {"title": "", "url": "https://example.org"}, format="json").status_code, 400)
        self.assertEqual(self.worker.post(url, {"title": "x"}, format="json").status_code, 400)
        both = self.worker.post(url, {"title": "x", "url": "https://example.org", "file": io.BytesIO(b"a")}, format="multipart")
        self.assertEqual(both.status_code, 400)

    # ----------------------------------------------------------------- filters, counts, overview
    def test_filters_counts_and_overview(self):
        a, b, c = self.finding_ids[:3]
        self.assign(self.officer, a, owner="owner_a", days=5)
        self.assign(self.officer, b, owner="owner2_a", days=5)
        m.Finding.all_objects.filter(id=b).update(due_date=date.today() - timedelta(days=2))
        self.worker.post(f"{BASE}{a}/submit/", {"comment": "fixed"}, format="json")
        total = self.officer.get(BASE).json()["count"]

        ids = lambda q: {f["id"] for f in self.officer.get(f"{BASE}?{q}").json()["results"]}  # noqa: E731
        self.assertEqual(ids("status=submitted"), {a})
        self.assertEqual(ids("overdue=1"), {b})
        self.assertEqual(ids("assignee=unassigned") | {a, b}, set(self.finding_ids))
        self.assertEqual(ids(f"assignee={self.members['owner2_a'].id}"), {b})
        self.assertEqual(self.worker.get(f"{BASE}?mine=1").json()["count"], 1)
        self.assertEqual(ids("needs_my_review=1"), {a})
        self.assertEqual(self.worker.get(f"{BASE}?needs_my_review=1").json()["count"], 0)
        self.assertEqual(self.officer.get(f"{BASE}?assignee=oops").status_code, 400)
        self.assertTrue(ids("severity=high,medium,low"))

        s = self.officer.get(f"{BASE}summary/").json()
        self.assertEqual(s["total"], total)
        self.assertEqual(s["open"], total)
        self.assertEqual(s["unassigned"], total - 2)
        self.assertEqual(s["overdue"], 1)
        self.assertEqual(s["awaiting_review"], 1)
        self.assertEqual(s["awaiting_my_review"], 1)
        self.assertEqual(s["by_status"]["submitted"], 1)
        self.assertEqual({p["name"] for p in s["by_assignee"]}, {"owner_a", "owner2_a"})
        mine = self.worker.get(f"{BASE}summary/").json()
        self.assertEqual((mine["mine"], mine["mine_overdue"], mine["mine_ready_for_review"], mine["awaiting_my_review"]), (1, 0, 1, 0))

        self.officer.post(f"{BASE}{a}/resolve/", {"comment": "ok"}, format="json")
        overview = self.officer.get("/api/v1/ai/overview/").json()["totals"]
        self.assertEqual(overview["open_findings"], total - 1)
        self.assertEqual(overview["closed_findings"], 1)
        self.assertEqual(overview["unassigned_findings"], total - 2)
        self.assertEqual(overview["overdue_findings"], 1)
        self.assertEqual(overview["awaiting_review"], 0)
        owner2 = self.worker2.get("/api/v1/ai/overview/").json()["totals"]
        self.assertEqual((owner2["my_open_actions"], owner2["my_overdue_actions"]), (1, 1))

    def test_reassign_is_recorded(self):
        self.assign(self.officer, owner="owner_a")
        r = self.assign(self.officer, owner="owner2_a", priority="critical")
        self.assertEqual(r.status_code, 200)
        self.assertEqual([h["action"] for h in r.json()["history"]], ["created", "assign", "reassign"])
        self.assertEqual(r.json()["priority"], "critical")
        self.assertEqual(self.worker.post(f"{self.url}start/", {}, format="json").status_code, 403)

    def test_cannot_assign_while_in_review(self):
        self.assign(self.officer)
        self.worker.post(f"{self.url}submit/", {"comment": "done"}, format="json")
        self.assertEqual(self.assign(self.officer, owner="owner2_a").status_code, 400)


class SeedDemoTeamTests(AuditTestCase):
    def test_seed_creates_team_and_is_idempotent(self):
        from django.contrib.auth import authenticate

        from apps.core.models import Tenant

        demo = Tenant.objects.create(name="HireLens (demo)", slug="hirelens-demo")
        admin = Membership.all_objects.create(
            tenant=demo, user=self.users["owner_a"], email="owner_a@example.org", full_name="Asha", role="RISK_OWNER", status="ACTIVE")
        from apps.ai_audit.services.demo import DEMO_CONFIG, seed_hirelens

        sys_ = seed_hirelens(demo, admin)
        mv = m.ModelVersion.all_objects.get(system=sys_, version_label="v1")
        ref = m.Dataset.all_objects.get(system=sys_, role="reference", name__contains="(v1")
        cur = m.Dataset.all_objects.get(system=sys_, role="current", name__contains="(v1")
        m.AuditRun.all_objects.create(tenant=demo, system=sys_, model_version=mv, reference_dataset=ref, current_dataset=cur,
                                      config={**DEMO_CONFIG, "bootstrap": 100}, status="queued", created_by=admin)
        call_command("run_audit_worker", "--once", verbosity=0)
        before = {f.id: (f.title, f.severity, f.plain_language) for f in m.Finding.all_objects.filter(tenant=demo)}
        self.assertGreaterEqual(len(before), 4)

        call_command("seed_demo_team", verbosity=0)
        call_command("seed_demo_team", verbosity=0)
        roles = dict(Membership.all_objects.filter(tenant=demo).values_list("email", "role"))
        self.assertEqual(roles["priya.nair@hirelens.example"], "COMPLIANCE_OFFICER")
        self.assertEqual(roles["rohan.mehta@hirelens.example"], "RISK_OWNER")
        self.assertEqual(roles["ananya.iyer@hirelens.example"], "AUDITOR")
        self.assertEqual(Membership.all_objects.filter(tenant=demo, email="priya.nair@hirelens.example").count(), 1)
        self.assertIsNotNone(authenticate(username="priya.nair@hirelens.example", password="Demo-Pass-2026"))

        # Real findings keep their content; only workflow state changed.
        for f in m.Finding.all_objects.filter(tenant=demo):
            self.assertEqual((f.title, f.severity, f.plain_language), before[f.id])
        states = list(m.Finding.all_objects.filter(tenant=demo).values_list("status", flat=True))
        for wanted in ("open", "in_remediation", "submitted", "resolved"):
            self.assertIn(wanted, states)
        self.assertEqual(m.Finding.all_objects.filter(tenant=demo, assigned_by__isnull=False).count(), 4)
        overdue = m.Finding.all_objects.filter(tenant=demo, due_date__lt=date.today()).exclude(status__in=["accepted", "resolved"])
        self.assertEqual(overdue.count(), 1)
        self.assertEqual(m.FindingEvent.all_objects.filter(tenant=demo, action="assign").count(), 4)

        # Priya can approve the ready-for-review item; Rohan (who fixed it) cannot; Ananya cannot assign.
        ready = m.Finding.all_objects.get(tenant=demo, status="submitted")
        priya = self._login("priya.nair@hirelens.example", demo)
        rohan = self._login("rohan.mehta@hirelens.example", demo)
        ananya = self._login("ananya.iyer@hirelens.example", demo)
        self.assertEqual(rohan.post(f"{BASE}{ready.id}/resolve/", {"comment": "me"}, format="json").status_code, 403)
        self.assertEqual(ananya.post(f"{BASE}{ready.id}/resolve/", {"comment": "me"}, format="json").status_code, 403)
        self.assertEqual(priya.post(f"{BASE}{ready.id}/resolve/", {"comment": "Verified"}, format="json").status_code, 200)
        unassigned = m.Finding.all_objects.filter(tenant=demo, owner__isnull=True).first()
        body = {"owner": str(Membership.all_objects.get(tenant=demo, email="rohan.mehta@hirelens.example").id),
                "due_date": (date.today() + timedelta(days=3)).isoformat(), "priority": "low"}
        self.assertEqual(ananya.post(f"{BASE}{unassigned.id}/assign/", body, format="json").status_code, 403)
        self.assertEqual(priya.post(f"{BASE}{unassigned.id}/assign/", body, format="json").status_code, 200)

    def _login(self, email, tenant):
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.post("/api/v1/auth/login/", {"username": email, "password": "Demo-Pass-2026"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        client.credentials(HTTP_AUTHORIZATION=f"Token {response.json()['token']}")
        client.defaults["HTTP_X_TENANT_ID"] = str(tenant.id)
        return client
