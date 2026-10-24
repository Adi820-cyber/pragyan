export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 3) =>
  v === null || v === undefined ? "n/a" : v.toFixed(digits);

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "n/a";

export const dateOnly = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "n/a";

export const CATEGORY_LABEL: Record<string, string> = {
  bias: "Bias",
  drift: "Drift",
  explainability: "Explainability",
  grounding: "Groundedness & traceability",
  privacy: "Data security & privacy",
  governance: "Vendors, rights & oversight",
};

/** Display order of audit categories. */
export const CATEGORY_ORDER = ["bias", "drift", "explainability", "grounding", "privacy", "governance"] as const;

export const RIGHT_LABEL: Record<string, string> = {
  access: "Access to data",
  correction: "Correction of data",
  erasure: "Erasure of data",
  withdraw_consent: "Withdrawal of consent",
  grievance: "Grievance redressal",
  human_review: "Human review of an automated decision",
};

export const ROLE_LABEL: Record<string, string> = {
  TENANT_ADMIN: "Administrator",
  COMPLIANCE_OFFICER: "Reviewer",
  RISK_OWNER: "Owner",
  AUDITOR: "Read-only",
  CONTRIBUTOR: "Contributor",
};

/** Whether a role may review findings and controls. Mirrors the backend policy; the API still enforces it. */
export const canReview = (role: string | undefined) => role === "TENANT_ADMIN" || role === "COMPLIANCE_OFFICER";
export const canEdit = (role: string | undefined) => role !== undefined && role !== "AUDITOR";
