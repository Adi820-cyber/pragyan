export type TenantStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertSeverity = "INFORMATIONAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ControlStatus = "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "EXEMPT" | "NOT_APPLICABLE";
export type SystemRole = "TENANT_ADMIN" | "COMPLIANCE_OFFICER" | "RISK_OWNER" | "AUDITOR" | "CONTRIBUTOR";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  region: string;
}

export interface Risk {
  id: string;
  identifier: string;
  title: string;
  description: string;
  category: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  inherent_score: number;
  inherent_severity: RiskSeverity;
  residual_likelihood: number;
  residual_impact: number;
  residual_score: number;
  residual_severity: RiskSeverity;
  owner_name?: string;
  requester_name?: string;
  org_unit_name?: string;
  treatment_strategy: string;
  treatment_plan: string;
  created_at: string;
}

export interface Control {
  id: string;
  domain: string;
  code: string;
  title: string;
  description: string;
  framework_code: string;
  framework_name: string;
  status: ControlStatus;
  implementation_guidance: string;
}

export interface SecurityAlert {
  id: string;
  source_name: string;
  external_alert_id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: string;
  ingested_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_normalized_payload?: Record<string, any>;
}

export interface ContainmentAction {
  id: string;
  action_type: string;
  target_identifier: string;
  status: string;
  auto_approval_eligible: boolean;
  requested_by_name?: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  entity_type: string;
  entity_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requester_name?: string;
  is_auto_approved: boolean;
  created_at: string;
}

export interface AccessDecisionLog {
  id: string;
  actor_email: string;
  permission: string;
  resource_type: string;
  resource_id: string;
  decision: "ALLOW" | "DENY";
  reason: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Responsible AI audit
// ---------------------------------------------------------------------------
export type Category = "bias" | "drift" | "explainability" | "grounding" | "privacy" | "governance";
export type SystemType = "llm" | "tabular";
export type ResultState = "no_alert" | "review_required" | "insufficient_evidence" | "not_applicable" | "error";
export type CoverageStatus = "assessed" | "review_required" | "not_assessed" | "error";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type FindingStatus = "open" | "in_remediation" | "submitted" | "accepted" | "resolved";

export interface Membership {
  membership_id: string;
  tenant_id: string;
  tenant_name: string;
  role: string;
}

export interface Me {
  username: string;
  email: string;
  full_name: string;
  memberships: Membership[];
  active_membership: Membership | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Paged<T> {
  count: number;
  results: T[];
}

export interface AISystem {
  id: string;
  name: string;
  purpose: string;
  decision_affected: string;
  intended_population: string;
  owner: string | null;
  owner_name: string | null;
  reviewer: string | null;
  reviewer_name: string | null;
  jurisdictions: string[];
  automated_decision: boolean;
  processes_children_data: boolean;
  is_significant_data_fiduciary: boolean;
  system_type: SystemType;
  requires_citations: boolean;
  status: string;
  latest_run: { id: string; status: RunStatus; finished_at: string | null; model_version: string } | null;
  open_findings: number;
}

export interface ModelVersion {
  id: string;
  system: string;
  system_name: string;
  version_label: string;
  source: "server_sample" | "local_bundle" | "predictions_only" | "llm_hosted" | "llm_self_hosted";
  sample_key: string;
  model_type: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  feature_columns: string[];
  favourable_label: string;
  notes: string;
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  kind: "continuous" | "discrete" | "categorical";
  n_unique: number;
  missing_share: number;
}

export interface PiiFinding {
  column: string;
  kind: string;
  label: string;
  confidence: "detected" | "likely";
  match_count: number;
  match_share: number;
  masked_samples: string[];
  basis: string;
}

export interface Dataset {
  id: string;
  system: string;
  role: "reference" | "current";
  name: string;
  original_filename: string;
  sha256: string;
  row_count: number;
  column_schema: ColumnInfo[];
  pii_scan: { findings?: PiiFinding[] };
  period_start: string | null;
  period_end: string | null;
  is_sample: boolean;
  is_real_data: boolean;
  source_note: string;
  created_at: string;
  suggested_config: (Partial<RunConfig> & { by_version?: Record<string, Partial<RunConfig>> }) | null;
}

export interface RunConfig {
  prediction_column?: string;
  prompt_column?: string | null;
  output_column?: string | null;
  context_column?: string | null;
  score_column?: string | null;
  citations_column?: string | null;
  human_reviewed_column?: string | null;
  human_override_column?: string | null;
  require_citations?: boolean;
  system_type?: SystemType;
  label_column?: string | null;
  group_columns: string[];
  favourable_label?: string;
  id_columns?: string[];
  feature_columns?: string[];
  min_group_size?: number;
  bootstrap?: number;
  seed?: number;
  thresholds?: Record<string, number>;
  thresholds_rationale?: string;
  checks?: Category[];
  effective_thresholds?: Record<string, number>;
  [key: string]: unknown;
}

export interface AuditRun {
  id: string;
  system: string;
  system_name: string;
  model_version: string;
  model_version_label: string;
  reference_dataset: string;
  reference_dataset_name: string;
  current_dataset: string | null;
  current_dataset_name: string | null;
  config: RunConfig;
  library_versions: Record<string, string>;
  status: RunStatus;
  progress: number;
  progress_message: string;
  error: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  state_counts: Partial<Record<Category, Partial<Record<ResultState, number>>>>;
}

export interface CheckResult {
  id: string;
  category: Category;
  check_key: string;
  subject: string;
  metric: string;
  value: number | null;
  unit: string;
  support_n: number | null;
  ci_low: number | null;
  ci_high: number | null;
  threshold: number | null;
  state: ResultState;
  summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: Record<string, any>;
  origin: "server" | "local_bundle";
}

export interface HistoryEvent {
  action: string;
  from: string;
  to: string;
  comment: string;
  actor: string;
  at: string;
}

export interface Finding {
  id: string;
  system: string;
  system_name: string;
  run: string;
  category: Category;
  title: string;
  plain_language: string;
  next_step: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: FindingStatus;
  owner: string | null;
  owner_name: string | null;
  due_date: string | null;
  remediation_note: string;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_comment: string;
  history: HistoryEvent[];
  created_at: string;
}

export interface ControlDef {
  id: string;
  title: string;
  source: string;
  question: string;
  requirement: string;
  required_evidence: string[];
  guidance: string;
}

export interface ControlEvidenceFile {
  id: string;
  title: string;
  original_filename: string;
  sha256: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface ControlAssessment {
  id: string;
  system: string;
  pack_id: string;
  pack_version: string;
  control_id: string;
  control: ControlDef | null;
  applicable: boolean;
  applicability_rationale: string;
  state: "needs_evidence" | "evidence_supplied" | "reviewed" | "gap_identified" | "not_applicable";
  owner_note: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_comment: string;
  evidence_files: ControlEvidenceFile[];
}

export interface ControlPack {
  pack_id: string;
  version: string;
  title: string;
  jurisdiction: string;
  legal_review_status: string;
  effective_status_note: string;
  sources: { label: string; url: string }[];
}

export interface Overview {
  systems: {
    id: string;
    name: string;
    latest_run_id: string | null;
    latest_run_at: string | null;
    coverage: Partial<Record<Category, { status: CoverageStatus; status_label: string; counts: Partial<Record<ResultState, number>> }>> | null;
    open_findings: number;
    control_gaps: number;
  }[];
  totals: {
    systems: number;
    open_findings: number;
    overdue_findings: number;
    awaiting_review: number;
    control_gaps: number;
    active_runs: number;
  };
  sample_mode: boolean;
  real_data_mode: boolean;
}

export interface RunPreview {
  system_type: SystemType;
  config: RunConfig;
  available_checks: Record<Category, { available: boolean; reason: string; error_rates?: boolean }>;
  data_quality: Record<string, { rows: number; columns: number; columns_with_missing: Record<string, number> }>;
  pii_candidates: PiiFinding[];
}

export interface RunDiff {
  base_run: string;
  other_run: string;
  changes: {
    category: Category;
    check_key: string;
    subject: string;
    metric: string;
    base_value: number | null;
    other_value: number | null;
    delta: number | null;
    base_state: ResultState | null;
    other_state: ResultState | null;
  }[];
  findings: {
    gone_in_other: { title: string; severity: string; status: string }[];
    new_in_other: { title: string; severity: string; status: string }[];
    persisting: { base: { title: string; status: string }; other: { title: string; status: string } }[];
  };
  note: string;
}

export interface Dependency {
  id: string;
  system: string;
  name: string;
  service: string;
  role: "model_provider" | "cloud" | "data_labelling" | "analytics" | "other";
  personal_data_shared: boolean;
  data_categories: string[];
  region: string;
  outside_india: boolean;
  outside_eea: boolean;
  transfer_mechanism: string;
  contract_in_place: boolean;
  contract_reviewed_on: string | null;
  trains_on_customer_data: "yes" | "no" | "unknown";
  retention_days: number | null;
  subprocessors_listed: boolean;
  exit_plan: boolean;
  criticality: "low" | "medium" | "high";
  last_reviewed: string | null;
  notes: string;
}

export type RightKey = "access" | "correction" | "erasure" | "withdraw_consent" | "grievance" | "human_review";

export interface RightsProcess {
  id: string;
  system: string;
  right: RightKey;
  right_label: string;
  procedure_exists: boolean;
  owner: string | null;
  owner_name: string | null;
  channel: string;
  sla_days: number | null;
  last_tested: string | null;
  requests_12m: number;
  closed_on_time_12m: number;
  evidence_note: string;
}

// ==========================================
// Cloud Security (Prowler) Types
// ==========================================
export type CloudProvider = "AWS" | "AZURE" | "GCP";
export type CloudAccountStatus = "CONNECTED" | "ERROR" | "PENDING" | "DISABLED";
export type CloudScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type CloudFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL";
export type CloudFindingStatus = "PASS" | "FAIL" | "MUTED";
export type CloudFindingLifecycle = "OPEN" | "IN_REMEDIATION" | "RESOLVED" | "ACCEPTED" | "FALSE_POSITIVE";

export interface CloudAccount {
  id: string;
  tenant: string;
  name: string;
  provider: CloudProvider;
  account_id: string;
  region_default: string;
  role_arn: string;
  credentials_ref?: string;
  environment: "PRODUCTION" | "STAGING" | "DEVELOPMENT";
  status: CloudAccountStatus;
  compliance_score: number;
  last_scanned_at: string | null;
  last_scan_status: string;
  total_findings_count: number;
  critical_findings_count: number;
  high_findings_count: number;
  medium_findings_count: number;
  low_findings_count: number;
  cloud_connection?: string;
  cloud_connection_name?: string;
  created_by?: string;
  created_by_name?: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CloudScan {
  id: string;
  tenant: string;
  account: string;
  account_name: string;
  account_provider: CloudProvider;
  account_id_val: string;
  scan_type: string;
  status: CloudScanStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  muted_checks: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  compliance_score: number;
  error_message: string;
  prowler_version: string;
  initiated_by?: string;
  initiated_by_name?: string;
  created_at: string;
}

export interface CloudFinding {
  id: string;
  tenant: string;
  scan: string;
  account: string;
  account_name: string;
  provider: CloudProvider;
  check_id: string;
  check_title: string;
  service: string;
  severity: CloudFindingSeverity;
  status: CloudFindingStatus;
  status_extended: string;
  resource_id: string;
  resource_name: string;
  region: string;
  remediation_recommendation_text: string;
  remediation_recommendation_url: string;
  remediation_code: string;
  compliance: string[];
  risk_score: number;
  lifecycle_status: CloudFindingLifecycle;
  is_latest?: boolean;
  affected_asset?: string;
  affected_asset_name?: string;
  resolution_note?: string;
  resolved_at?: string | null;
  created_at: string;
}

export interface ProwlerRule {
  id: string;
  check_id: string;
  provider: CloudProvider;
  service: string;
  title: string;
  severity: CloudFindingSeverity;
  description: string;
  rationale: string;
  remediation_text: string;
  remediation_url: string;
  remediation_code_sample: string;
  compliance_frameworks: string[];
  is_active: boolean;
}

export interface CloudSecurityOverview {
  overall_score: number;
  total_accounts: number;
  connected_accounts: number;
  error_accounts: number;
  severity_counts: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  status_counts: {
    PASS: number;
    FAIL: number;
    RESOLVED: number;
  };
  providers_summary: Record<
    CloudProvider,
    {
      accounts_count: number;
      avg_score: number;
      open_issues: number;
    }
  >;
  top_services: {
    service: string;
    provider: CloudProvider;
    count: number;
  }[];
  recent_scans: CloudScan[];
  critical_findings: CloudFinding[];
  frameworks: {
    code: string;
    name: string;
    provider: string;
    score: number;
  }[];
}

