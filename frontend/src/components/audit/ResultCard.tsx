import { StateBadge } from "@/components/ui/StateBadge";
import { num, pct } from "@/lib/format";
import type { CheckResult } from "@/lib/types";

export const METRIC_LABEL: Record<string, string> = {
  demographic_parity_difference: "Outcome gap between groups",
  selection_rate_ratio: "Lowest-to-highest outcome ratio",
  equalized_odds_difference: "Error-rate gap between groups",
  selection_rate: "Favourable-outcome rate",
  true_positive_rate: "True positive rate",
  false_positive_rate: "False positive rate",
  ks_statistic: "Numeric change (KS)",
  js_distance: "Category change (JS)",
  schema_changes: "Column or type changes",
  missing_share_change: "Missing-value change",
  unseen_category_share: "New category values",
  favourable_rate_change: "Favourable-outcome rate change",
  accuracy_change: "Accuracy change",
  mean_abs_shap: "Influence on output",
  additivity_max_error: "Explanation self-check",
  group_association: "Association with a group",
  pii_column: "Personal-data indicator",
  pii_in_model_inputs: "Personal data in model inputs",
  rows_past_retention: "Rows past retention",
  refusal_rate: "Refusal rate",
  refusal_rate_gap: "Refusal-rate gap between groups",
  refusal_rate_change: "Refusal-rate change",
  response_length_ratio: "Answer-length ratio between groups",
  score_gap_d: "Quality-score gap (standard deviations)",
  mean_groundedness: "Average groundedness",
  unsupported_number_rate: "Outputs with unsupported figures",
  citation_share: "Outputs that cite a source",
  pii_text_rows: "Personal data in text",
  review_coverage: "Outputs reviewed by a person",
  override_rate: "Reviewed outputs that were changed",
  vendor_gaps: "Vendor gaps",
  single_provider: "Single critical provider",
  vendors_recorded: "Vendors recorded",
  rights_procedure: "Rights procedure",
  requests_on_time: "Requests closed on time",
};

const RATE_METRICS = new Set([
  "refusal_rate", "refusal_rate_gap", "refusal_rate_change", "mean_groundedness", "unsupported_number_rate", "citation_share",
  "pii_text_rows", "review_coverage", "override_rate", "requests_on_time",
  "demographic_parity_difference", "equalized_odds_difference", "selection_rate", "true_positive_rate",
  "false_positive_rate", "missing_share_change", "unseen_category_share", "favourable_rate_change", "accuracy_change",
]);

export function formatValue(r: Pick<CheckResult, "metric" | "value" | "unit">): string {
  if (r.value === null) return "n/a";
  if (RATE_METRICS.has(r.metric)) return pct(r.value);
  if (r.metric === "additivity_max_error") return r.value.toExponential(1);
  if (["pii_column", "rows_past_retention", "pii_in_model_inputs", "schema_changes", "vendor_gaps", "vendors_recorded", "rights_procedure"].includes(r.metric)) return String(Math.round(r.value));
  return num(r.value);
}

export function ResultCard({ r }: { r: CheckResult }) {
  const ci =
    r.ci_low !== null && r.ci_high !== null
      ? `95% CI [${formatValue({ ...r, value: r.ci_low })}, ${formatValue({ ...r, value: r.ci_high })}]`
      : null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{METRIC_LABEL[r.metric] ?? r.metric}</h3>
          {r.subject && <p className="text-xs text-zinc-400 truncate mt-0.5">{r.subject}</p>}
        </div>
        <div className="shrink-0">
          <StateBadge state={r.state} />
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-bold text-zinc-100 tabular-nums">{formatValue(r)}</span>
        {ci && <span className="text-xs text-zinc-400 font-mono tabular-nums">{ci}</span>}
        {r.threshold !== null && (
          <span className="text-xs text-zinc-400 font-mono tabular-nums">threshold: {r.threshold}</span>
        )}
        {r.support_n !== null && (
          <span className="text-xs text-zinc-400 tabular-nums">n = {r.support_n.toLocaleString()}</span>
        )}
      </div>

      <p className="text-xs text-zinc-300 leading-relaxed">{r.summary}</p>
      {r.origin === "local_bundle" && (
        <p className="text-[11px] text-zinc-400 mt-1">Supplied by local execution bundle.</p>
      )}
    </div>
  );
}
