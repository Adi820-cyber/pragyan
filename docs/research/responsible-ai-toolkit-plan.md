# Reskure: responsible AI toolkit research and scope

Research date: 24 October 2026. Target: PRAGYAN 2K26, Track 4-05, Entrepreneurship & Future of Management.

## Decision

Build Reskure into a lightweight responsible AI audit toolkit for small organisations. Retain its Django API, Next.js interface, risk records, evidence records and review workflow. Make a real audit run the main product experience.

The present repository is a general GRC/SecOps foundation. It does not yet implement bias measurement, drift analysis, model explanations or a DPDP/GDPR assessment. Renaming dashboards would not close this gap.

Recommended first scope: batch audits of tabular binary classifiers, with an explicit supported model integration. A founder or small engineering team should be able to identify an issue, understand the evidence, assign a corrective action and export a reviewable report.

This document is a proposed implementation plan, not a claim that those capabilities exist. No application code was changed during research. Repository observations come from static inspection; builds, runtime behaviour and tests were not executed. The supplied problem statement is the requirements baseline: its Context field is empty, and this research did not locate an authoritative public event page with additional requirements. Deadline, judging criteria, team capacity and required submission format remain unknown.

## Requirement-to-deliverable mapping

| Requirement | Minimum credible deliverable | Evidence of completion |
|---|---|---|
| Algorithmic bias | Outcome and error-rate comparisons across user-selected groups | Measured rates, denominators, differences, uncertainty and policy rationale |
| DPDP/GDPR data security | Dataset checks plus evidence-backed privacy/security assessment | Masked findings, applicability, cited requirements, missing evidence and reviewer decisions |
| Model drift | Reference-versus-current feature and prediction comparison | Distribution charts, statistics, sample sizes and policy thresholds |
| Explainability | Global and individual explanations for a supported model | Model identity, input schema, prediction, contributions and explanation units |
| Automated audit suite | One persisted run invoking the applicable checks | Run status, reproducible configuration, outputs and failure reporting |
| Small organisations / limited budgets | Guided onboarding, CPU batch processing and exportable results | Measured setup time, runtime, memory and operating-cost assumptions |
| Governance | Owner, review, remediation and rerun history | Traceable finding-to-action-to-evidence chain |

## What to keep, adapt, remove and defer

“Remove” below means remove from the new product experience or replace during implementation. Do not delete existing tables or migrations merely to simplify the demo; preserve data and use planned migrations if later removal is necessary.

| Decision | Existing area | Proposed treatment |
|---|---|---|
| Keep | Django/DRF, serializers, migrations, OpenAPI | Continue with one backend; avoid a framework rewrite |
| Keep | Next.js/TypeScript, layout and metric components | Reuse the shell and visual components with real audit data |
| Adapt | `backend/apps/risk` | Link AI findings to accountable owners, treatment decisions and review dates; keep 5×5 scoring optional |
| Adapt | `backend/apps/evidence` | Store generated run artifacts; compute hashes on the server, implement controlled access and retention |
| Adapt | `backend/apps/compliance` | Separate reference requirements from each organisation’s assessments; add versioned DPDP/GDPR control packs |
| Adapt | `backend/apps/workflows` | Start with owner submission and reviewer sign-off; enforce identity and permissions |
| Adapt | `backend/apps/core` and `authorization` | Repair authentication, request-level scoping, access controls and actual audit events |
| Replace | Executive Command Center | Overview of AI systems, recent audits, unresolved findings, overdue reviews and evidence gaps |
| Replace | NIST CSF posture as headline | Four audit categories with assessed, missing and review-required states |
| Remove from primary UI | SecOps triage, host isolation, IAM rotation and cloud account inventory | These do not demonstrate the four requested checks; leave legacy code dormant pending deliberate cleanup |
| Remove | Silent demo fallbacks, simulated successful actions, fixed counts | Explicit sample mode; real mode must show errors and empty states |
| Remove | Role selector that only changes local display | Display authenticated identity and assigned permissions |
| Remove or correct | “RLS Active”, immutable log, live connector and complete compliance claims | Display only verified capabilities and actual deployment state |
| Defer | SIEM/cloud connectors, large framework catalog, enterprise ABAC editor | Revisit only when a pilot requires them |
| Defer | LLM/RAG, image/audio, regression and multiclass auditing | First prove the complete workflow on one model family |
| Defer | Automatic retraining/debiasing and autonomous deployment blocks | Keep corrective decisions under human review |
| Avoid | Universal trust score, fairness certificate, automatic legal verdict | Show distinct measurements, coverage and limitations |

Concrete repository touchpoints:

- `frontend/src/app/page.tsx`: replace cloud metrics and architecture marketing with audit outcomes.
- `frontend/src/components/layout/Sidebar.tsx`: replace navigation and fixed tenant/status badges.
- `frontend/src/components/layout/Header.tsx`: replace simulated role switching.
- `frontend/src/lib/api.ts`: remove failure-to-demo substitution from real mode; propagate authenticated context and handle pagination.
- `frontend/src/app/audit/page.tsx`: replace hardcoded decision records with real audit history.
- `frontend/src/components/dashboard/SecOpsFeed.tsx`: remove simulated containment from the main experience.
- `backend/apps/core/management/commands/seed_catalog.py`: separate optional legacy examples from new synthetic AI audit examples and source-backed control packs.
- `README.md`: describe demonstrated scope, installation and limitations accurately.
- `.gitignore`: the broad `lib/` pattern currently ignores `frontend/src/lib/api.ts` and `types.ts`; narrow it. The entire frontend is currently untracked and needs deliberate inclusion in version control when implementation begins.

## Four audit modules to add

### 1. Bias and group outcomes

Accept predictions and explicitly selected comparison groups. Calculate group counts, selection rates and demographic-parity difference/ratio. With actual outcomes, add true/false positive rates, false negative rates and equalized-odds difference. Label encoding and which outcome is favourable must be explicit: “1” can mean rejection or default.

Report disparities as evidence for review. Fairlearn warns against treating a fixed ratio, including the commonly cited 80% rule, as a universal fairness determination. Store chosen thresholds and their rationale with each run. [Fairlearn assessment guidance](https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html).

Show denominators, missing-label coverage and small-group warnings. Undefined rates must be “not assessed”, never zero. Use reproducible bootstrap confidence intervals where appropriate; they quantify sampling uncertainty, not dataset representativeness. [Fairlearn confidence intervals](https://fairlearn.org/main/user_guide/assessment/confidence_interval_estimation.html).

Do not infer sensitive attributes from names or photos. Make group selection intentional, access-controlled and justified. A model can be assessed without a group column, but its group-fairness checks must then be marked unavailable. Actual outcomes may also encode historical bias.

### 2. Data and prediction drift

Compare compatible reference/current datasets. Check schema changes, missingness, unseen categories and output distributions before statistical comparisons. Exclude IDs and declared administrative fields by default. Store time windows, model versions and any sampling.

For the narrow first version, use a two-sample KS statistic for suitable continuous numeric fields and Jensen–Shannon distance for aligned categorical distributions. Display the magnitude and sample sizes alongside policy thresholds. Do not rely on p-values alone, and account for multiple comparisons if using them to trigger alerts. Discrete numeric fields need appropriate treatment rather than blindly applying continuous-test assumptions. [SciPy KS documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.ks_2samp.html), [SciPy Jensen–Shannon documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.distance.jensenshannon.html).

Input or prediction drift is a warning signal, not proof of worse model performance. Comparable actual outcomes allow a separate performance comparison. Do not call a distribution change “concept drift” without evidence about the input-outcome relationship. [Evidently drift guidance](https://docs.evidentlyai.com/metrics/explainer_drift).

### 3. Explainability

Use SHAP with one supported scikit-learn tree model and documented preprocessing. Show global mean absolute contributions and an individual prediction explanation, including baseline, model output, feature contributions and output units. Bound explanation rows and background sample size for CPU execution. [SHAP TreeExplainer](https://shap.readthedocs.io/en/latest/generated/shap.TreeExplainer.html).

CSV predictions alone do not provide the model behaviour needed for these explanations. Offer a trusted organisation-local adapter that receives an already loaded supported estimator and feature data, then exports a schema-validated result bundle. Bundle origin must distinguish server-computed from externally supplied results. The sample model demonstrates the path; an organisation’s own supported model must also be integrable before claiming general usefulness.

Do not accept arbitrary pickle/joblib uploads into the server; deserialising them can execute code. Reviewed model formats may be a later extension. [scikit-learn persistence guidance](https://scikit-learn.org/stable/model_persistence.html).

Explain contributions as model associations, not causal reasons or guaranteed ways to change an outcome. [SHAP causal interpretation guidance](https://shap.readthedocs.io/en/latest/example_notebooks/overviews/Be%20careful%20when%20interpreting%20predictive%20models%20in%20search%20of%20causal%20insights.html).

### 4. Privacy and data-security readiness

Combine bounded automatic checks with structured evidence review. A CSV cannot prove lawful processing, production encryption, deletion capability or breach readiness.

| Check | Automatic part | Human/evidence part |
|---|---|---|
| Personal-data indicators | Column/value patterns for email, phone and likely identifiers; masked results | Confirm classification, necessity and purpose; detectors can miss data or flag false positives |
| Minimisation | Flag identifiers and declared unnecessary fields in model inputs | Approve justified feature use and audit-group processing |
| Retention | Detect overdue dates if metadata is provided | Verify retention rules, deletion process and exceptions |
| Notice and processing basis | Required-field and evidence-presence checks | Review appropriateness of purpose, basis, notice and consent where relevant |
| Access/security | Verify Reskure’s own configured controls; validate supplied structured evidence | Assess customer infrastructure, access reviews, backups and processor arrangements |
| Human oversight | Check owner/reviewer and procedure evidence | Assess whether review is meaningful and contest routes function |
| Incident readiness | Flag missing procedure, contact or review date | Confirm organisation-specific duties and operational capability |

Keep DPDP and GDPR applicability separate. GDPR has multiple lawful bases and additional conditions for special-category data; do not require consent for all processing. [EDPB lawful processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en). Small size alone does not remove GDPR applicability. [European Commission SME guidance](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en).

Security assessment should cover confidentiality, integrity and availability through appropriate technical and organisational measures. Uploaded declarations are evidence to review, not independent verification of a customer’s systems. [EDPB security guidance](https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en).

For GDPR, use reviewed mappings to Articles 5/6/9, 13–14, 22, 25, 28, 30, 32–35 as relevant to the organisation. Automated significant decisions and high-risk processing require specific applicability questions; an explanation chart alone does not satisfy the whole assessment. [EDPB individual rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en), [EDPB DPIA guidance](https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en).

For DPDP, start with purpose/basis, notice, safeguards, retention, rights/grievance handling and relevant children/SDF applicability questions. The Act permits consent or specified legitimate uses; startup exemptions require the relevant notification rather than a blanket assumption. [DPDP Act, sections 4–17](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf).

Version the legal pack. The 2025 commencement notification stages provisions immediately, after one year and after eighteen months; as of this research date, many substantive duties remain in a future phase. Store the legal trigger and distinguish “readiness” from an effective obligation. Avoid an unsourced universal deadline. [Official commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf).

Use the final 2025 Rules with their corrigendum. Rule 6 addresses safeguards, Rule 7 breach handling and Rule 13 additional Significant Data Fiduciary duties; do not apply SDF-specific algorithmic duties to every startup. [Final Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), [December 2025 corrigendum](https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf).

The October 2026 order clarifies wording in sections 9 and 10, including “data audit”. Include it in the source register; it does not itself supply a generic AI fairness standard. [Official October 2026 order](https://www.meity.gov.in/static/uploads/2026/10/daf495a7b5798a3dfa72a944b51fc176.pdf).

Each control needs source, provision, jurisdiction, applicability answer, effective-status basis, pack version, evidence, reviewer and review date. Suggested assessment states: needs evidence, evidence supplied, reviewed, gap identified, not applicable with rationale. Keep these distinct from automated test outcomes.

## User experience

Primary navigation: Overview; AI Systems; Audits; Findings & Actions; Privacy & Controls; Evidence & Reports. Put organisation settings and access administration in secondary navigation. Bias, drift and explainability are tabs within each audit, not separate disconnected applications.

1. Register system purpose, owner, decision affected, intended population and model version.
2. Choose explicit synthetic sample mode or provide datasets/local model results.
3. Map feature, prediction, actual-outcome and group columns; review the meaning of the favourable outcome.
4. Preview data quality and which checks are available. Confirm reference period and audit policy.
5. Run applicable checks with persisted progress, cancellation and clear failure states.
6. See an executive summary and drill into measurements and privacy evidence gaps.
7. Assign findings, record remediation, submit for review and rerun.
8. Export a report with scope, evidence, limitations and unresolved work.

Prefer plain statements such as “Group A has a lower selection rate; review the data and decision policy.” Every alert should explain what changed, why it matters and what to investigate next. A successful calculation is not a passed check. No single score should conceal failed, skipped or unevaluated categories.

## Minimum architecture and data contract

Retain the existing stack. Add one `ai_audit` Django app with isolated services for validation, fairness, drift, privacy indicators, explanations and reporting. Reuse existing domain records through explicit relationships rather than forcing datasets into generic cloud assets.

| New entity | Purpose |
|---|---|
| AI system and model version | Purpose, owner, supported model identity, intended use and limitations |
| Dataset snapshot | Schema, provenance, period, content hash, counts, storage reference and deletion date |
| Audit run | Versioned inputs, config, policy, engine/library versions, seed, status and timestamps |
| Check result | Category, metric, group/feature, value, units, support, uncertainty and assessment state |
| Finding | Severity, rationale, check/evidence links, owner, resolution and review history |
| Control assessment | Organisation-specific applicability/evidence state for a versioned requirement |

An audit run must capture dataset IDs, schema/column mapping, model versions, favourable outcome, threshold, reference/current windows, available labels, group configuration and legal-pack version. Reject malformed encodings, duplicate columns and incompatible schemas with useful messages. Guard zero denominators, nonfinite numbers and empty data. Record every exclusion and sample rule.

Execution: for the first usable web version, one bounded worker process can poll a database-backed run table; use explicit task states and timeout/retry rules. A CLI can invoke the same services for local model explanations. Avoid long work in web requests and unsafe in-process background threads. Introduce Redis/Celery only if measured concurrency requires it.

Core result states: no alert under selected policy; review required; insufficient evidence; not applicable with rationale; error. Persist raw metric outputs separately from workflow decisions. A rerun creates a new snapshot; an accepted risk must not rewrite the original result.

Reports should include a plain-language summary, four-category coverage, input/model provenance, method and threshold versions, measured results, missing checks, actions, reviewer and time. Start with downloadable JSON and printable HTML; PDF polish can follow. A content hash detects changes only relative to a trusted recorded hash and does not alone make evidence tamper-proof.

## Security and integrity fixes required for real data

Static inspection found these concrete risks. They must be addressed before admitting real customer data or exposing a shared deployment; an isolated synthetic demonstration is a separate, explicitly labelled scope.

| Finding | Code evidence | Required implementation |
|---|---|---|
| Caller chooses identity through headers | `core/middleware.py` resolves X-Actor-ID / X-Membership-ID | Bind membership to authenticated identity; tenant choice must require membership |
| Public tenant CRUD | `core/views.py`, TenantViewSet uses AllowAny | Restrict tenant creation/management; require authentication |
| Tenant scoping can fail open | `core/models.py` returns all rows without context; several viewsets define querysets at import | Filter at request time, deny absent context, validate related-object tenancy |
| Anonymous actor receives fallback role | `authorization/engine.py` defaults role to CONTRIBUTOR | Explicit anonymous denial before permission evaluation |
| Action permissions and identity mismatch | `authorization/permissions.py`, `workflows/views.py` | Explicit permission per action; actor from session; enforce reviewer assignment |
| Client can influence workflow states | Approval/containment views and model serializers | Transactional server-controlled transitions; prevent self-approval and duplicate decisions |
| Evidence is metadata only | `evidence/models.py`, `serializers.py`, `views.py` | Upload limits, private storage, computed digests, authorised download/delete |
| Claimed RLS absent from migrations | `core/middleware.py` only sets a session variable | Remove claim; implement and test DB policies if RLS becomes part of the deployment design |
| Logs are not proven immutable | `core/models.py`; policy logging suppresses exceptions | Real change events and operational error handling; accurate integrity claims |
| Development security defaults | `reskure/settings.py` | Environment-based hosts, origins, secrets, secure cookies/transport and debug-off deployment |

Protect audit uploads themselves: size/row limits, safe filenames, restricted file types, retention/deletion controls, masked logs and report excerpts, bounded worker resources, and sanitised exports. Externally supplied result bundles are untrusted input. Do not permit arbitrary model URL execution or server-side fetching of unknown locations.

## Low-cost implementation choice

Proposed analysis stack: pandas/NumPy, SciPy, scikit-learn, Fairlearn and SHAP. Keep one drift implementation. Evidently is an alternative if a wider metric catalog becomes useful; do not add it alongside a duplicate full drift engine. [Evidently quickstart](https://docs.evidentlyai.com/quickstart_ml).

Fairlearn and SHAP are MIT-licensed; Evidently is Apache-2.0. Check exact pinned dependencies and transitive licenses before distribution. No paid LLM API is required for the recommended checks. Hosting, maintenance, review and support still have costs. [Fairlearn license](https://github.com/fairlearn/fairlearn/blob/main/LICENSE), [SHAP license](https://github.com/shap/shap/blob/master/LICENSE), [Evidently license](https://github.com/evidentlyai/evidently/blob/main/LICENSE).

The repo requests Python >=3.13. Resolve and smoke-test the chosen scientific stack on the actual Windows/Python environment before committing versions; compatibility was not tested in this research. Preserve existing lockfiles and change the interpreter only if demonstrated dependency constraints require it.

Suggested benchmark targets, not measured claims: one CPU worker on a 4-core/8-GB machine; 10,000 rows and 30 columns per comparison; no paid API calls; under two minutes for non-explanation checks and under five minutes for a bounded full audit; first sample report in ten minutes for a new user. Cap explanation samples initially and publish hardware, versions and actual measurements. Adjust scope if measurements miss these targets.

For a local single-organisation demo, SQLite is adequate as a design choice. Use PostgreSQL and verified isolation for a shared multi-organisation pilot. Neither setup needs Kubernetes, Kafka, a vector database or GPUs for this initial scope.

## Ordered implementation backlog

| Stage | Work | Exit gate |
|---|---|---|
| P0: truthful foundation | Correct ignored frontend files, explicit sample mode, auth/scoping, protected uploads, basic identity/review policy, dependency validation | Anonymous/cross-tenant access denied; API failure cannot look successful; clean setup works |
| P1: audit backbone | AI system/model records, datasets, validation, persisted runs, worker and result schema | Same input/config yields reproducible outputs; cancellation/failure recorded |
| P2: four checks | Fairness, drift, supported explanations, privacy indicators plus evidence checklist | Each category produces actual evidence or a clear unavailable state |
| P3: management workflow | Findings, ownership, reviewed control assessments, evidence, before/after reruns | Finding can be traced through action and reviewer decision |
| P4: delivery | Report/export, onboarding, synthetic scenario, benchmark, tests and docs | End-to-end demo and stated acceptance criteria pass |

Build order is not a calendar estimate. No fixed completion date is credible without team availability and event deadline. Do not spend the first implementation cycle redesigning the whole visual theme.

## Demonstration and acceptance

Use a clearly synthetic application-screening scenario with a deterministic binary model. No real applicant data is needed.

Demonstrate a baseline, a deliberately disparate model, shifted incoming data and a revised model evaluated on the same held-out data. Show one personal-data indicator and a missing security-policy artifact. A reviewer assigns remediation; a later run shows changed measurements and retained unresolved issues. Do not choose a different evaluation set solely to manufacture improvement.

Acceptance criteria:

- Hand-calculable fixtures reproduce selection and error rates correctly.
- Missing labels/groups and zero denominators never become passes.
- Stable and shifted distributions exercise both non-alert and alert paths.
- Explanations identify the exact model/version and satisfy the supported explainer’s additive relation within documented tolerance.
- Privacy detector tests include false positives; raw identifiers do not appear in normal logs/reports.
- Completed runs preserve original measurements; later decisions/reruns do not overwrite evidence.
- Request-level tests cover lists, detail, aggregates, related-object writes and downloads across tenants.
- API/worker failures, oversized files and unsupported models show actionable errors.
- Report includes all four categories and every skipped/error check; no automatic compliance certificate.
- Exported result provenance is reproducible and distinguishes local-imported from server-computed evidence.
- A fresh setup can run the complete synthetic scenario; runtime and memory are measured.

The management value to test with pilot users is reduced effort to assemble evidence and act on findings. Proposed customer discovery: observe three to five small teams performing the same audit task, measure time and confusion, and ask whether the report answers customer/vendor-review questions. These are validation activities, not evidence of existing demand. Explore self-hosted usage and optional hosted/support plans after measuring costs; do not invent pricing or market-size claims.

## Boundaries and open decisions

The four requested technical categories are mandatory. Scheduled monitoring, richer model support, production connectors, external reviewer collaboration and fuller policy catalogs are later enhancements. NIST AI RMF can organise governance concepts, but it is a voluntary framework rather than a certification or a substitute for privacy law. [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework).

Before implementation scheduling, confirm the event deadline, available developers, deployment target and whether the intended first customer uses tabular ML or LLMs. This plan assumes tabular binary classification because it gives a bounded, demonstrable implementation of all four requested checks. If the missing event Context specifies another model family, revisit that assumption before building the audit engines.

Research limitations: no exhaustive legal applicability review, dependency installation, runtime security test, performance benchmark or competitive-market study was performed. Sources are official legislation/regulator guidance and primary library documentation where available. Versioned control wording should be reviewed before representing it as a legal obligation for a particular organisation.
