# Q&A cheat sheet: hard judge questions

Rule: answer the question in one sentence, then add one fact. If you do not know, say so. Every answer below was checked against the code.

## Business and fit

**Who is this for?**
Startups and small firms that use AI to decide things about people, plus banks, compliance officers and external auditors. It is built for teams with no dedicated compliance staff.

**How is this different from a compliance checklist tool?**
A checklist asks if you have a policy. Reskure measures what the system did, group by group, and keeps the data fingerprints, settings and software versions. The checklist part exists too (DPDP and GDPR items), but each item needs uploaded evidence and a second person to review it.

**Does it make us compliant with DPDP or GDPR?**
No. It helps collect and organise evidence. The control wording is a plain-language aid and is marked as not reviewed by counsel. The DPDP Rules 2025 commence in phases, and the pack says it records readiness, not a current legal duty.

**What about the EU AI Act?**
Not built. It is on the roadmap as another control pack. Today the packs are DPDP and GDPR.

## Trust in the numbers

**Is the data real?**
COMPAS is real: ProPublica's public data from Broward County, Florida, 2013-2014. The FinSum LLM log and the HireLens hiring set are synthetic and labelled as sample data in the app and in the report. Real production LLM logs are not public, so we generated them.

**Why COMPAS, and why a US example for an Indian contest?**
It is the best-known public case with real scores and real outcomes, so the result is checkable by anyone. The same method works on any binary yes/no model. We do not claim it is Indian data.

**Is 0.80 a legal threshold?**
No. It echoes the four-fifths rule, which is a screening heuristic. The report and the wizard say this. All thresholds can be changed per run, and the values used are stored with the run.

**Can a check fail quietly?**
A check that crashes is shown as an error, not as a pass. Groups that are too small are shown as "insufficient evidence". We built it this way on purpose.

**Is the personal-data detection reliable?**
It is a heuristic. It checks patterns (for example Aadhaar numbers with the Verhoeff checksum) and can miss data or raise false alarms. The report says so.

**Are results repeatable?**
Yes for the checks: a fixed seed and the software versions are stored with each run.

**Does removing a feature (model v2) prove the bias is fixed?**
No. It is an example of a fix and a way to show before and after. Some gaps remain because the data carries them, and the compare view shows that.

## Honesty about the demo

**Is Cloud Security real?**
No. It is simulated. Scans run a built-in catalogue of 23 Prowler-style rules and a fixed set of ten rules fail. No call goes to AWS, Azure or GCP. The page says so. Live connectors are on the roadmap.

**Is the network tracer real?**
The tracing logic is real code (graph walk plus firewall rule matching), but it runs on a seeded sample network, not on yours.

**Is the CISO Assistant data real?**
It starts from a shipped starter baseline of frameworks, controls and risks. Until someone edits it, it is not an assessment of the organisation. A banner says this.

**Is the report digitally signed?**
No. It is frozen at the time of the audit and includes SHA-256 fingerprints of the datasets and evidence files. A report-level signature is on the roadmap.

**Does a re-audit close the finding automatically?**
No. The compare view shows what is no longer raised, but a person must review and resolve it. We chose that on purpose.

## Technical

**Where does my model go? Do you see my data?**
For tree models you can run the local CLI (`tools/reskure_audit_cli/reskure_audit.py`) on your machine. It writes a result bundle and only the bundle is uploaded. The server never loads model files. Datasets for server-side checks are uploaded as CSV.

**What models do you support?**
Tabular audits need a yes/no prediction column (multi-class is rejected, not collapsed). Server explanations cover the built-in sample models. The CLI supports scikit-learn tree ensembles for binary classification. LLM audits work from interaction logs (CSV or JSONL).

**How do you keep one customer's data from another's?**
Records are scoped to an organisation, and API calls need a login plus an organisation header. This is covered by the project's tests, but we have not had an outside security review.

**Who can approve what?**
The person who owns or submitted a finding cannot review it. The person who uploaded control evidence cannot review it. Changing a reviewed control or adding evidence voids the earlier approval.

**What is the stack?**
Django REST backend, Next.js frontend, a background worker for audit runs, pandas/numpy/scipy/scikit-learn/SHAP for checks. One script, `run-dev.ps1`, starts everything.

**Does it scale?**
Not claimed. It enforces upload and row limits and a run time limit, and it targets small teams. We have not load tested it.

## Team and next steps

**What would you build next?**
Live cloud connectors, the EU AI Act pack, single sign-on, signed reports, and a legal review of the control wording.

**Are there other team members using it at once?**
The demo has three roles (admin, ML lead as risk owner, external advisor as compliance officer). A fuller multi-user flow with more named team members is planned. Only mention it as live if you see those users in the app.
