import { AlertTriangle, CheckCircle2, CircleSlash, Clock, HelpCircle, Loader2, XCircle } from "lucide-react";
import type { ComponentType } from "react";

type Tone = "ok" | "warn" | "bad" | "muted" | "info";

const TONES: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  bad: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  muted: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
};

const MAP: Record<string, { label: string; tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  // check results
  no_alert: { label: "No alert under policy", tone: "ok", icon: CheckCircle2 },
  review_required: { label: "Review required", tone: "warn", icon: AlertTriangle },
  insufficient_evidence: { label: "Insufficient evidence", tone: "muted", icon: HelpCircle },
  not_applicable: { label: "Not assessed", tone: "muted", icon: CircleSlash },
  error: { label: "Error", tone: "bad", icon: XCircle },
  // coverage
  assessed: { label: "Assessed", tone: "ok", icon: CheckCircle2 },
  not_assessed: { label: "Not assessed", tone: "muted", icon: CircleSlash },
  // runs
  queued: { label: "Queued", tone: "info", icon: Clock },
  running: { label: "Running", tone: "info", icon: Loader2 },
  completed: { label: "Completed", tone: "ok", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "bad", icon: XCircle },
  cancelled: { label: "Cancelled", tone: "muted", icon: CircleSlash },
  // findings
  open: { label: "Open", tone: "warn", icon: AlertTriangle },
  in_remediation: { label: "In remediation", tone: "info", icon: Clock },
  submitted: { label: "Ready for review", tone: "info", icon: Clock },
  accepted: { label: "Risk accepted", tone: "muted", icon: CheckCircle2 },
  resolved: { label: "Resolved", tone: "ok", icon: CheckCircle2 },
  // controls
  needs_evidence: { label: "Needs evidence", tone: "warn", icon: AlertTriangle },
  evidence_supplied: { label: "Evidence supplied", tone: "info", icon: Clock },
  reviewed: { label: "Reviewed", tone: "ok", icon: CheckCircle2 },
  gap_identified: { label: "Gap identified", tone: "bad", icon: XCircle },
  // severities & cloud security
  CRITICAL: { label: "Critical", tone: "bad", icon: AlertTriangle },
  HIGH: { label: "High", tone: "bad", icon: AlertTriangle },
  MEDIUM: { label: "Medium", tone: "warn", icon: AlertTriangle },
  LOW: { label: "Low", tone: "muted", icon: AlertTriangle },
  INFORMATIONAL: { label: "Info", tone: "info", icon: HelpCircle },
  PASS: { label: "Pass", tone: "ok", icon: CheckCircle2 },
  FAIL: { label: "Fail", tone: "bad", icon: XCircle },
  MUTED: { label: "Muted", tone: "muted", icon: CircleSlash },
  CONNECTED: { label: "Connected", tone: "ok", icon: CheckCircle2 },
  PENDING: { label: "Pending", tone: "info", icon: Clock },
  ERROR: { label: "Error", tone: "bad", icon: XCircle },
};

/** Status is always shown as text plus an icon, never by colour alone. */
export function StateBadge({ state, label }: { state: string; label?: string }) {
  const entry = MAP[state] ?? { label: state, tone: "muted" as Tone, icon: HelpCircle };
  const Icon = entry.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[entry.tone]}`}>
      <Icon className={`w-3 h-3 ${state === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
      {label ?? entry.label}
    </span>
  );
}
