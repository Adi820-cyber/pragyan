# Reskure AI Audit: final build plan

Target: PRAGYAN 2K26, Track 4-05 (Entrepreneurship & Future of Management): Responsible AI Governance and Compliance Toolkit for Small Organisations.
Basis: `docs/research/responsible-ai-toolkit-plan.md` (research), plus a check of the current repo layout.
Status: plan only. No application code has been changed yet.

## 1. What we are building

Reskure AI Audit is a self-hostable, CPU-only audit suite for small AI teams. A startup registers an AI system, uploads a reference dataset and a current dataset (or uses the built-in sample model), and gets one audit run covering four checks:

1. Bias: group outcome and error-rate gaps
2. Drift: reference vs current data and prediction shift
3. Explainability: global and per-decision SHAP explanations
4. DPDP/GDPR data-security readiness: automatic PII scanning plus an evidence-backed control checklist

Every check produces either measured evidence or an explicit "not assessed" state. Issues become findings with an owner, a reviewer sign-off and a rerun history. The output is an exportable audit report that a founder can hand to an enterprise customer, investor or reviewer.

One-line pitch: "An AI compliance evidence pack in an afternoon, with no compliance team and no paid APIs."

### Scope decisions (final)

| Decision | Choice | Why |
|---|---|---|
| Model family | Tabular binary classifiers only | Bounded, and all four checks can be shown end to end |
| Model support for explanations | scikit-learn tree models (RandomForest, GradientBoosting, DecisionTree) | SHAP TreeExplainer is exact and fast on CPU |
| Model ingestion | Built-in trusted sample model on the server; customer models via a local CLI that uploads a JSON result bundle | No pickle/joblib uploads to the server, since deserialising them can execute code |
| Data ingestion | CSV upload (size and row capped) | Lowest setup friction |
| Execution | One DB-polling worker (`manage.py run_audit_worker`) | No Redis/Celery until concurrency requires it |
| Database | SQLite for local demo; PostgreSQL for any shared pilot | Already supported by the stack |
| Analysis stack | pandas, NumPy, SciPy, scikit-learn, Fairlearn, SHAP | Open source (BSD/MIT), no API costs |
| Charts | Recharts in the frontend | One pinned dependency, no custom chart code |
| Report | Printable HTML (browser "Save as PDF") and JSON | PDF engine deferred |
| Out of scope | LLM/RAG auditing, images, multiclass/regression, auto-debiasing, connectors, trust scores, compliance certificates | Keeps the demo honest and finishable |

### Where this plan departs from the research

- The research puts full security hardening (P0) before any audit work. For the hackathon we split it: minimum hardening (auth, tenant scoping, upload safety, no fake data in real mode) goes first; the rest of the security table is listed as "required before real customer data" and stays in the README limitations.
- The research does not cover the entrepreneurship deliverables (customer, business model, go-to-market, pitch). This track is judged on those, so section 8 adds them. Numbers there are labelled hypotheses.
- The research leaves model integration open. This plan fixes it: built-in sample model on the server plus a local CLI (`reskure-audit`) for customer models.

## 2. Repo changes at a glance

Keep: Django/DRF backend, Next.js 16 frontend, `risk`, `evidence`, `compliance`, `workflows`, `core`, `authorization` apps.

Add:

```
backend/apps/ai_audit/
  models.py            # AISystem, ModelVersion, Dataset, AuditRun, CheckResult, Finding
  serializers.py
  views.py             # DRF viewsets + run/cancel/report actions
  urls.py
  services/
    validation.py      # schema, encoding, column mapping, compatibility checks
    fairness.py        # Fairlearn MetricFrame wrappers + bootstrap CIs
    drift.py           # KS / Jensen-Shannon, schema & missingness diffs
    explain.py         # SHAP TreeExplainer, bounded samples, additivity check
    privacy.py         # PII detectors, minimisation & retention checks
    controls.py        # DPDP/GDPR control pack loading + assessment logic
    report.py          # HTML + JSON report builder
    runner.py          # orchestrates one AuditRun, writes CheckResults
  sample/
    generate.py        # deterministic synthetic hiring dataset + models
  control_packs/
    dpdp_2025_v1.json
    gdpr_v1.json
  management/commands/
    run_audit_worker.py
    seed_ai_demo.py
  tests/
tools/reskure_audit_cli/  # local adapter: runs checks against a local model, writes bundle.json
```

Modify:

| File | Change |
|---|---|
| `.gitignore` | Narrow the `lib/` rule so `frontend/src/lib/api.ts` and `types.ts` are tracked; add the frontend to git |
| `backend/pyproject.toml` | Add pinned pandas, numpy, scipy, scikit-learn, fairlearn, shap (versions resolved and smoke-tested on Python 3.13 first) |
| `backend/reskure/settings.py` | Env-based `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, CORS; DRF session/token auth; upload size limits; private `MEDIA_ROOT` |
| `backend/apps/core/middleware.py` | Derive membership from `request.user`; stop trusting `X-Actor-ID`/`X-Membership-ID` |
| `backend/apps/core/views.py` | Remove `AllowAny` on tenant CRUD |
| `backend/apps/core/models.py` + viewsets | Tenant filtering in `get_queryset()`; deny when no tenant context |
| `backend/apps/authorization/engine.py` | Deny anonymous before evaluation (no CONTRIBUTOR fallback) |
| `backend/apps/workflows/views.py` | Actor from session; block self-approval |
| `backend/apps/evidence/*` | Real file upload, server-computed SHA-256, authorised download |
| `frontend/src/lib/api.ts` | Remove silent demo fallback; surface errors; auth token; pagination |
| `frontend/src/components/layout/Sidebar.tsx`, `Header.tsx` | New navigation; show the real logged-in user instead of the role switcher |
| `frontend/src/app/page.tsx` | Replace with the AI audit overview |
| `README.md` | Accurate scope, setup, limitations |

Hidden from the main UI (code left in place): SecOps feed, host isolation, IAM rotation, cloud inventory, NIST CSF headline gauge.

## 3. Data model

| Model | Key fields |
|---|---|
| `AISystem` | tenant, name, purpose, decision_affected, intended_population, owner (user), reviewer (user), jurisdictions (DPDP/GDPR flags), automated_decision (bool), status |
| `ModelVersion` | system, version_label, model_type, source (`server_sample` / `local_bundle` / `predictions_only`), feature_schema (JSON), favourable_label, threshold, notes |
| `Dataset` | tenant, system, role (`reference` / `current`), file (private storage), sha256, row_count, column_schema (JSON), period_start/end, uploaded_by, delete_after |
| `AuditRun` | system, model_version, reference_dataset, current_dataset, config (JSON: column mapping, group columns, favourable outcome, thresholds and rationale, seed, sample caps), control_pack_version, library_versions (JSON), status (`queued` / `running` / `completed` / `failed` / `cancelled`), error, started_at, finished_at, created_by |
| `CheckResult` | run, category (`bias` / `drift` / `explainability` / `privacy`), check_key, subject (group or feature), metric, value, unit, support_n, ci_low, ci_high, threshold, state (`no_alert` / `review_required` / `insufficient_evidence` / `not_applicable` / `error`), detail (JSON), origin (`server` / `local_bundle`) |
| `Finding` | run, check_results (M2M), title, plain_language, severity, owner, due_date, status (`open` / `in_remediation` / `submitted` / `accepted` / `resolved`), linked `risk.Risk` (optional), review history |
| `ControlAssessment` | tenant, system, control (from pack), applicability (`applicable` / `not_applicable` + rationale), state (`needs_evidence` / `evidence_supplied` / `reviewed` / `gap_identified` / `not_applicable`), evidence (M2M to `evidence`), reviewer, reviewed_at |

Rules:
- `CheckResult` rows are immutable once a run completes. Decisions live on `Finding` and `ControlAssessment`.
- A rerun creates a new `AuditRun`; reports can diff two runs.
- Undefined metrics (zero denominator, missing labels) are stored as `insufficient_evidence` with a null value, never 0.

## 4. The four checks: exact behaviour

### 4.1 Bias

Inputs: prediction column, optional actual-outcome column, 1+ declared group columns, the favourable label.

Metrics per group (Fairlearn `MetricFrame`): count, selection rate; with labels: TPR, FPR, FNR, accuracy.
Aggregates: demographic parity difference and ratio; equalized odds difference (labels needed).

Default policy (editable per run, rationale stored):

| Metric | Review required when |
|---|---|
| Demographic parity difference | > 0.10 |
| Selection-rate ratio | < 0.80 (shown as a screening heuristic, not a legal test) |
| Equalized odds difference | > 0.10 |
| Group size | < 30 rows: `insufficient_evidence` with a small-group warning |

Uncertainty: 500-sample bootstrap 95% CI, fixed seed. No group column means group checks are `not_applicable` with that reason. Sensitive attributes are never inferred.

### 4.2 Drift

Pre-checks: schema diff (added/removed columns, dtype changes), missingness change, unseen categories. ID and declared admin columns are excluded.

| Feature type | Statistic | Default review threshold |
|---|---|---|
| Continuous numeric (> 20 unique values) | KS statistic (`scipy.stats.ks_2samp`) | > 0.10 |
| Categorical / low-cardinality numeric | Jensen-Shannon distance on aligned frequencies | > 0.10 |
| Prediction distribution | Same rule as its type | > 0.10 |

Each result shows statistic, both sample sizes and threshold. If labels exist in both datasets, a separate performance comparison (accuracy, TPR) is reported. Wording stays "data/prediction drift", never "concept drift".

### 4.3 Explainability

- Server path: built-in sample model only. SHAP `TreeExplainer` with a background sample capped at 200 rows and explanation rows capped at 500.
- Outputs: global mean |SHAP| ranking; per-decision view (base value, model output, top contributions, units "log-odds" or "probability" stated).
- Self-check: additivity (base + sum of contributions ≈ output) within 1e-6, stored as its own `CheckResult`.
- Local path: the `reskure-audit` CLI loads the customer's own sklearn tree model in their environment, computes the same outputs and writes `bundle.json` (schema-validated on upload, `origin = local_bundle`).
- Predictions-only uploads: explainability is `not_applicable` with the reason "no supported model provided".
- UI copy: "contributions show what the model associates with this output, not causes."

### 4.4 DPDP/GDPR data-security readiness

Automatic checks on uploaded data:

| Detector | Method |
|---|---|
| Email, phone (+91 and E.164), IP address | Regex on values + column-name hints |
| Aadhaar | 12-digit pattern + Verhoeff checksum |
| PAN | `[A-Z]{5}[0-9]{4}[A-Z]` |
| Date of birth, names, addresses | Column-name hints only (flagged "likely", needs confirmation) |
| Minimisation | Identifier columns used as model features |
| Retention | Rows past a declared retention date, if metadata is given |

Findings show column, match count and masked samples only (`r***@g***.com`). Raw values never go to logs or reports.

Control checklist: about 20 versioned controls in two packs (`dpdp_2025_v1`, `gdpr_v1`). Each control has source, provision, jurisdiction, applicability question, effective-status note, required evidence and plain-language guidance. Coverage:

- DPDP: notice, consent / legitimate use, purpose limitation, security safeguards (Rule 6), breach intimation (Rule 7), retention and erasure, grievance redressal, children's data, SDF applicability question (Rule 13 duties only if SDF = yes).
- GDPR: lawful basis (Art. 6), special categories (Art. 9), transparency (Art. 13–14), automated decisions (Art. 22), privacy by design (Art. 25), processors (Art. 28), records (Art. 30), security (Art. 32), breach (Art. 33–34), DPIA (Art. 35).

The tool checks evidence presence and routes each control to a human reviewer. It never declares "compliant". Control wording gets a legal review before it is presented as an obligation for a specific organisation.

## 5. API surface

```
POST   /api/auth/login/                 GET /api/auth/me/
CRUD   /api/ai/systems/
CRUD   /api/ai/systems/{id}/models/
POST   /api/ai/datasets/                (multipart; returns schema preview + PII pre-scan)
GET    /api/ai/datasets/{id}/preview/
POST   /api/ai/runs/                    (config validated, status=queued)
GET    /api/ai/runs/{id}/               (status + progress)
POST   /api/ai/runs/{id}/cancel/
GET    /api/ai/runs/{id}/results/?category=bias
GET    /api/ai/runs/{id}/report.html    GET /api/ai/runs/{id}/report.json
GET    /api/ai/runs/{id}/diff/{other_id}/
POST   /api/ai/bundles/                 (upload local CLI bundle)
CRUD   /api/ai/findings/                POST /api/ai/findings/{id}/submit|accept|resolve/
GET    /api/ai/control-packs/           CRUD /api/ai/control-assessments/
POST   /api/ai/demo/seed/               (sample mode only, clearly labelled)
```

All endpoints require authentication and filter by the caller's tenant membership in `get_queryset()`. OpenAPI is published via drf-spectacular.

## 6. Frontend

Navigation: Overview · AI Systems · Audits · Findings & Actions · Privacy & Controls · Reports. Settings sits in secondary navigation. A "Sample mode" banner shows whenever demo data is in use.

| Route | Content |
|---|---|
| `/` | Systems count, latest run per system, a four-category coverage strip (assessed / review required / not assessed), open findings, overdue reviews, evidence gaps |
| `/systems`, `/systems/[id]` | Register a system; model versions; run history |
| `/audits/new` | Wizard: 1 pick system and model → 2 upload or sample → 3 map columns and favourable outcome → 4 preview data quality and available checks → 5 confirm policy → run |
| `/audits/[id]` | Status/progress, then tabs: Summary · Bias · Drift · Explainability · Privacy |
| `/findings` | Table with owner, due date, status; detail drawer with evidence and review actions |
| `/controls` | DPDP/GDPR checklist per system, evidence upload, reviewer decision |
| `/reports/[id]` | Print-ready report; compare-with-previous-run toggle |

UI rules: every alert says what changed, why it matters and what to check next; no single overall score; "calculation succeeded" is never shown as "passed"; empty and error states are real.

## 7. Demo scenario: "HireLens"

A synthetic hiring-screening startup, generated deterministically with `seed=42`. No real personal data.

- Dataset: about 8,000 applicants. Features: years_experience, skill_test_score, education_level, city_tier, referral, gap_months. Group column: gender (declared, synthetic). Also includes `email` and `phone` columns of fake values, to trigger the PII scan.
- Model v1 (GradientBoosting): trained on data where `city_tier` is a proxy correlated with group, so a selection-rate gap appears.
- Current dataset: experience distribution shifted (a new campus-hiring channel), so drift alerts fire on `years_experience` and on predictions.
- Model v2: retrained without the proxy feature and with the identifier columns removed, then evaluated on the same held-out set.
- Controls: a breach-response procedure is missing, so it shows as an evidence gap.

Five-minute demo script:
1. Register HireLens → run audit on v1 (about 1–2 min, live progress).
2. Summary: bias review required, drift review required, explanations ready, two PII findings, one control gap.
3. Drill into Bias (rates, CI, denominators) → Explainability shows `city_tier` dominant → assign a finding to the ML lead.
4. Upload v2 → rerun → diff view shows the gap narrowed, and the drift warning stays open (honest).
5. Export the report → reviewer accepts the remaining risk with rationale → that decision appears in the report.

## 8. Entrepreneurship and management case

All figures below are hypotheses to validate, not market claims.

Problem: small AI startups selling to enterprises, banks or EU customers are increasingly asked for evidence on bias, explainability and data protection (vendor questionnaires, DPDP readiness, GDPR DPIAs). Enterprise AI-governance platforms are priced and staffed for large firms; open-source libraries (Fairlearn, SHAP, Evidently) need ML expertise and produce no governance trail.

Customer: Indian seed to Series A AI startups (5–50 people) with a tabular decisioning model in hiring, lending, insurance or health triage, and no dedicated compliance hire. Users: the founder/CTO (buyer), the ML engineer (runs audits), an external advisor or CA/legal firm (reviewer).

Value: turns several weeks of ad-hoc evidence gathering into a repeatable audit run plus a report. Management angle: clear ownership, review cadence, a finding-to-action trail and rerun history, which is governance a small team can actually keep running.

Business model hypothesis:
- Free, self-hosted open-core edition (the four checks, single organisation).
- Hosted plan per AI system per month, with scheduled reruns, multiple reviewers and report history.
- Paid "audit-ready pack": an expert review of the control checklist, delivered with partner legal/CA firms.
- Channels: startup incubators, accelerator compliance programmes, CA/legal firms serving startups.

Validation plan (before or around the event): put the sample audit in front of 3–5 small teams, time them to their first report, note where they get confused, and ask whether the report answers a real customer questionnaire. Report the measured numbers in the pitch.

Cost story: ₹0 in API costs; runs on a 4-core / 8 GB laptop; benchmark targets are under 2 min for the non-explanation checks and under 5 min for a full audit on 10k rows × 30 columns. Publish the measured results, not the targets.

## 9. Build sequence

Assumes a 3–4 person team. The event deadline is not known, so effort is shown in relative days. Compress or drop P4 extras if time is short. The minimum winning slice is P0 to P3 plus the report.

| Phase | Work | Owner split | Effort | Exit gate |
|---|---|---|---|---|
| P0 Foundation | Fix `.gitignore`, commit frontend; resolve and pin the scientific stack on Py 3.13 (fall back to 3.12 only if shap/scipy wheels fail); env-based settings; DRF auth + login page; tenant scoping fix; anonymous denial; remove the api.ts demo fallback | BE1, FE1 | 2 days | Anonymous and cross-tenant requests are denied; `uv sync` and `npm run build` are clean |
| P1 Audit backbone | `ai_audit` models + migrations; dataset upload with limits (20 MB / 200k rows), SHA-256, schema preview; run config validation; worker command with claim/timeout/cancel; synthetic generator + sample models | BE1, BE2 | 3 days | Same input + seed gives identical results; failure and cancel states persist |
| P2 Four checks | fairness.py, drift.py, explain.py, privacy.py, control packs; unit tests on hand-calculable fixtures | BE2 (bias/drift), BE1 (explain/privacy), domain lead (control packs) | 4 days | Each category yields evidence or a clear unavailable state; tests pass |
| P3 UI + governance | New nav/overview; audit wizard; results tabs with charts; findings with submit/accept/resolve and no self-approval; controls page with evidence upload | FE1, FE2 | 4 days (parallel with P2 from day 2, using mocked contracts) | The full demo flow is clickable on real API data |
| P4 Delivery | HTML/JSON report + run diff; local CLI + bundle upload; benchmark script; README with limitations; pitch deck; demo rehearsal | All | 3 days | Fresh-clone setup runs the HireLens scenario; runtime and memory are measured |

Cut list if time is short (drop in this order): CLI bundle path → run diff view → bootstrap CIs (keep denominators) → GDPR pack (keep DPDP). Never cut: the four categories, "not assessed" states, masking, auth on uploads.

## 10. Acceptance checklist

- [ ] Fixture tests: selection rate, TPR/FPR and DPD match hand calculations.
- [ ] Zero denominators and missing labels/groups produce `insufficient_evidence`, never a pass.
- [ ] Stable fixture → no drift alert; shifted fixture → alert, with sample sizes shown.
- [ ] SHAP additivity holds within tolerance; the report names the exact model version.
- [ ] PII tests include false positives (e.g. a 12-digit order ID that fails the Verhoeff check); no raw identifiers in logs or reports.
- [ ] Completed run results are unchanged after findings are accepted or a rerun happens.
- [ ] Cross-tenant tests on list, detail, upload, download and report endpoints.
- [ ] Oversized file, bad encoding, incompatible schema and unsupported model all return actionable errors.
- [ ] The report lists all four categories, including skipped and errored checks; no "certified" or "compliant" wording.
- [ ] Fresh setup runs HireLens end to end; measured runtime is published.

## 11. Known limitations to state openly

- Tabular binary classifiers only; explanations only for supported sklearn tree models.
- Privacy results are readiness evidence for human review, not legal advice or a compliance verdict.
- Uploaded declarations are not independent verification of a customer's infrastructure.
- The remaining security items in the research table (RLS, immutable audit log, full workflow hardening) must be done before real customer data in a shared deployment.
- DPDP provisions are phased in. The control pack records each provision's effective-status basis and must be re-reviewed when rules change.

## 12. Open questions for the team

1. Event deadline and submission format (live demo, video, deck, repo)?
2. Team size and who owns the backend, frontend and domain/legal work?
3. Is a hosted demo URL required, or is a local demo acceptable?
4. Does the hidden event "Context" field specify LLM systems? If so, revisit the tabular-only scope before P2.
