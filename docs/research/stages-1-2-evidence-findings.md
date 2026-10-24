# Responsible AI toolkit: Stage 1 and Stage 2 evidence dossier

Research date: 24 October 2026. Desk research completed for this iteration; field validation remains open.

## Scope and evidence discipline

This report follows the two fully visible stages in the supplied photograph: problem discovery/baseline, and evidence/data/system analysis. The rest of the five-stage progression is cropped; no missing stages are inferred. The problem statement supplied by the user remains the requirements baseline.

This is a supplement to `responsible-ai-toolkit-plan.md`, not implementation. It tests the assumptions behind that plan. No interviews, user observations, customer datasets, benchmark runs or competitor installations were conducted. Existing repo observations are static-code findings from the earlier inspection. Perplexity and Gemini research has not yet been received or incorporated.

Evidence labels used here: **documented** = supported by a cited source or inspected code; **inference** = our interpretation; **hypothesis** = needs local validation; **target** = proposed success criterion, not achieved performance.

## Main findings

1. There is credible evidence of skills, time, security and governance barriers among SMEs. It does not establish the prevalence, willingness to pay or preferred product of Indian AI startups.
2. Existing solutions already combine AI testing and governance. The claim that no integrated toolkit exists would be false. Our proposed advantage must be tested against real alternatives.
3. The most feasible initial segment is small teams that can access prediction datasets and a supported model. Businesses using only closed SaaS AI tools cannot necessarily provide these inputs.
4. The four requested checks need different evidence. Predictions permit some outcome comparisons; actual outcomes permit error comparisons; model access permits explanations; privacy controls also need organisational evidence.
5. The existing repo supplies reusable records and screens, but none of the four AI audit engines is implemented. A polished interface cannot substitute for measured results.
6. Research supports proceeding to a bounded prototype and field validation. It does not justify claims of proven market demand, comprehensive compliance or superiority over competitors.

## Stage 1 — problem discovery and baseline

### Working problem definition

Small teams developing or operating AI-assisted decisions need a repeatable way to check outcomes, changing data, explanations and privacy/security practices, then communicate evidence and assign follow-up work. Limited specialist capacity and fragmented workflows can make this difficult. We must establish which of these barriers are most important to the intended users rather than assume that software price is the sole cause.

### Affected users and proposed initial segment

| Person | Job to complete | Pain hypothesis to validate |
|---|---|---|
| Founder/product owner | Decide whether a model needs review and explain the decision | Technical results do not translate into an action plan |
| ML engineer/developer | Assemble valid inputs, run checks and reproduce findings | Ad hoc scripts and documentation take repeated effort |
| Privacy/compliance reviewer | Assess applicability, evidence and unresolved risks | Technical reports omit processing context and organisational controls |
| Customer/procurement reviewer | Understand what was assessed and what remains unknown | Inconsistent reports are difficult to compare |
| Person affected by an AI decision | Receive fair treatment and meaningful review where appropriate | Organisation may lack an accountable challenge/review process |

Initial segment hypothesis: a small Indian startup with one or a few tabular classification systems, an engineer who can export predictions/features, and a founder or reviewer who owns follow-up. Team-size cutoffs are not established. Include an affected-person perspective in discovery; the paying organisation is not the only stakeholder.

A separate segment is an SME using an external chatbot or closed AI service. It may need vendor documentation and application-level testing, not the proposed model-audit workflow. Do not silently treat these segments as interchangeable.

### Boundary

In scope for research: system purpose/owner, model and dataset provenance, prediction and outcome analysis, reference/current data, supported explanations, privacy/security evidence, findings and corrective work.

Outside the initial product boundary: training general-purpose models, deciding individual loan/job outcomes, certifying legal compliance, auditing every supplier internally, real-time SIEM/host containment and automatic production changes. The organisation’s production model remains outside Reskure; Reskure analyses authorised snapshots or locally generated results.

### Symptoms versus possible causes

| Symptom | Possible cause, not yet proven for our users | Evidence and next test |
|---|---|---|
| Team cannot produce an audit report | Skills gap, unclear ownership, unavailable data, or no customer demand | UK assurance research identifies skills and awareness barriers; observe one real report-preparation task [E3] |
| High accuracy but uneven group outcomes | Aggregate metrics hide differences; sampling or labels may be biased | NIST treats bias as sociotechnical, extending beyond code; inspect subgroup data and decision context [E5] |
| Performance deteriorates unnoticed | No baseline, delayed labels, changed population or model | Compare model/version/time records and label availability; do not assume drift is the cause [T2] |
| Compliance checkbox lacks support | Policy existence is confused with effective control | Compare declaration with evidence and reviewer criteria [L1] |
| Audit work appears expensive | Staff time, integration burden or license costs | Measure each component; free tool alternatives exist [C1–C4] |
| Review cannot be reproduced | Dataset/config/model version not retained | Attempt to repeat the last assessment from its recorded artifacts |

These are a causal investigation map, not findings from interviews. A software toolkit may reduce workflow friction; it cannot repair organisational incentives, resolve every fairness tradeoff or supply missing lawful access to data.

### Baselines and measurable success

| Indicator | Current baseline | Collection method | Proposed target |
|---|---|---|---|
| Four requested audit categories | No implemented AI audit engines found in repo | Static inspection; validate at runtime during implementation | All four yield actual evidence or a clearly unavailable result |
| User preparation time | Unknown | Observe users preparing a report with current tools | At least 30% lower median time in a paired pilot; retain quality checks |
| First-run usability | Unknown | First-time users run a provided scenario | At least 4 of 5 complete without researcher intervention; report actual sample |
| Evidence completeness | Unknown | Fixed checklist of model/data/config/source/version and missing checks | Every exported test report includes required provenance and coverage |
| Metric correctness | No AI metric tests exist | Hand-calculable fixtures and independent expected outputs | All defined correctness fixtures pass |
| Failure transparency | Silent API fallback exists in current UI | Simulate failures after implementation | No failed or missing check displayed as passed |
| Resource use | Unmeasured | Fixed machine/data/profile, repeated runs | Initial target: 10k rows × 30 columns on CPU; full bounded run under 5 minutes on 4 cores/8 GB |
| Ongoing affordability | Unknown | Setup time + operator time + compute/storage + licenses | No required paid API; publish measured total effort/cost assumptions |
| Trust in report meaning | Unknown | Ask user to distinguish measured, declared and untested findings | At least 4 of 5 interpret these correctly in formative testing |

Targets are product decisions, not legal/statistical thresholds or achieved results. Five-user formative tests are useful for finding issues, not estimating a population adoption rate. Compare equivalent tasks with counterbalanced order, the same data and a fixed completeness rubric; record help and learning effects.

## Stage 2 — evidence, data and system analysis

### Evidence register: problem and users

| ID | Source and date | Documented finding | Limits and product implication |
|---|---|---|---|
| E1 | OECD, *Generative AI and the SME Workforce*, published November 2025; survey late 2024 [source](https://www.oecd.org/en/publications/generative-ai-and-the-sme-workforce_2d08b99d-en.html) | Representative survey of over 5,000 SMEs in seven countries; 31% reported generative AI use. Among non-users, 54% cited copyright/legal/regulatory concerns, 52% information-handling concerns and 50% employee skill gaps | GenAI, not specifically tabular model audits; countries exclude India. Supports discovery questions, not Indian-market percentages |
| E2 | OECD, 2026 D4SME, 13 April 2026 [source](https://www.oecd.org/en/publications/empowering-smes-in-the-age-of-ai_bf5a9816-en.html) | Non-representative sample of over 2,000 SMEs across 12 countries; time constraints, maintenance costs and skills gaps remain barriers; off-the-shelf use is prominent | Selection limits prohibit national prevalence claims. Challenges our assumption that all SMEs have model access |
| E3 | UK CDEI, assurance temperature check, December 2022 [source](https://www.gov.uk/government/publications/industry-temperature-check-barriers-and-enablers-to-ai-assurance/industry-temperature-check-barriers-and-enablers-to-ai-assurance) | Interviews, roundtables, symposium and a 41-response sector survey identified knowledge/skills and assurance-awareness barriers and fragmented approaches | Qualitative, small and older UK evidence; not an Indian SME survey. Justifies testing guidance and workflow simplification |
| E4 | UK ONS, *Artificial intelligence in UK businesses: 2023 to 2026*, June 2026 barrier data [source](https://www.ons.gov.uk/businessindustryandtrade/business/businessservices/articles/artificialintelligenceinukbusinesses/2023to2026) | 41% of businesses with 10+ employees reported no recent adoption barrier; cost affected around 7–14% across size bands | Counter-evidence to universal pain or cost-only claims; adoption barriers differ from assurance barriers |
| E5 | NIST SP 1270, 2022 [source](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1270.pdf) | AI bias includes systemic, human and computational/statistical factors and depends on deployment context | A metric dashboard alone cannot establish absence of harmful bias; retain human context and review |

Country lists, sample and denominators matter. E1’s percentages are reported reasons among non-adopters, not percentages of Indian startups and not documented compliance violations. E2 and E3 are not prevalence estimates. None establishes willingness to pay for Reskure.

India-specific research lead: A&M’s December 2025 release reports governance and assurance gaps across Indian organisations, including 66% using ad hoc or no formal audits. The release alone does not establish a representative small-startup sample; retain as contextual evidence pending the full methodology. [Publisher release](https://www.alvarezandmarsal.com/press-release/a-m-report-highlights-need-for-stronger-governance-and-security-as-ai-adoption-grows-across-india-inc). Media coverage of a Nasscom 2025 survey was also located, but the original report/methodology was not verified in this pass; its statistics are not used as established findings.

### Evidence register: technical and legal boundaries

| ID | Primary source | What it supports | Consequence |
|---|---|---|---|
| T1 | [Fairlearn metrics](https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html) | Selection and error-rate metrics answer different questions; fixed fairness rules can be misapplied | Require outcome meaning, groups, sample support and documented metric policy |
| T2 | [Evidently drift documentation](https://docs.evidentlyai.com/metrics/explainer_drift) | Distribution comparisons require reference/current data and configurable statistical methods | Report data changes separately from measured performance degradation |
| T3 | [SHAP TreeExplainer](https://shap.readthedocs.io/en/latest/generated/shap.TreeExplainer.html) | Explanations depend on a supported model, feature dependence assumptions and output units | CSV-only mode must not fabricate model explanations |
| T4 | [Presidio FAQ](https://github.com/data-privacy-stack/presidio/blob/main/docs/faq.md) | Automated detection does not guarantee discovery of all sensitive information | Describe candidate personal-data indicators; test misses and false positives |
| L1 | [EDPB security guide](https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en) | Security requires technical and organisational measures appropriate to the risk | Data-pattern detection is only part of the assessment; evidence/review is necessary |
| L2 | [EDPB individual rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en) | Rights and automated significant-decision safeguards depend on circumstances | Ask applicability questions and record human-review procedures |
| L3 | [DPDP commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) | Provisions are phased, including one-year and eighteen-month triggers | Separate readiness from effective requirements and version sources |
| L4 | [Final DPDP Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf) | Safeguards, breach processes and SDF-specific duties have distinct scope | Do not assign all SDF obligations to every startup |

Legal sources establish requirements, not evidence that target customers currently breach them. The prior plan also records the December 2025 corrigendum and October 2026 clarification; retain them in any implemented rule pack. No automated report should certify legal compliance from metric values.

### Existing solutions and competitive comparison

This is a documentation-based comparison, not a hands-on benchmark. Absence from a reviewed page means “not established”, not that a product lacks a feature. No verified cost quote was obtained.

| ID / alternative | Verified capability | Implication for Reskure |
|---|---|---|
| C1: [AI Verify toolkit documentation](https://aiverify-foundation.github.io/aiverify/) | Technical fairness/explainability/robustness testing, CLI results, process checklists and reports | Closest direct comparator; combined technical and governance workflow is already available |
| C2: [Fairlearn](https://fairlearn.org/) | Open-source fairness assessment and mitigation toolkit | Reuse proven metric implementations; compare Reskure’s setup/usability against a small notebook |
| C3: [Evidently](https://www.evidentlyai.com/) | Open-source evaluation/observability for ML and other AI applications | Drift/evaluation is not a novel invention; consider reuse instead of duplication |
| C4: [SHAP](https://shap.readthedocs.io/en/latest/) | Model-output explanations | An explanation chart is a component, not an entire governance product |
| C5: [IBM watsonx.governance](https://www.ibm.com/docs/en/watsonx/saas?topic=governing-ai) | Monitoring, factsheets and governance capabilities; deployment differences and licensing | Enterprise integrated governance exists; do not assert it is unaffordable without quotes and setup evidence |
| C6: Spreadsheet + scripts + reviewer | Baseline workflow to observe in pilot, not a researched vendor | May be sufficient for some teams; compare against it rather than assuming replacement value |

Proposed differentiation is a hypothesis: easy local setup for a narrow supported model family, India-relevant versioned privacy evidence, clear owner/action tracking and reports usable by non-specialists. Neither unique DPDP coverage nor superior usability has been proven. AI Verify should be tested as an alternative before deciding how much to build.

Suggested comparison task: run the same supported model/data through Reskure, AI Verify and a Fairlearn/Evidently/SHAP notebook. Record installation effort, operator steps, prerequisites, completed categories, failure clarity, report completeness and compute use. Keep unsupported-feature cells explicit. Use a checklist/manual review baseline for privacy evidence. Do not score product quality from website marketing claims alone.

### Dataset selection and limitations

| Dataset option | Provenance / terms | Intended use | Limitation |
|---|---|---|---|
| UCI Adult | 48,842 instances, 14 features; extracted from 1994 US census database; repository states CC BY 4.0 [source](https://archive.ics.uci.edu/dataset/2/adult) | Reproducible tabular benchmark and subgroup analysis | Historical US income prediction; not hiring suitability, lending truth or Indian population evidence; no natural modern production time series |
| ACS via Folktables | Maintainer provides tasks and loading code [repository](https://github.com/socialfoundations/folktables); code and source-data terms differ [datasheet](https://github.com/socialfoundations/folktables/blob/main/datasheet.md) | Optional temporal/geographic comparisons with documented year/state choices | US population, survey design/weights and task filters matter; obey Census/IPUMS terms; code license is not a blanket dataset license |
| Controlled synthetic data | Generated by us with fixed seed, schema and documented mechanism; not yet generated | Known bias/drift/PII cases, edge cases, safe demonstration | Validates detector behaviour under constructed assumptions, not real harm prevalence or market demand |
| Consented pilot snapshots | Organisation-provided, purpose-limited and de-identified where possible; not yet obtained | Test actual onboarding, schema variation, utility and workflow | Needs authority, protection, retention rules and representativeness assessment |

Recommendation: start engineering validation with small synthetic fixtures and one public benchmark; use real pilot data only after security safeguards and permission are established. Do not present a random split of Adult as natural temporal drift. An intentionally perturbed test split must be labelled injected drift. Do not repurpose its income label as real recruitment ground truth.

Proposed synthetic cases: identical reference/current distributions; shifted continuous feature; new category; group disparity; unequal error rates with known labels; missing labels; tiny/empty groups; zero denominator; duplicate columns; masked test email/phone indicators; model unavailable. Use explicit artificial groups for mechanics and separately discuss real-domain group selection. Keep predictions, group labels and ground truth provenance separate.

For every dataset retain source, terms, extraction date, version/hash, schema, exclusions, model feature mapping, target definition, group definitions and baseline/current period. Avoid inferring caste, race, gender or disability from names. Data supplied for fairness analysis needs its own appropriate processing basis and protection.

### Process and system analysis

Current repo, observed from source: server pages call a GET wrapper; failures can return hardcoded demo data; risk/control/approval records exist; the audit page contains static decisions; there is no model/data ingestion-to-audit-run path. These are software observations, not observations of customer work.

Hypothesised current customer process to validate:

Model owner requests review → engineer locates datasets and versions → separate scripts calculate metrics → reviewer collects policy/security evidence → findings are assembled in a document → owner decides action → later review repeats data assembly.

Proposed process:

Register purpose/owner → validate inputs and supported checks → execute versioned audit → separate measured results from declarations and unknowns → assign/review actions → export evidence → compare a later run.

Trust boundaries: uploaded files and external result bundles are untrusted; authenticated organisation identity controls access; worker execution is bounded; raw datasets stay private with a deletion policy; reports default to aggregate/masked content. An optional local model runner keeps model execution in the organisation’s environment. Imported outputs must say who produced them and cannot be misrepresented as independently server-verified.

## Primary research still needed

Desk research cannot honestly finish the interview/observation parts of the stages. Proposed discovery sample: three small teams building tabular models, two teams using third-party AI, and one privacy/security reviewer. This purposive sample tests assumptions, not prevalence. Recruitment and interviews have not occurred.

Interview prompts, designed to avoid leading users toward our product:

1. Walk through the last time someone asked you to demonstrate that an AI system was suitable or safe to use.
2. What triggered the review, and who made the final decision?
3. Which artifacts could you produce, and which were missing?
4. How much actual staff time was spent on data preparation, tests, interpretation and reporting?
5. Which tools did you try, and why did you keep or abandon them?
6. Can you access predictions, actual outcomes, relevant group attributes, a reference dataset and the model itself?
7. What cannot leave your environment, and what approval is needed for an audit?
8. Which finding led to action? What evidence would make you repeat the process?
9. What budget or procurement process exists? Ask about past expenditure before suggesting prices.

Observation protocol: request an authorised, redacted example; record task duration, handoffs, errors, missing inputs and assistance; separate verbatim participant statements from researcher interpretation; obtain consent for recording; store minimal identifiers. Never collect credentials or production personal data for convenience.

Decision tests:

- If most intended customers lack model/data access, reconsider the tabular-first segment or build vendor/application assessment instead.
- If AI Verify meets their need with comparable effort, prefer a focused integration/localisation or reconsider the product.
- If reports do not trigger real decisions, revise the owner/action workflow before expanding metrics.
- If privacy data cannot leave the customer environment, prioritise a local runner and aggregate evidence exchange.
- If statistical support is too weak, report uncertainty/unavailable checks instead of inventing a confident score.

## Integration protocol for forthcoming Perplexity/Gemini research

Treat each report as a source of claims to verify. Do not count agreement between two AI-generated reports as independent corroboration.

For each claim record: exact claim; originating report; primary source URL; publication and observation dates; geography; sample/denominator; method; direct support or inference; conflicts; confidence; and product decision affected.

Statuses: verified; partially supported; outdated; contradicted; unverifiable; recommendation. Keep legal obligations separate from standards and vendor features; distinguish current law from commencement dates. Recheck market sizes, pricing, performance promises and claims of unique features especially carefully. Preserve disagreements until the evidence resolves them.

## Completion status

Stage 1 desk work: user hypotheses, system boundary, symptom/cause map, baseline inventory and measurable targets documented. Actual user baseline remains unmeasured.

Stage 2 desk work: source register, methods limitations, dataset shortlist, process maps and alternative-solution analysis documented. Interviews, observations, dataset execution and hands-on comparisons remain pending.

The earlier plan remains a feasible engineering proposal. This evidence pass adds an important qualification: the tabular-first customer segment and the advantage over AI Verify must be validated before presenting them as established product-market fit.
