# Reskure (Risk + Secure)
> **Next-Generation Enterprise Governance, Risk, and Compliance (GRC) & Continuous Security Assurance Platform**

[![Python Version](https://img.shields.io/badge/python-3.13%2B-blue.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/django-5.x%2F6.x-green.svg)](https://www.djangoproject.com/)
[![Architecture](https://img.shields.io/badge/architecture-Multi--Tenant%20%7C%20RLS-orange.svg)](#architecture)
[![License Model](https://img.shields.io/badge/IP%20Model-Clean--Room%20%2F%20Permissive-purple.svg)](#licensing--clean-room-ip-guarantee)

---

## 🛡️ Executive Summary

**Reskure** is a unified GRC and SecOps orchestration system designed for high-assurance enterprises, fast-growing tech companies, and regulated industries. It bridges the gap between passive compliance documentation and active security operations by connecting cloud posture, telemetry alerts, risk registers, and automated control verification into a single system of record.

---

## 🏛️ Core Architectural Principles

### 1. Data-Layer Tenant Isolation (Isolation First)
- Tenant boundaries are enforced at the database layer using PostgreSQL Row-Level Security (RLS) and scoped query abstractions.
- Every entity carries an immutable `tenant_id` UUID.
- Foreign keys use composite references `(tenant_id, id)` to prevent any cross-tenant data referencing.
- Data isolation is strictly decoupled from application-level role logic.

### 2. Centralized Policy & Authorization Engine
- **Coarse RBAC (Role-Based Access Control)**:
  - Standard enterprise roles aligned with industry benchmarks (Vanta/Drata): `TENANT_ADMIN`, `COMPLIANCE_OFFICER`, `RISK_OWNER`, `AUDITOR`, `CONTRIBUTOR`.
  - Full support for custom enterprise roles per tenant.
- **Fine-Grained ABAC (Attribute-Based Access Control)**:
  - Dynamic condition evaluation: resource ownership, org-unit hierarchy, data classification, and lifecycle state.
- **Segregation of Duties (SoD) Rules**:
  - Declarative policy rules preventing toxic combinations (e.g., *"Requester cannot approve their own exception"*, *"Evidence uploader cannot attest to the control"*).
- **Deterministic Single Engine**:
  - All authorization decisions pass through `reskure.authorization.engine`.
  - Immutable decision logging: every access or approval evaluation is recorded in an append-only audit trail.

### 3. Risk Scoring & Quantification
- **Default**: Standard 5×5 cybersecurity matrix (`Risk Score = Likelihood × Impact`, scale 1–25).
- **Configurable**: Tenant administrators can define custom scoring algorithms, risk appetite thresholds (Low, Medium, High, Critical), and risk velocity factors.

### 4. Integration-First SecOps (No Raw Log Overhead)
- Reskure connects directly to customer SIEM, CSPM, and detection platforms (AWS Security Hub / GuardDuty, Azure Defender / Sentinel, Google Cloud SCC, and Wazuh).
- Ingests normalized findings and alerts without storing petabytes of raw high-EPS logs.

### 5. Human-in-the-Loop Incident Containment
- Default operational posture is **Track-and-Approve**: response actions (quarantine host, rotate credentials, block IP) generate structured approval requests for security team sign-off.
- Configurable **Auto-Approval**: Tenant administrators can enable policy-driven automated approvals for pre-authorized low-risk remediation runbooks.

### 6. Full Multi-Step Approval Engine
- Comprehensive workflow orchestrator supporting sequential, parallel, and quorum approvals, automated escalations, and delegation.

---

## 📜 Licensing & Clean-Room IP Guarantee

Reskure is developed under a **strict clean-room implementation policy**:
- **Zero Copyleft Contamination**: Reskure contains NO code, schemas, or assets derived from AGPL, GPL, or copyleft repositories (such as CISO-Assistant or other restrictive open-source tools).
- **Permissive Foundation**: Reskure references only permissive architectural patterns (MIT, Apache-2.0, BSD-3-Clause) and public domain standards (NIST OSCAL, CIS, MITRE ATT&CK CC0).
- **Commercial & Enterprise Safe**: Reskure is 100% proprietary-safe and never forces customers or operators to open-source derivative software.

---

## 📁 Repository Layout

```
Reskure/
├── backend/                  # Python 3.13 / Django REST Framework core
│   ├── pyproject.toml        # uv package configuration
│   ├── manage.py
│   ├── reskure/              # Django project configuration & settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   └── apps/
│       ├── core/             # Base tenant models, RLS middleware, audit logs
│       ├── authorization/    # Central Policy Engine (RBAC, ABAC, SoD, audit)
│       ├── risk/             # Risk register, 5x5 scoring matrix, formula config
│       ├── compliance/       # Frameworks, Controls, Mappings (NIST, CIS, ISO, SOC2)
│       ├── evidence/         # Evidence vault, cryptographic SHA-256 verification
│       ├── workflows/        # Full approval engine (sequential, parallel, quorum)
│       ├── secops/           # Normalized SIEM/cloud alert ingestion (AWS, Azure, GCP)
│       └── assets/           # Asset register, cloud accounts, business services
├── frontend/                 # Next.js + TypeScript dashboard & administration UI
└── docs/                     # Architecture Decision Records (ADRs) & schemas
```

---

## 🚀 Quickstart (Backend)

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py runserver
```
