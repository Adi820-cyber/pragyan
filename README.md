# Reskure AI Audit

A lightweight, self-hostable toolkit for small AI teams. It audits two kinds of system. **LLM / generative assistants are the default**; tabular classifiers are supported too.

**LLM systems** (from a log of prompts and answers, as CSV or JSONL; no model or API calls needed):
- **Bias**: refusal, answer-length and quality-score gaps between groups of users (for example by language)
- **Drift**: change in what users ask and how the system answers between two periods
- **Groundedness and traceability**: how much of an answer is found in its source, figures that appear nowhere in the source, citation coverage
- **Privacy**: personal data inside prompts, answers and source text, including data the system surfaced on its own
- **Oversight**: how often a person reviewed outputs and how often they changed them

**Tabular classifiers**: group outcome and error-rate gaps, drift, SHAP explanations for supported tree models, personal-data scan.

**Both**: vendor and dependency checks (contracts, training on your data, retention, cross-border transfers, exit plans), data-subject rights handling (procedure, owner, testing, response times), and an evidence-backed DPDP / GDPR control checklist with independent review.

Findings get an owner, a due date and a reviewer sign-off. Each run is stored with its inputs, policy and library versions, and exports as a printable report. No paid APIs; runs on CPU.

Planning docs: `docs/plan/responsible-ai-toolkit-final-plan.md`, research in `docs/research/`.

## Run it locally

Backend (Python 3.13, [uv](https://docs.astral.sh/uv/)):

```powershell
cd backend
copy .env.example .env          # DEBUG=True for local use
uv sync
uv run python manage.py migrate
uv run python manage.py seed_ai_demo --password "Password123!"   # demo org, 3 users, 2 sample systems (see below)
uv run python manage.py runserver 8000
uv run python manage.py run_audit_worker                               # second terminal: executes queued audits
```

Frontend (Node 20+):

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

Demo users (all synthetic), same default password (`Password123!`):
- `admin` or `admin@hirelens.example` (Tenant Admin)
- `founder@hirelens.example` (Risk Owner / ML Lead)
- `advisor@hirelens.example` (Compliance Reviewer for Segregation-of-Duties sign-off)

Tests: `cd backend; uv run python manage.py test apps`

## Sample data

- **COMPAS (real data).** ProPublica's recidivism data for Broward County, Florida (2013-2014): the scores a deployed risk tool gave to real defendants, the real outcomes two years later, race and sex, and real screening dates. Drift compares 2013 with 2014. The seed command downloads it on first use and caches it under `backend/private_media/sample_cache`; it is not stored in this repository because redistribution terms are not stated with the data. If the download is blocked, fetch `compas-scores-two-years.csv` from github.com/propublica/compas-analysis and run `seed_ai_demo --compas-file <path>`. Names, birth dates and case numbers are dropped on load. With `--offline` a small synthetic tabular sample is used instead.
- **FinSum (synthetic LLM log).** A fictional assistant that summarises filings, with planted issues. It is generated from templates and is labelled as synthetic everywhere. Real production LLM logs that include source text, user groups and reviewer actions are not publicly available. If you have a real or public LLM log, upload it on a system's page.

The app shows a "Real public data" notice on COMPAS views and a "Sample mode" notice on synthetic ones.

## Your own model

Model files are never loaded by the server. Run the local tool in your environment and upload only the result bundle:

```powershell
python tools/reskure_audit_cli/reskure_audit.py explain --model model.joblib --data features.csv --features a,b,c --out bundle.json
python tools/reskure_audit_cli/reskure_audit.py upload --bundle bundle.json --server http://localhost:8000 --token <token> --tenant <tenant id> --model-version <id>
```

## What it does not do

- Tabular models must be binary classifiers. No image, regression or multi-class auditing; multi-class predictions are rejected with a message rather than collapsed into yes/no.
- LLM checks measure what logs can show. They do not decide whether an answer is true. Groundedness is lexical overlap with the source: it tells you which answers to read, and an answer can be wrong while reusing the source's words. Answer correctness, toxicity and hallucination beyond unsupported figures are not scored. Quality scores you supply (from reviewers or a judge model) can carry their own bias.
- Vendor and data-rights results come from what you declare. The tool cannot verify contracts, a vendor's training practices, or that a request procedure works.
- Reports show the system, model, datasets and controls as they were when the audit completed. Findings and their review history are live workflow records.
- Lists load every page of results, but nothing has been tested at more than a few hundred records.
- Results are measurements for human review under a stated policy. It does not certify fairness, safety or legal compliance.
- Thresholds are screening heuristics, not legal tests. Drift is a warning signal, not proof of worse performance.
- Personal-data detection is heuristic and can miss data or flag false positives.
- DPDP/GDPR control wording is a plain-language aid and has **not been reviewed by counsel**. DPDP provisions commence in phases; check the effective date for your situation.
- The tool cannot verify your infrastructure. Uploaded evidence is judged by a human reviewer.

## Before real customer data

The demo hardening covers authentication, tenant isolation, upload limits, private file storage and separation of duties. For a shared deployment you still need: PostgreSQL with verified row-level policies, an immutable audit-log design, HTTPS and secure cookies (set `DEBUG=False`, `SECRET_KEY`, `ALLOWED_HOSTS`), a reviewed retention and deletion process, and a security review. The legacy GRC/SecOps modules remain in the codebase but are not part of this product.
