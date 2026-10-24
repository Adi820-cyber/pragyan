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
  pii_columns: "Columns that look like personal data",
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
  if (["pii_column", "pii_columns", "rows_past_retention", "pii_in_model_inputs", "schema_changes", "vendor_gaps", "vendors_recorded", "rights_procedure"].includes(r.metric)) return String(Math.round(r.value));
  return num(r.value);
}

/** Plain-English meaning of each measurement: what it counts, not whether it passed. */
export const METRIC_HELP: Record<string, string> = {
  demographic_parity_difference: "How far apart the best-treated and worst-treated groups are in how often they get the favourable outcome.",
  selection_rate_ratio: "The worst-treated group's favourable-outcome rate divided by the best-treated group's. 1.0 means equal.",
  equalized_odds_difference: "How different the error rates are between groups: who is wrongly approved or wrongly refused.",
  ks_statistic: "How much a numeric input's spread moved between the two datasets. 0 means identical, 1 means completely different.",
  js_distance: "How much a category mix (or vocabulary) moved between the two datasets. 0 means identical.",
  schema_changes: "Columns that were added, removed or changed type between the two datasets.",
  accuracy_change: "How the model's share of correct predictions moved, where the real outcome is known.",
  favourable_rate_change: "How the share of favourable outcomes moved between the two datasets.",
  refusal_rate_gap: "How much more often one group is refused or deflected than another.",
  refusal_rate_change: "How the share of refused or deflected answers moved between periods.",
  response_length_ratio: "Median answer length for the group that gets the shortest answers, relative to the longest. Shorter can mean less help.",
  score_gap_d: "The gap in average quality score between groups, in standard deviations. Bigger means a larger unfairness signal.",
  mean_groundedness: "On average, the share of an answer's content that also appears in the source it was given.",
  unsupported_number_rate: "Share of answers that state a figure found in neither the source nor the prompt.",
  citation_share: "Share of answers that point to a source.",
  pii_text_rows: "Share of prompts, answers or sources that contain patterns that look like personal data.",
  pii_columns: "How many columns in the dataset match patterns for personal data such as emails, phone numbers or ID numbers.",
  pii_in_model_inputs: "Whether columns that look like personal data are being fed into the model.",
  rows_past_retention: "Rows kept longer than the retention period you declared.",
  review_coverage: "Share of outputs that a person looked at before use.",
  override_rate: "Of the outputs a person reviewed, the share they changed or rejected. Near zero can mean review is a formality.",
  vendor_gaps: "Missing contract, location or exit information for a vendor this system depends on.",
  single_provider: "Whether one critical provider is the only option with no fallback.",
  vendors_recorded: "How many vendors are recorded for this system.",
  rights_procedure: "Whether a working procedure exists for people to use this right.",
  requests_on_time: "Share of people's requests answered within the allowed time.",
  mean_abs_shap: "How much, on average, this input moves the model's output.",
  additivity_max_error: "A self-check: the explanation's parts should add up to the model's output. Smaller is better.",
  group_association: "How strongly a model input tracks membership of a group, which could let the model use the group indirectly.",
};

export function formatThreshold(r: CheckResult): string | null {
  const t = r.threshold;
  if (t === null) return null;
  if (RATE_METRICS.has(r.metric)) {
    const scaled = t * 100;
    return pct(t, Math.abs(scaled - Math.round(scaled)) < 1e-9 ? 0 : 1);
  }
  return String(t);
}

/** Why the result has its state, from the recorded state and threshold only. */
function verdict(r: CheckResult): string | null {
  const t = formatThreshold(r);
  switch (r.state) {
    case "no_alert":
      return t ? `Why no alert: the measured value stays on the right side of the policy limit (${t}).` : "Why no alert: nothing crossed a policy limit.";
    case "review_required":
      return t ? `Why flagged: the measured value crosses the policy limit (${t}). A person should look at it.` : "Why flagged: this crossed a policy limit. A person should look at it.";
    case "insufficient_evidence":
      return "Why inconclusive: there is too little data to say either way. This is not a pass.";
    case "not_applicable":
      return "Why not assessed: an input this check needs was not provided or declared. This is not a pass.";
    case "error":
      return "This check failed to run, so there is no result.";
    default:
      return null;
  }
}

export function ResultCard({ r }: { r: CheckResult }) {
  const ci = r.ci_low !== null && r.ci_high !== null ? `95% interval ${formatValue({ ...r, value: r.ci_low })} to ${formatValue({ ...r, value: r.ci_high })}` : null;
  const threshold = formatThreshold(r);
  const help = METRIC_HELP[r.metric];
  const why = verdict(r);
  const unitWord = r.metric === "schema_changes" ? "columns" : "rows";
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{METRIC_LABEL[r.metric] ?? r.metric}</h3>
          {r.subject && <p className="text-xs text-slate-400">{r.subject}</p>}
        </div>
        <StateBadge state={r.state} />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold text-white">{formatValue(r)}</span>
        {ci && <span className="text-xs text-slate-400">{ci}</span>}
        {threshold !== null && <span className="text-xs text-slate-400">policy limit {threshold}</span>}
        {r.support_n !== null && <span className="text-xs text-slate-400">based on {r.support_n.toLocaleString()} {unitWord}</span>}
      </div>
      <p className="text-xs text-slate-300 mt-2">{r.summary}</p>
      {why && <p className="text-xs text-slate-200 mt-1">{why}</p>}
      {help && <p className="text-[11px] text-slate-500 mt-1">What it measures: {help}</p>}
      {r.origin === "local_bundle" && <p className="text-[11px] text-sky-300 mt-1">Supplied by the local audit tool, not recomputed by the server.</p>}
    </div>
  );
}
