import io
import json

from apps.ai_audit import models as m
from apps.ai_audit.services.demo import seed_finsum
from apps.ai_audit.tests.base import AuditTestCase


def start_run(test, client, system, version):
    mv = m.ModelVersion.all_objects.get(system=system, version_label=version)
    ref = m.Dataset.all_objects.get(system=system, role="reference", name__contains=f"({version} ")
    cur = m.Dataset.all_objects.get(system=system, role="current", name__contains=f"({version} ")
    response = client.post(
        "/api/v1/ai/runs/",
        {"system": str(system.id), "model_version": str(mv.id), "reference_dataset": str(ref.id), "current_dataset": str(cur.id),
         "config": {**ref.sample_config, "bootstrap": 100}}, format="json")
    test.assertEqual(response.status_code, 201, response.content)
    return response.json()["id"]


class LlmSystemApiTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.reviewer = self.client_for("reviewer_a")

    def start(self, system, version):
        return start_run(self, self.owner, system, version)

    def results(self, run_id, **filters):
        query = "&".join(f"{k}={v}" for k, v in filters.items())
        return self.owner.get(f"/api/v1/ai/runs/{run_id}/results/?{query}").json()

    def test_llm_is_the_default_system_type(self):
        created = self.owner.post("/api/v1/ai/systems/", {"name": "Bot", "purpose": "Answers questions"}, format="json").json()
        self.assertEqual(created["system_type"], "llm")

    def test_system_type_cannot_change_and_model_sources_must_match(self):
        system = self.owner.post("/api/v1/ai/systems/", {"name": "Bot", "purpose": "p"}, format="json").json()
        self.assertEqual(self.owner.patch(f"/api/v1/ai/systems/{system['id']}/", {"system_type": "tabular"}, format="json").status_code, 400)
        bad = self.owner.post("/api/v1/ai/model-versions/", {"system": system["id"], "version_label": "v1", "source": "local_bundle"}, format="json")
        self.assertEqual(bad.status_code, 400)
        ok = self.owner.post("/api/v1/ai/model-versions/", {"system": system["id"], "version_label": "v1", "source": "llm_hosted",
                                                           "provider": "Acme", "model_name": "acme-1", "prompt_version": "p3"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        tab = self.owner.post("/api/v1/ai/systems/", {"name": "Scorer", "purpose": "p", "system_type": "tabular"}, format="json").json()
        self.assertEqual(self.owner.post("/api/v1/ai/model-versions/", {"system": tab["id"], "version_label": "v1", "source": "llm_hosted"}, format="json").status_code, 400)

    def test_full_llm_audit_finds_the_planted_issues(self):
        system = seed_finsum(self.members["owner_a"].tenant, self.members["owner_a"])
        run_id = self.start(system, "v1")
        self.run_worker()
        run = self.owner.get(f"/api/v1/ai/runs/{run_id}/").json()
        self.assertEqual(run["status"], "completed", run.get("error"))
        self.assertEqual(set(run["state_counts"]), {"bias", "drift", "grounding", "privacy", "governance"})
        self.assertNotIn("error", {s for c in run["state_counts"].values() for s in c})

        refusal = self.results(run_id, check_key="refusal_gap")[0]
        self.assertEqual(refusal["state"], "review_required")
        self.assertGreater(refusal["value"], 0.08)
        self.assertEqual(refusal["detail"]["highest"], "Hindi")

        citations = self.results(run_id, check_key="citations")
        self.assertEqual({c["subject"] for c in citations}, {"reference", "current"})
        self.assertTrue(all(c["state"] == "review_required" for c in citations))  # this system must cite sources

        numbers = {r["subject"]: r for r in self.results(run_id, check_key="unsupported_numbers")}
        self.assertEqual(numbers["reference"]["state"], "no_alert")      # about 3% of figures
        self.assertEqual(numbers["current"]["state"], "review_required")  # about 8% after the new topics arrive

        drift = {r["subject"]: r for r in self.results(run_id, category="drift", check_key="feature_distribution")}
        self.assertEqual(drift["prompt_topics"]["state"], "review_required")
        self.assertEqual(drift["response_length_words"]["state"], "no_alert")

        priv = self.results(run_id, category="privacy", check_key="personal_data_in_text")
        out = next(r for r in priv if r["subject"] == "reference:output")
        self.assertGreater(out["detail"]["surfaced_rows"], 0)
        blob = json.dumps(priv)
        self.assertNotIn("@example.org", blob.replace("***", ""))  # masked only

        gov = self.results(run_id, category="governance")
        vendor = next(r for r in gov if r["check_key"] == "vendor_dependency" and r["subject"] == "ExampleAI (fictional)")
        self.assertEqual(vendor["state"], "review_required")
        self.assertIn("transfer mechanism", vendor["summary"])
        erasure = next(r for r in gov if r["check_key"] == "data_rights" and r["subject"] == "erasure")
        self.assertEqual(erasure["state"], "review_required")
        rubber = next(r for r in gov if r["metric"] == "override_rate")
        self.assertEqual(rubber["state"], "review_required")

        findings = self.owner.get(f"/api/v1/ai/findings/?run={run_id}").json()["results"]
        titles = " | ".join(f["title"] for f in findings)
        for expected in ("Refusal gap across query_language", "Vendor gaps: ExampleAI", "Data rights: erasure of data", "Personal data in reference output"):
            self.assertIn(expected, titles)
        surfaced = next(f for f in findings if f["title"].startswith("Personal data in reference output"))
        self.assertEqual(surfaced["severity"], "HIGH")

        report = self.owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        self.assertEqual([c["key"] for c in report["categories"]], ["bias", "drift", "grounding", "privacy", "governance"])
        self.assertEqual(report["model_version"]["provider"], "ExampleAI (fictional)")
        html = self.owner.get(f"/api/v1/ai/runs/{run_id}/report.html/").content.decode()
        self.assertIn("Vendors and processors", html)
        self.assertIn("Groundedness and traceability", html)
        self.assertNotIn("Explainability", html.split("<h2>Coverage</h2>")[1].split("<h2>System and inputs</h2>")[0])

    def test_revised_prompt_improves_and_the_diff_shows_it(self):
        system = seed_finsum(self.members["owner_a"].tenant, self.members["owner_a"])
        v1 = self.start(system, "v1")
        v2 = self.start(system, "v2")
        self.run_worker()
        refusal = self.results(v2, check_key="refusal_gap")[0]
        self.assertEqual(refusal["state"], "no_alert")
        self.assertTrue(all(c["state"] == "no_alert" for c in self.results(v2, check_key="citations")))
        diff = self.owner.get(f"/api/v1/ai/runs/{v2}/diff/{v1}/").json()
        self.assertTrue(any(c["check_key"] == "refusal_gap" for c in diff["changes"]))
        # The vendor and rights gaps are about the organisation, not the prompt, so they persist.
        persisting = [f["base"]["title"] for f in diff["findings"]["persisting"]]
        self.assertIn("Vendor gaps: ExampleAI (fictional)", persisting)

    def test_preview_describes_llm_checks_and_rejects_bad_mapping(self):
        system = seed_finsum(self.members["owner_a"].tenant, self.members["owner_a"])
        mv = m.ModelVersion.all_objects.get(system=system, version_label="v1")
        ref = m.Dataset.all_objects.get(system=system, role="reference", name__contains="(v1 ")
        body = {"system": str(system.id), "model_version": str(mv.id), "reference_dataset": str(ref.id), "config": {**ref.sample_config, "context_column": None}}
        preview = self.owner.post("/api/v1/ai/runs/preview/", body, format="json").json()
        self.assertEqual(preview["system_type"], "llm")
        self.assertIn("No source or context column", preview["available_checks"]["grounding"]["reason"])
        body["config"] = {"prompt_column": "prompt"}
        bad = self.owner.post("/api/v1/ai/runs/preview/", body, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("output_column", json.dumps(bad.json()))

    def test_jsonl_upload_is_converted_and_validated(self):
        system = self.owner.post("/api/v1/ai/systems/", {"name": "Bot", "purpose": "p"}, format="json").json()
        lines = "\n".join(json.dumps({"prompt": f"q{i}", "output": f"a{i}", "meta": {"k": i}}) for i in range(5)).encode()
        f = io.BytesIO(lines)
        f.name = "log.jsonl"
        ok = self.owner.post("/api/v1/ai/datasets/", {"system": system["id"], "role": "reference", "name": "logs", "file": f}, format="multipart")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.json()["row_count"], 5)
        self.assertEqual({c["name"] for c in ok.json()["column_schema"]}, {"prompt", "output", "meta"})
        bad = io.BytesIO(b'{"a": 1}\nnot json\n')
        bad.name = "bad.jsonl"
        r = self.owner.post("/api/v1/ai/datasets/", {"system": system["id"], "role": "reference", "name": "x", "file": bad}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Line 2", json.dumps(r.json()))


class VendorAndRightsApiTests(AuditTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.client_for("owner_a")
        self.system = self.owner.post("/api/v1/ai/systems/", {"name": "Bot", "purpose": "p", "jurisdictions": ["DPDP"]}, format="json").json()

    def test_vendor_crud_and_tenant_isolation(self):
        body = {"system": self.system["id"], "name": "ExampleAI", "role": "model_provider", "personal_data_shared": True}
        created = self.owner.post("/api/v1/ai/dependencies/", body, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        dep = created.json()
        self.assertEqual(self.owner.get(f"/api/v1/ai/dependencies/?system={self.system['id']}").json()["count"], 1)
        other = self.client_for("owner_b")
        self.assertEqual(other.get(f"/api/v1/ai/dependencies/{dep['id']}/").status_code, 404)
        self.assertEqual(other.post("/api/v1/ai/dependencies/", body, format="json").status_code, 400)
        self.assertEqual(self.client_for("reader_a").post("/api/v1/ai/dependencies/", body, format="json").status_code, 403)
        patched = self.owner.patch(f"/api/v1/ai/dependencies/{dep['id']}/", {"contract_in_place": True}, format="json")
        self.assertTrue(patched.json()["contract_in_place"])

    def test_rights_process_rules(self):
        body = {"system": self.system["id"], "right": "access", "procedure_exists": True, "requests_12m": 5, "closed_on_time_12m": 4}
        self.assertEqual(self.owner.post("/api/v1/ai/rights-processes/", body, format="json").status_code, 201)
        self.assertEqual(self.owner.post("/api/v1/ai/rights-processes/", body, format="json").status_code, 400)  # one per right
        bad = {**body, "right": "erasure", "requests_12m": 2, "closed_on_time_12m": 5}
        self.assertEqual(self.owner.post("/api/v1/ai/rights-processes/", bad, format="json").status_code, 400)

    def test_report_snapshot_keeps_vendors_as_declared_at_audit_time(self):
        system = seed_finsum(self.members["owner_a"].tenant, self.members["owner_a"])
        run_id = start_run(self, self.owner, system, "v1")
        self.run_worker()
        before = self.owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        names = {d["name"] for d in before["dependencies"]}
        self.assertIn("ExampleAI (fictional)", names)

        # Fixing the vendor later must not rewrite what the old audit saw.
        m.Dependency.all_objects.filter(system=system, name="ExampleAI (fictional)").update(
            contract_in_place=True, trains_on_customer_data="no", exit_plan=True)
        m.RightsProcess.all_objects.filter(system=system).delete()
        after = self.owner.get(f"/api/v1/ai/runs/{run_id}/report.json/").json()
        provider = next(d for d in after["dependencies"] if d["name"] == "ExampleAI (fictional)")
        self.assertEqual(provider["trains_on_customer_data"], "unknown")
        self.assertFalse(provider["exit_plan"])
        self.assertEqual(len(after["rights"]), len(before["rights"]))