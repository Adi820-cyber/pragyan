import { Risk, Control, SecurityAlert, ApprovalRequest, AccessDecisionLog } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Demo fallback data matching seeded database
export const DEMO_TENANT_ID = "3b4f9812-70b8-4c31-9ff4-938b8cae0001";

const DEMO_RISKS: Risk[] = [
  {
    id: "rsk-001",
    identifier: "RSK-001",
    title: "Unencrypted Database Backup in S3",
    description: "Production database snapshots discovered without AWS KMS customer managed key encryption.",
    category: "CYBERSECURITY",
    status: "MITIGATION_PLANNED",
    inherent_likelihood: 4,
    inherent_impact: 5,
    inherent_score: 20,
    inherent_severity: "CRITICAL",
    residual_likelihood: 2,
    residual_impact: 2,
    residual_score: 4,
    residual_severity: "LOW",
    owner_name: "Marcus Wright",
    requester_name: "Kyle Reese",
    org_unit_name: "Information Security & Trust",
    treatment_strategy: "MITIGATE",
    treatment_plan: "Enforce S3 bucket policy requiring aws:kms encryption header on all PutObject calls.",
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
  {
    id: "rsk-002",
    identifier: "RSK-002",
    title: "Legacy API Key with Overprivileged IAM Permissions",
    description: "Payment microservice relies on hardcoded IAM credentials with AdministratorAccess.",
    category: "CYBERSECURITY",
    status: "IDENTIFIED",
    inherent_likelihood: 5,
    inherent_impact: 4,
    inherent_score: 20,
    inherent_severity: "CRITICAL",
    residual_likelihood: 1,
    residual_impact: 4,
    residual_score: 4,
    residual_severity: "LOW",
    owner_name: "Kyle Reese",
    requester_name: "Kyle Reese",
    org_unit_name: "Core Engineering",
    treatment_strategy: "MITIGATE",
    treatment_plan: "Migrate workload to AWS IAM Roles for Service Accounts (IRSA).",
    created_at: new Date(Date.now() - 3600000 * 24 * 4).toISOString(),
  },
  {
    id: "rsk-003",
    identifier: "RSK-003",
    title: "Missing Multi-Factor Authentication on Production Jumpbox",
    description: "Bastion SSH access allowed using single-factor private keys without hardware token MFA.",
    category: "COMPLIANCE",
    status: "IN_PROGRESS",
    inherent_likelihood: 4,
    inherent_impact: 3,
    inherent_score: 12,
    inherent_severity: "MEDIUM",
    residual_likelihood: 1,
    residual_impact: 3,
    residual_score: 3,
    residual_severity: "LOW",
    owner_name: "Sarah Connor (CISO)",
    requester_name: "Marcus Wright",
    org_unit_name: "Information Security & Trust",
    treatment_strategy: "MITIGATE",
    treatment_plan: "Integrate Okta verify pam module for all bastion instances.",
    created_at: new Date(Date.now() - 3600000 * 24 * 6).toISOString(),
  },
  {
    id: "rsk-004",
    identifier: "RSK-004",
    title: "Third-Party SaaS Data Processing Agreement Gap",
    description: "Analytics vendor lacks updated EU standard contractual clauses under GDPR.",
    category: "DATA_PRIVACY",
    status: "ACCEPTED",
    inherent_likelihood: 2,
    inherent_impact: 4,
    inherent_score: 8,
    inherent_severity: "MEDIUM",
    residual_likelihood: 2,
    residual_impact: 4,
    residual_score: 8,
    residual_severity: "MEDIUM",
    owner_name: "Sarah Connor (CISO)",
    requester_name: "Sarah Connor (CISO)",
    org_unit_name: "Information Security & Trust",
    treatment_strategy: "ACCEPT",
    treatment_plan: "Vendor provided indemnity and commitment to execute updated DPA by Q4.",
    created_at: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
  },
  {
    id: "rsk-005",
    identifier: "RSK-005",
    title: "Disaster Recovery Failover Drill Overdue",
    description: "Semi-annual hot-standby failover test has not been executed within mandatory 180-day window.",
    category: "OPERATIONAL",
    status: "IDENTIFIED",
    inherent_likelihood: 3,
    inherent_impact: 4,
    inherent_score: 12,
    inherent_severity: "MEDIUM",
    residual_likelihood: 1,
    residual_impact: 4,
    residual_score: 4,
    residual_severity: "LOW",
    owner_name: "Kyle Reese",
    requester_name: "Marcus Wright",
    org_unit_name: "Core Engineering",
    treatment_strategy: "MITIGATE",
    treatment_plan: "Schedule tabletop and automated failover drill for next maintenance window.",
    created_at: new Date(Date.now() - 3600000 * 24 * 12).toISOString(),
  },
];

const DEMO_CONTROLS: Control[] = [
  { id: "c-1", domain: "Govern (GV)", code: "GV.OC-01", title: "Organizational Context", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Organizational context informs cybersecurity strategy.", implementation_guidance: "Annual board review and charter approval." },
  { id: "c-2", domain: "Govern (GV)", code: "GV.RM-01", title: "Risk Management Strategy", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Risk priorities and risk tolerance are established.", implementation_guidance: "Documented in RiskMatrixConfig with 5x5 multiplication." },
  { id: "c-3", domain: "Identify (ID)", code: "ID.AM-01", title: "Asset Inventory", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Inventories of hardware, software, services are maintained.", implementation_guidance: "Continuous sync from AWS Security Hub and cloud accounts." },
  { id: "c-4", domain: "Identify (ID)", code: "ID.RA-01", title: "Risk Assessment", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Vulnerabilities in assets are identified and validated.", implementation_guidance: "Reskure risk scoring and automated vulnerability ingestion." },
  { id: "c-5", domain: "Protect (PR)", code: "PR.AA-01", title: "Identity & Access Control", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IN_PROGRESS", description: "Identities and credentials for users and workloads are managed.", implementation_guidance: "Enforce SSO/MFA and least privilege RBAC." },
  { id: "c-6", domain: "Protect (PR)", code: "PR.DS-01", title: "Data Security", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IN_PROGRESS", description: "Data at rest and in transit are protected.", implementation_guidance: "Enforce TLS 1.3 and KMS CMK encryption." },
  { id: "c-7", domain: "Detect (DE)", code: "DE.CM-01", title: "Continuous Monitoring", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Assets are monitored to identify anomalous events.", implementation_guidance: "Integration with AWS GuardDuty and Wazuh." },
  { id: "c-8", domain: "Respond (RS)", code: "RS.MA-01", title: "Incident Management", framework_code: "NIST_CSF_2.0", framework_name: "NIST CSF 2.0", status: "IMPLEMENTED", description: "Incident response plans are executed in coordination.", implementation_guidance: "Track-and-approve containment actions via Reskure workflows." },
];

const DEMO_ALERTS: SecurityAlert[] = [
  {
    id: "alt-001",
    source_name: "AWS Security Hub (Prod)",
    external_alert_id: "arn:aws:securityhub:us-east-1:123456789012:finding/1a2b3c",
    title: "S3.1 S3 Block Public Access setting should be enabled",
    description: "The S3 bucket 'acme-payment-receipts' allows public READ access via bucket policy.",
    severity: "CRITICAL",
    status: "NEW",
    ingested_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "alt-002",
    source_name: "AWS GuardDuty",
    external_alert_id: "gd-finding-8971032",
    title: "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration",
    description: "EC2 instance role credentials were used from external IP 198.51.100.44 outside AWS cloud.",
    severity: "CRITICAL",
    status: "NEW",
    ingested_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: "alt-003",
    source_name: "Microsoft Defender for Cloud",
    external_alert_id: "az-def-554109",
    title: "SQL Server Vulnerable to Brute Force Authentication",
    description: "More than 50 failed login attempts detected within 5 minutes against Azure SQL Database.",
    severity: "HIGH",
    status: "TRIAGED",
    ingested_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "alt-004",
    source_name: "Wazuh SIEM / XDR",
    external_alert_id: "wazuh-alert-991204",
    title: "Root privilege escalation detected via setuid binary",
    description: "User 'appservice' invoked /usr/bin/pkexec with suspicious memory payload.",
    severity: "HIGH",
    status: "NEW",
    ingested_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
  },
];

const DEMO_APPROVALS: ApprovalRequest[] = [
  {
    id: "appr-001",
    title: "Containment Action: ISOLATE_HOST for Alert UnauthorizedAccess:IAMUser",
    entity_type: "SECOPS_CONTAINMENT",
    entity_id: "alt-002",
    status: "PENDING",
    requester_name: "Marcus Wright",
    is_auto_approved: false,
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "appr-002",
    title: "Risk Acceptance: Third-Party SaaS Data Processing Agreement Gap",
    entity_type: "RISK_ACCEPTANCE",
    entity_id: "rsk-004",
    status: "APPROVED",
    requester_name: "Sarah Connor (CISO)",
    is_auto_approved: false,
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
  },
];

export const ReskureApi = {
  async fetchWithFallback<T>(endpoint: string, fallback: T, tenantId: string = DEMO_TENANT_ID): Promise<T> {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { "X-Tenant-ID": tenantId },
        cache: "no-store",
      });
      if (!res.ok) return fallback;
      const json = await res.json();
      return (json.results ? json.results : json) as T;
    } catch {
      return fallback;
    }
  },

  async getRisks(): Promise<Risk[]> {
    return this.fetchWithFallback<Risk[]>("/risks/", DEMO_RISKS);
  },

  async getRiskHeatmap(): Promise<any> {
    const fallback = {
      total_risks: DEMO_RISKS.length,
      critical_count: DEMO_RISKS.filter((r) => r.inherent_severity === "CRITICAL").length,
      high_count: DEMO_RISKS.filter((r) => r.inherent_severity === "HIGH").length,
      medium_count: DEMO_RISKS.filter((r) => r.inherent_severity === "MEDIUM").length,
      low_count: DEMO_RISKS.filter((r) => r.inherent_severity === "LOW").length,
      matrix_5x5: [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 1, 0, 1],
        [0, 0, 0, 1, 0],
      ],
    };
    return this.fetchWithFallback<any>("/risks/heatmap_summary/", fallback);
  },

  async getControls(): Promise<Control[]> {
    return this.fetchWithFallback<Control[]>("/controls/", DEMO_CONTROLS);
  },

  async getCompliancePosture(): Promise<{
    total_controls: number;
    implemented: number;
    in_progress: number;
    not_started: number;
    compliance_posture_percentage: number;
  }> {
    const total = DEMO_CONTROLS.length;
    const implemented = DEMO_CONTROLS.filter((c) => c.status === "IMPLEMENTED").length;
    const in_progress = DEMO_CONTROLS.filter((c) => c.status === "IN_PROGRESS").length;
    const not_started = DEMO_CONTROLS.filter((c) => c.status === "NOT_STARTED").length;
    const fallback = {
      total_controls: total,
      implemented,
      in_progress,
      not_started,
      compliance_posture_percentage: Math.round((implemented / total) * 100),
    };
    return this.fetchWithFallback("/controls/posture_summary/", fallback);
  },

  async getAlerts(): Promise<SecurityAlert[]> {
    return this.fetchWithFallback<SecurityAlert[]>("/security-alerts/", DEMO_ALERTS);
  },

  async getApprovals(): Promise<ApprovalRequest[]> {
    return this.fetchWithFallback<ApprovalRequest[]>("/approval-requests/", DEMO_APPROVALS);
  },
};
