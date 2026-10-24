# Reskure AI Audit

A lightweight, self-hostable toolkit for small AI teams. One audit run checks a tabular binary classifier for:

- **Bias**: outcome and error-rate gaps across groups you declare, with denominators and 95% intervals
- **Drift**: reference vs current data and predictions (KS and Jensen-Shannon, schema, missingness, new categories)
- **Explainability**: SHAP contributions for supported scikit-learn tree models
- **DPDP / GDPR readiness**: personal-data scan (masked) plus an evidence-backed control checklist with independent review

Findings get an owner, a due date and a reviewer sign-off. Each run is stored with its inputs, policy and library versions, and exports as a printable report. No paid APIs; runs on CPU.

Planning docs: `docs/plan/responsible-ai-toolkit-final-plan.md`, research in `docs/research/`.

## Run it locally

Backend (Python 3.13, [uv](https://docs.astral.sh/uv/)):

```powershell
cd backend
copy .env.example .env          # DEBUG=True for local use
uv sync
uv run python manage.py migrate
uv run python manage.py seed_ai_demo --password "choose-a-password"   # synthetic HireLens org + 3 users
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

Demo users (all synthetic), same password: `founder@hirelens.example` (owner), `advisor@hirelens.example` (reviewer), `admin@hirelens.example`.

Tests: `cd backend; uv run python manage.py test apps`

## Your own model

Model files are never loaded by the server. Run the local tool in your environment and upload only the result bundle:

```powershell
python tools/reskure_audit_cli/reskure_audit.py explain --model model.joblib --data features.csv --features a,b,c --out bundle.json
python tools/reskure_audit_cli/reskure_audit.py upload --bundle bundle.json --server http://localhost:8000 --token <token> --tenant <tenant id> --model-version <id>
```

## What it does not do

- Tabular binary classifiers only. No LLM, image, regression or multiclass auditing.
- Results are measurements for human review under a stated policy. It does not certify fairness, safety or legal compliance.
- Thresholds are screening heuristics, not legal tests. Drift is a warning signal, not proof of worse performance.
- Personal-data detection is heuristic and can miss data or flag false positives.
- DPDP/GDPR control wording is a plain-language aid and has **not been reviewed by counsel**. DPDP provisions commence in phases; check the effective date for your situation.
- The tool cannot verify your infrastructure. Uploaded evidence is judged by a human reviewer.

## Before real customer data

The demo hardening covers authentication, tenant isolation, upload limits, private file storage and separation of duties. For a shared deployment you still need: PostgreSQL with verified row-level policies, an immutable audit-log design, HTTPS and secure cookies (set `DEBUG=False`, `SECRET_KEY`, `ALLOWED_HOSTS`), a reviewed retention and deletion process, and a security review. The legacy GRC/SecOps modules remain in the codebase but are not part of this product.
