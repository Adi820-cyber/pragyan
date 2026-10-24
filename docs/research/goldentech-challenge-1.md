# Challenge 1 — Goldentech: AI footprint and stakeholder exposure baseline

Date: 24 October 2026. Status: initial public-source baseline; internal validation pending.

## Organisation and study boundary

Goldentech is the user-selected label for this case study. Public descriptions come from gbtech.in. This is a pseudonym, not full anonymisation: retaining the website and product names makes the source organisation identifiable.

The website describes a technology and business-services organisation serving India and international markets, with M-Suite for business operations, Medimine for healthcare, and SMART Studio for AI-supported intelligence [S1]. Employee count, legal entity, turnover, internal AI usage and deployment maturity are not established by the reviewed pages. Serving SMEs does not establish that the supplier itself is a small enterprise. Challenge eligibility remains to be confirmed.

Proposed primary boundary: the team developing, reviewing and delivering SMART Studio outputs, including its data inputs and downstream customer decisions. This is a proposed study boundary, not a verified organisational unit. It does not resolve enterprise-size eligibility. Medimine is included in the wider footprint but excluded from the initial hands-on pilot pending separate clinical validation arrangements.

## Evidence labels

- **Public claim:** a capability described by the organisation; not independently demonstrated.
- **Analyst inference:** a plausible decision pathway or harm to investigate.
- **Proposed responsibility:** a role to confirm or assign; not an observed appointment.
- **Unknown:** insufficient evidence. Unknown does not mean absent, failed or unsafe.

## Deliverable 1: AI adoption footprint

| ID | Publicly described activity | Potential decision influenced — analyst inference | Status |
|---|---|---|---|
| A1 | SMART Studio financial/market intelligence and risk scores; investor and lending audiences [S2] | Which organisations receive investment attention or further credit review | Public claim; live use and decision authority unknown |
| A2 | ACT-AI accounting, tax and reporting; MIRA management reports [S2] | Which financial issues are escalated and which reports inform management | Public claim; automation level unknown |
| A3 | SEGMA governance/project tracking; TECHNNOVA data integration and patent analysis [S2] | Which compliance tasks, projects or innovation opportunities are prioritised | Public claim; individual implementations unknown |
| A4 | Medimine clinical decision support, risk prediction, clinical alerts and language assistance [S3] | Patient review priority and clinician interpretation | Public claim; clinical deployment and oversight unknown |
| A5 | M-Suite accounting, inventory and operations [S1] | Operational and financial actions | Software automation described; AI use not established |
| A6 | Employee use of general-purpose AI tools | Drafting, coding, support or recruitment | Discovery question only; no evidence of actual adoption |

Input data to inspect, rather than assume: financial reports and market sources for A1–A3; any confidential client records or personal data; patient records and monitoring inputs for A4. Obtain actual data schemas and flow diagrams before recording data categories as verified.

Proposed process to validate: data source → ingestion/permissions → AI processing → reviewer → report/recommendation → customer decision → feedback/incident handling. At each step establish whether data leaves the organisation, which provider receives it, and who can correct the output.

### Accountability map — proposed roles, all assignments unconfirmed

| Activity | Responsible for operation | Accountable for acceptance | Required handoff |
|---|---|---|---|
| AI inventory and permitted uses | Product/operations lead | Executive sponsor | Staff disclose tools and intended uses |
| Data permissions and access | Data/security lead | Designated data owner | Supplier terms, customer permissions and retention evidence reviewed |
| Model changes and evaluation | Engineering/model owner | Product owner | Reviewer sees test results and known limitations |
| Financial or governance report release | Qualified domain reviewer | Service delivery owner | Customer understands scope and retains its own decision responsibility |
| Clinical use, if in scope later | Clinical reviewer and technical operator | Designated clinical governance owner at deploying provider | Supplier and care-provider duties explicitly agreed |
| Complaints, correction and incidents | Support/incident owner | Executive sponsor | Affected person or customer can escalate and obtain a response |

One person may hold multiple roles in a small organisation. Record actual names privately, decision authority and backup coverage. Do not infer appointments from website founder profiles. These are operational proposals, not a determination of legal controller/processor duties.

## Deliverable 2: harm and stakeholder exposure baseline

The following are potential harms inferred from the described functions, not observed incidents. Priorities indicate where to investigate first; no numerical likelihood or residual-risk score is justified yet.

| ID | Exposed stakeholders | Potential harm mechanism | Initial investigation priority | Evidence required |
|---|---|---|---|---|
| H1 / A1 | Evaluated businesses, founders, investors and lending customers | Uneven source coverage or erroneous scores disadvantage poorly documented firms; users over-rely on rankings | First wave | Actual decision use, source coverage, scores, overrides and relevant comparison groups |
| H2 / A1–A3 | Client organisations and people represented in their records | Confidential or personal information reaches an unintended tenant, employee or external AI provider | First wave | Data flow, access tests, provider contracts, retention and deletion behavior |
| H3 / A2–A3 | Clients, staff and report recipients | Unsupported statements or outdated information lead to incorrect reports, escalations or business actions | First wave | Source-linked outputs, review samples, correction history and release approvals |
| H4 / A1–A3 | Customers relying on repeated reports | Changes in inputs or models alter score quality without detection | First wave | Version history, comparable time windows, outcomes and monitoring rules |
| H5 / A4 | Patients, carers and healthcare workers | Missed/incorrect alerts or misunderstood language output affect care; health information is exposed | Separate urgent scope check because potential severity is high | Deployment confirmation, clinical oversight, validation and incident records |
| H6 / all confirmed uses | People affected by recommendations; reviewers | No explanation, correction route or accountable decision owner | First wave | Named owners, explanation samples, complaint channel and response records |

### Baseline measurements

| Indicator | Current value | How to establish it |
|---|---|---|
| Number of active AI systems | Unknown; website product/agent counts are not deployment counts | Reconcile owner interview, tool inventory and actual workflows |
| Decisions or reports influenced per month | Unknown | Count a defined period of de-identified logs |
| Distinct people/organisations exposed | Unknown | Count unique affected entities; separate customers from data subjects |
| Share of active systems with an accountable owner | Unknown | Verified owned systems divided by verified active systems |
| Share of sampled outputs reviewed before use | Unknown | Review evidence divided by sampled outputs requiring review |
| Error/correction/complaint rate | Unknown | Define denominator and inspect recorded events; missing logs are not zero incidents |
| Bias, drift and explanation quality | Not measured | Choose tests only after identifying actual output type, relevant groups, labels and time windows |
| Existing safeguards and remaining risk | Not verified | Inspect controls and test effectiveness before scoring residual risk |

Do not apply binary-classifier fairness metrics to every generative report. An LLM reporting workflow may first need source accuracy, factual consistency, coverage and reviewer studies. A numerical ranking requires a different evaluation from a diagnostic model.

## Minimal validation session

Ask an owner or authorised employee to walk through one recent, non-sensitive example:

1. Which described AI features are live, piloting or only planned? What is the total organisation/team size?
2. What input enters the tool, where does it come from, and which external providers receive it?
3. Show where an output influences a decision and whether a person can reject it.
4. Who approves deployment, report release, access and model changes?
5. What went wrong recently, how was it detected, and who corrected it?
6. How could an affected person question or correct the result?

Record interview date, participant role, consent, anonymised notes and supporting artifact references. No interviews, internal observations, customer-data inspections or product benchmark runs have occurred as part of this public-source baseline.

## Consequence for Reskure

Use the verified footprint to drive the audit: system → decision → affected stakeholder → harm → control → evidence → accountable owner. The first useful feature is a defensible inventory and evidence register. The appropriate bias, privacy/security, drift and explanation checks depend on which workflows are actually deployed. No claim of missing controls or non-compliance follows from the website omitting those details.

## Public evidence register

- **S1:** [Organisation homepage](https://gbtech.in/), reviewed 24 October 2026. Self-description only. The separate M-Suite page failed to load during this review; M-Suite details above use the homepage.
- **S2:** [SMART Studio](https://gbtech.in/smart_studio.html), reviewed 24 October 2026. Advertised capabilities and audiences, not a verified installation. Its organisation target is not a current customer count.
- **S3:** [Medimine](https://gbtech.in/medimine.html), reviewed 24 October 2026. Advertised healthcare functions; impact and security claims are not independently validated here.

Completion status: both deliverables now have a source-grounded initial structure. Organisation size, actual adoption, assigned accountability and measured exposure remain open validation items.
