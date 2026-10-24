# Reskure AI Audit: judges' pitch and walkthrough

PRAGYAN 2K26, Track 4-05: Responsible AI Governance and Compliance Toolkit for Small Organisations.

How to use this file. Read Part 1 first. Pick the length that fits your slot: 60 seconds (Part 2), 3 minutes (Part 3) or 7 minutes (Part 4). Part 5 is the page-by-page reference. Part 6 is the honest list of limits. Hard questions are in `QA.md`. Pre-demo steps are in `DEMO-CHECKLIST.md`.

Every claim here was checked against the code in this repo (branch `integration/all-features`). Where something is not built, this file says so.

---

## Part 1. The story in plain words

**The problem.** Companies now let AI decide who gets hired, who gets a loan, who gets bail, and what an LLM assistant tells a customer. Most small companies cannot show that these systems are fair, explainable, private or compliant. Laws now ask for that proof: India's DPDP Act 2023 (with the DPDP Rules 2025), the EU GDPR, and the EU AI Act. A startup with no compliance team has no cheap way to produce it.

**The solution, in one sentence.** Reskure AI Audit runs fair-treatment, drift, explainability, privacy and governance checks on an AI system's own data, turns the results into findings with an owner and a reviewer, and produces a report that shows the evidence behind every answer.

**Who buys it.** Startups and SMEs that ship AI. Banks and fintechs that need to answer their regulator. Compliance officers who need evidence, not a checklist. External auditors who need a record they can re-check.

**The key idea.** Most compliance tools ask "do you have a policy?" Reskure measures the system. It looks at what the model actually did, group by group, and then asks a person to own the fix and a different person to approve it.

---

## Part 2. The 60-second pitch

> Companies are putting AI in charge of hiring, credit and even bail. Almost none can prove it is fair, private or explainable. Indian and EU law now expects that proof.
>
> Reskure AI Audit is a lightweight audit toolkit for small teams. You give it your model's predictions or your LLM's logs. It checks bias, drift, explainability, privacy and vendor risk. It explains each result in plain words.
>
> Every problem becomes a finding with an owner. A different person must review the fix. The report records the data fingerprints and the checks behind each result, and maps your evidence to DPDP and GDPR controls.
>
> We demonstrate it on the real COMPAS bail-risk data from ProPublica. It works on tabular models and on LLM systems. It runs on a small team's laptop, and a local tool keeps your model file on your own machine.

Say it slowly. The last line is your answer to "what about our data?".

---

## Part 3. The 3-minute demo script

Setup: three browser windows (normal, private, second profile). Window 1: `priya.nair@hirelens.example` (Priya Nair, compliance officer) on the Overview page. Window 2: `rohan.mehta@hirelens.example` (Rohan Mehta, risk owner) on Findings & Actions. Window 3 (optional): `ananya.iyer@hirelens.example` (Ananya Iyer, auditor). `admin@hirelens.example` is only for setup. All passwords `Demo-Pass-2026`. The team is synthetic. See `DEMO-CHECKLIST.md`.

| Time | Who | Do | Say |
|---|---|---|---|
| 0:00 | Priya | Overview page | "This is the home screen for a compliance officer. Open findings, unassigned work, items waiting for my review, control gaps, high-risk vendors and open data requests. Every number links to its page." |
| 0:20 | Priya | AI Systems, open COMPAS | "This is real data. ProPublica published scores a real bail-risk tool gave to real defendants in Florida, plus what happened two years later. Names and birth dates are removed on load." |
| 0:40 | Priya | Audits, New audit, pick COMPAS model `v1`, accept the pre-filled steps, Run | "Five steps. I pick the data, the prediction column, the real outcome and the groups to compare. Reskure never guesses sensitive columns for me." |
| 1:00 | Priya | Open a completed COMPAS audit, Bias tab | "It compares how often each group gets the good outcome. A flag means the gap is above the limit shown on screen. These are screening limits, not legal tests." |
| 1:30 | Priya | Findings & Actions, open an unassigned bias finding, Assign to Rohan with a due date and priority | "Each problem becomes a finding. I assign it to the person who will fix it. Every step lands on the timeline." |
| 1:50 | Rohan | Window 2, open the same finding, Start, attach an evidence link, Submit for review with a note | "Rohan does the fix and attaches evidence. He cannot approve his own work: the approve button is not his, and the server returns a refusal if he tries." |
| 2:10 | Ananya | Window 3 (optional), add a comment | "Ananya is an auditor. She can read and comment, nothing more." |
| 2:20 | Priya | Window 1, refresh, Approve (resolve) with a comment | "A different person approves. Nobody marks their own homework." |
| 2:35 | Rohan, then Priya | Reports: Rohan generates a report from the completed COMPAS audit and submits it; Priya approves it | "The report is frozen and versioned with a SHA-256 fingerprint we can re-check. The person who generated it cannot approve it." |
| 2:55 | Priya | Close | "Fair, private, explainable, with proof. For small teams." |

If time is tight, skip Ananya and the report approval, and say each in one sentence. The seed already leaves one finding in each state (in progress, overdue, ready for review, closed) so you can show the timeline without doing every step live.

---

## Part 4. The 7-minute full tour

Follow the sidebar order in Part 5. Suggested split:

| Minutes | Pages | Focus |
|---|---|---|
| 0:00-0:45 | Part 1 story, Overview | The problem and the home screen |
| 0:45-1:30 | CISO Assistant | Broader GRC baseline, framework crosswalks |
| 1:30-2:15 | AI Systems | Registering a system, owner, reviewer, jurisdictions |
| 2:15-4:30 | Audits | The core. Run the COMPAS audit and read the Bias tab |
| 4:30-5:00 | Packet Traversal and Cloud Security | Say quickly, they are simulated (label them out loud) |
| 5:00-6:00 | Findings & Actions | Assign, submit, review by a different person |
| 6:00-6:40 | Privacy & Controls | DPDP and GDPR checklists with evidence |
| 6:40-7:00 | Reports | Frozen report, compare two runs, download |

Be honest about the simulated pages. Judges trust a team that labels its own demo data.

---

## Part 5. Page-by-page walkthrough (sidebar order)

The sidebar in the code lists: Overview, CISO Assistant, AI Systems, Cloud Security, Audits, Packet Traversal, Findings & Actions, Privacy & Controls, Reports. This file uses the order Audits, Packet Traversal, Cloud Security because it tells the story better. When you click through live, follow the real sidebar order.

Real versus simulated is marked on every page. Short key:

- REAL = computed from data by the code.
- SAMPLE = data is synthetic but the checks are real. The app labels it.
- SIMULATED = the output is produced from fixed rules, no live system is contacted.

### 5.1 Overview

**What you see.** Five counters: AI systems, open findings, awaiting review, overdue, control gaps. Below them, one panel per AI system.

**What happens behind it.** The page reads the AI audit records for your organisation only (each organisation's data is isolated). Counts come from the findings and control tables.

**Demo.** Just point at it. Say: "A compliance officer opens this and knows in ten seconds what needs attention."

**Real or not.** REAL counts over whatever data is loaded. On a fresh demo the counters reflect the seeded sample systems, and findings stay at zero until an audit has been run.

### 5.2 CISO Assistant

**What you see.** A general security-and-compliance workspace with tabs: overview, frameworks, crosswalks, risk matrix, gaps. A banner says it is the "starter baseline".

**What happens behind it.** A catalogue of six frameworks is shipped with the product: ISO/IEC 27001:2022, NIST CSF 2.0, SOC 2, CIS Controls v8, a DPDP and GDPR set, and ISO/IEC 42001 (AI management). A crosswalk lets one piece of evidence count toward several frameworks ("assess once, comply with many"). The risk matrix is a 5x5 grid. It follows the open-source CISO Assistant design.

**Demo.** Open the Crosswalks tab. Say: "One control, many frameworks. Evidence you collect once helps with several audits."

**Real or not.** BASELINE. Until a user changes something, the statuses and risks shown are the shipped starter data, not an assessment of the organisation. The app says this in a banner. Do not present these numbers as the company's real posture.

### 5.3 AI Systems

**What you see.** A list of registered AI systems with owner and reviewer. A form to register a new one. If none exist, two buttons: "Load the LLM sample (FinSum)" and "Load a real-data example (COMPAS)". Inside a system: model versions, datasets, vendors, data-rights processes, settings.

**What happens behind it.** A system record holds its purpose, the decision it affects, its type (tabular classifier or LLM), an owner, a reviewer, and which laws apply (DPDP checklist, GDPR checklist). Datasets are uploaded as CSV. Each upload is hashed (SHA-256) and scanned for personal-data patterns, including Aadhaar numbers (checked with the Verhoeff checksum). Model versions can be predictions-only, a built-in sample model, or results from the local CLI tool.

**Demo.** Open COMPAS. Say: "Each system has a named owner and a different reviewer. That is set up front, before any audit."

**Real or not.**
- COMPAS: REAL. ProPublica's two-year recidivism data for Broward County, Florida, 2013-2014. The scores are the real tool's scores. Reference data is 2013, current data is 2014, so the drift is real time, not injected. The file is downloaded on demand and is not stored in the repo. If the download fails, the seed falls back to the synthetic HireLens sample.
- COMPAS model versions: `tool` is the real deployed tool (predictions only, no explanations). `v1` and `v2` are small models we trained on the data. `v1` uses sex and prior arrests. `v2` drops them.
- FinSum: SAMPLE. A synthetic LLM interaction log, labelled as such, because real production LLM logs are not public.
- HireLens: SAMPLE. A small synthetic hiring scenario used offline and in tests. It appears only if the real-data download is unavailable or `-Offline` is used.

### 5.4 Audits

Two screens: the list with a "New audit" button, and the results of a run.

**What you see.** The list shows past runs. "New audit" opens a five-step wizard: Choose inputs, Map columns, Check the data, Set the policy, Run. After the run, a results page with tabs: Summary and one tab per check area, plus a panel showing exactly how the run was configured.

**What happens behind it.** A background worker runs the checks. A failed check is shown as an error, never as a pass. Check areas:

- Bias (tabular): demographic parity difference, selection-rate ratio, equalized odds, with confidence intervals (bootstrap) and a minimum group size. Groups too small are reported as "insufficient evidence", not as fine.
- Bias (LLM): refusal-rate gap, answer-length gap, quality-score gap between groups.
- Drift: compares reference and current data using KS and Jensen-Shannon distances, plus missing values, new categories, schema change, prediction shift and performance drop.
- Explainability (tabular): SHAP feature importance for the built-in sample models, plus a proxy screen that flags a feature strongly tied to a sensitive group.
- Grounding (LLM): how much of an answer is found in its source, figures that appear in neither source nor prompt, and citation coverage.
- Privacy: personal-data detection in columns and in LLM text, data minimisation, retention.
- Governance: vendor dependencies (contract, training on your data, exit plan), data-rights processes (access, erasure and so on), and human oversight for LLMs.

Plain-language definitions for the judges:

- Demographic parity difference: "Does one group get the good outcome much more often than another?"
- Selection-rate ratio (the "ratio" form of demographic parity): "The lowest group's good-outcome rate divided by the highest group's. Below 0.80 gets flagged. 0.80 echoes the four-fifths rule, a screening heuristic, not a legal test."
- Equalized odds: "Does the model make mistakes at the same rate for every group?" It needs the real outcome column.

Every threshold is shown, can be changed in step four, and is saved with the run along with a plain statement that these are screening limits.

**Demo.** Click New audit, choose COMPAS and `v1`. The wizard pre-fills columns from the stored mapping for sample data. Walk through the steps, then Run. Say: "I decide what counts as a group. The tool never infers race or gender on its own."

**Real or not.** The checks are REAL, deterministic code (numpy, pandas, scipy, scikit-learn, SHAP). Runs are repeatable: a fixed seed is stored. Personal-data detection is heuristic and can miss data or raise false alarms. The report says so. Explainability in the server only works for the built-in sample models, or for a result bundle produced by the local CLI. The `tool` version has none.

Not verified in this write-up: exact run time and the exact numbers COMPAS produces (the reference app was not reachable when this was written, and I did not start new runs on it). Run it once before presenting and read the numbers off the screen.

### 5.5 Packet Traversal (called "Network paths" in the page title)

**What you see.** A network map of devices and cables, plus a trace form: pick a source and destination port, a protocol and port number, and trace. Results show each hop, where a firewall rule blocks the packet, and how many hops are unencrypted. There are "what if" scenarios, for example "What if the backbone trunk is cut?".

**What happens behind it.** The network is a graph. Ports are nodes and cables, patch-panel pass-throughs and forwarding inside a device are edges. The trace walks the graph (up to 25 hops) and applies firewall rules, including port ranges like `22,8000-9000`. Nothing on a real network is touched.

**Demo.** Run a trace across the sample network, then run the "cut trunk" scenario. Say: "This shows where data to your AI service travels, where it could be blocked, and where it travels unencrypted."

**Real or not.** SIMULATION over a seeded sample topology (edge router, firewall, core switch, patch panel, switches, Kubernetes AI gateway, inference hosts, vector database). The tracing logic is real code. The network is not your network. Loading the sample is an explicit, admin-only action and is off when demo seeding is disabled.

### 5.6 Cloud Security

**What you see.** A dashboard of cloud accounts (AWS, Azure, GCP), scan history, a compliance score, findings by severity and rule details. A banner says results are simulated.

**What happens behind it.** A built-in catalogue of 23 Prowler-style rules (for example "root account has MFA", "S3 bucket public access"). A scan filters the catalogue by cloud provider and scan type. The outcome per rule comes from a fixed list of ten rules marked as failures, so the same accounts give the same result every time.

**Demo.** Run a scan on a sample account. Say: "This is how cloud findings would flow into the same findings board. Today it is a simulation. No cloud account is contacted."

**Real or not.** SIMULATED. No AWS, Azure or GCP call is made. Pass and fail come from a hard-coded list. The rule text and framework references (CIS, SOC 2, ISO 27001, PCI-DSS) are real descriptions of real checks. Live connectors are on the roadmap, not built.

### 5.7 Findings & Actions

**What you see.** A board of findings filtered by status: open, in remediation, awaiting review, risk accepted, resolved. Each finding shows severity, owner, due date, a plain-language explanation and a suggested next step.

**What happens behind it.** An audit creates a finding for each group of flagged results. The owner starts as the system owner. Allowed moves:

- Owner: start remediation, then submit with a comment saying what changed.
- Reviewer: accept the risk, resolve, or send back, always with a comment.
- Every move is written to an event history with who and when.

Separation of duties is enforced in the server: the person who owns or submitted a finding cannot review it. A finding can also be re-assigned (owner, due date, note).

**Demo.** Open a bias finding. Assign it to the ML lead with a due date. Submit with a comment. Then switch to the advisor and resolve it. Try to resolve it as the owner and show the block. Say: "Nobody marks their own homework."

**Real or not.** REAL workflow, synthetic people. Demo team: Priya Nair (compliance officer: assigns and approves), Rohan Mehta (risk owner: fixes, attaches evidence, submits), Ananya Iyer (auditor: reads and comments only), admin (tenant admin: setup). The `seed_demo_team` command puts four real audit findings into different states (in progress, overdue, ready for review, closed) with a timeline; the rest stay unassigned. Checked on this branch: Rohan gets a 403 when he tries to approve, Ananya gets a 403 when she tries to assign.

### 5.8 Privacy & Controls

**What you see.** Two checklists per system when jurisdictions are selected: 11 DPDP items and 14 GDPR items. Each item has a question, the requirement, the evidence to supply, and a state: needs evidence, evidence supplied, reviewed, gap identified, not applicable.

**What happens behind it.** Evidence files are uploaded and fingerprinted (SHA-256). A reviewer approves with a comment. The reviewer cannot be the person who uploaded the evidence. Editing a reviewed control or uploading new evidence voids the earlier approval, so a sign-off always refers to the current record.

**Demo.** Open FinSum. Show a control with evidence and a reviewer note, and one gap. Say: "The checklist is only done when a second person has looked at real evidence."

**Real or not.** REAL workflow, SAMPLE content. Seeded evidence files are placeholder text, labelled as sample. Four controls are deliberately left without evidence so the demo shows gaps. The control wording is a plain-language aid from the official texts and is marked "not reviewed by counsel, not legal advice". The DPDP Rules 2025 commence in phases, so the pack states it records readiness, not a current legal duty. The COMPAS system has no jurisdictions set, so it has no DPDP/GDPR checklist by default. Use FinSum to show controls, or tick the jurisdictions in the system settings before the demo (not tested here).

### 5.9 Reports

**What you see.** A list of completed runs. Open one to see the report in a frame, with buttons: Print or save as PDF, Download JSON, Download HTML. A panel lets you compare with another run of the same system: findings no longer raised, still raised, and newly raised.

**What happens behind it.** When a run completes, it stores a snapshot of the system, model, datasets and controls as they were then. Reports read the snapshot, so later edits cannot rewrite a historical report. The report includes coverage per check area, every result with its value, threshold and support count, findings with their history, dataset SHA-256 hashes, evidence hashes (first 12 characters shown), control status, vendors, data rights, the configuration, software versions and a limitations list.

**Demo.** Open a report, scroll to the dataset fingerprints, then use Compare to show the effect of a fix. Say: "A reviewer can check that the data in front of them is the data we audited."

**Versioned reports.** From a completed audit, a user can generate a frozen report version (v1, v2, ...). It moves draft, in review, approved. The approver must be a different person from whoever generated or submitted it (enforced in the server). Each version stores a SHA-256 fingerprint of its snapshot; "Verify" recomputes it and checks it against the stored measurements. Exports: HTML and Markdown.

**Real or not.** REAL. Important limit: the report is NOT cryptographically signed. The tamper-evidence is the frozen snapshot, its SHA-256 fingerprint, and the SHA-256 hashes of datasets and evidence. Do not say "digitally signed". Say "frozen and fingerprinted". Compare shows "no longer raised" but does not auto-close the finding, by design.

---

## Part 6. The "wow" story: from bias to a documented fix

Use this as the centre of the 3-minute and 7-minute versions.

1. Open AI Systems, COMPAS. "This is the real COMPAS data. It is the case ProPublica reported on."
2. Audits, New audit. Choose model `v1`, groups race and sex, prediction column `pred_v1`, outcome column `no_two_year_recid`, favourable value 1 (these are pre-filled). Run.
3. Open the Bias tab and read what the screen shows. Explain in one sentence each: the outcome gap (do groups get the good result equally?), the ratio (lowest divided by highest, below 0.80 is flagged) and equalized odds (are mistakes spread equally?). Read the actual numbers off the screen. ProPublica's published finding was that Black defendants were wrongly labelled high risk more often. Your own screen should show a group gap. If it does not, say what it shows.
4. Findings & Actions. As Priya, open the bias finding and assign it to Rohan with a due date. As Rohan, start remediation, attach evidence and submit with a comment. As Priya, resolve or send back.
5. The fix. COMPAS model `v2` was retrained without sex and prior arrests. Run a second audit on `v2` with the same data.
6. Reports, open the `v1` run, use Compare against the `v2` run. Show which findings are no longer raised and which remain. Say: "Some gaps stay, because the data carries them. We show that too."
7. Controls and report. Open the report. Show data fingerprints, the frozen snapshot, and the control checklist. For DPDP/GDPR mapping, show FinSum, or switch on jurisdictions for COMPAS in settings.

Caveats to say out loud: the audit is a screening tool, the thresholds are defaults you can change, and "removing a column" is an example fix, not a promise that bias is gone.

What is not in this story: automatic closing of a finding by a re-audit, and a digital signature on the report. Neither exists.

---

## Part 7. What makes it different

- LLM-first plus tabular. One toolkit checks LLM logs (refusals, answer length, grounding, citations, personal data in prompts, human oversight) and classic tabular models.
- Evidence, not a checklist. Results come from measurements with confidence intervals and a stated minimum evidence level. Weak evidence is reported as "insufficient evidence", and a broken check shows as an error, never as a pass.
- Tenant isolation. Each organisation's data is separate and every API call needs an organisation header and login.
- Separation of duties. Owners cannot review their own findings. Uploaders cannot review their own evidence. Edits void earlier sign-offs.
- Local CLI. `tools/reskure_audit_cli/reskure_audit.py` runs SHAP on your own scikit-learn tree model on your machine and writes a result bundle. Only the bundle is uploaded. The server never loads model files.
- Honest limits. Screening thresholds are labelled as such. Sample data is labelled. Simulated pages say they are simulated.

### Roadmap (not built today)

- Live cloud connectors for AWS, Azure and GCP.
- More regulations, starting with the EU AI Act, as new control packs.
- Single sign-on (SSO).
- Cryptographically signed reports.
- Auto-reopening or closing findings from a re-audit.
- Legal review of the control wording.

---

## Part 8. Honest limitations

- Cloud Security is simulated. Packet Traversal runs on a sample network.
- The CISO Assistant shows a shipped starter baseline until edited.
- FinSum and HireLens are synthetic. COMPAS is real, but it is a US example from 2013-2014 and not Indian data.
- The report is frozen and hash-fingerprinted but not digitally signed.
- The demo team (Priya, Rohan, Ananya) and the vendor and data-request registers are synthetic seed data.
- Bias thresholds are screening defaults, not legal tests. Passing them does not prove compliance.
- Past outcomes can themselves carry historical bias (the wizard warns about this).
- Personal-data detection is heuristic.
- The DPDP and GDPR control wording has not been reviewed by a lawyer.
- Server-side explanations cover built-in sample models and CLI bundles. Arbitrary customer models are not loaded by the server.
- Tabular audits need a yes/no prediction column. Multi-class results are rejected by the wizard, not silently collapsed.
- The product has a demo-data seed switch for local use. It is not a production deployment guide.
- Full accessibility (WCAG) conformance has not been validated with assistive technology.
