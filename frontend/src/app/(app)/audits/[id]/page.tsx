import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, GitCompare, RotateCw } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { RunProgress } from "@/components/audit/RunProgress";
import { ResultsTabs } from "@/components/audit/ResultsTabs";
import { ErrorState, Panel, ghostButtonClass } from "@/components/ui/Panel";
import { WhatThisShows } from "@/components/ui/WhatThisShows";
import { ApiError, api, errorMessage, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AuditRun, CheckResult, Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

type ReportLite = {
  coverage: Record<string, { status: string; counts: Record<string, number> }>;
  datasets: { role: string; name: string; sha256: string; row_count: number; is_sample: boolean; is_real_data: boolean; source_note: string }[];
};

const TABULAR_POLICY: Record<string, string> = {
  demographic_parity_difference: "Outcome gap between groups (max)",
  selection_rate_ratio_min: "Lowest-to-highest outcome ratio (min)",
  equalized_odds_difference: "Error-rate gap between groups (max)",
  drift_ks: "Numeric drift, KS (max)",
  drift_js: "Category drift, JS (max)",
  performance_drop: "Accuracy drop (max)",
  missingness_change: "Missing-value change (max)",
  unseen_category_share: "New category values (max)",
  proxy_eta: "Association with a group (max)",
  pii_value_match_share: "Share of values matching a personal-data pattern (min)",
};

const LLM_POLICY: Record<string, string> = {
  llm_refusal_gap: "Refusal-rate gap between groups (max)",
  llm_length_ratio_min: "Answer-length ratio between groups (min)",
  llm_score_gap_d: "Quality-score gap, standard deviations (max)",
  llm_min_grounded: "Average groundedness (min)",
  llm_unsupported_number_rate: "Outputs with unsupported figures (max)",
  llm_min_citation_share: "Outputs that cite a source (min)",
  llm_min_review_share: "Outputs reviewed by a person (min)",
  llm_rubber_stamp_override: "Override rate below which review looks like a formality",
  llm_high_override: "Override rate above which the system looks unreliable",
  drift_ks: "Numeric drift, KS (max)",
  drift_js: "Vocabulary and category drift, JS (max)",
  pii_value_match_share: "Share of values matching a personal-data pattern (min)",
};

const SHARED_POLICY: Record<string, string> = { rights_min_on_time: "Data-rights requests closed on time (min)" };

export default async function AuditDetailPage({ params }: PageProps<"/audits/[id]">) {
  const { id } = await params;
  let run: AuditRun;
  try {
    run = await api<AuditRun>(`/ai/runs/${id}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <PageShell title="Audit">
        <ErrorState message={errorMessage(error)} />
      </PageShell>
    );
  }

  const title = `${run.system_name}, model ${run.model_version_label}`;

  if (run.status !== "completed") {
    return (
      <PageShell title={title} subtitle={`Started ${dateTime(run.started_at ?? run.created_at)}`}>
        <WhatThisShows>
          {run.status === "failed"
            ? "This audit did not finish, so there are no results. The reason is shown below. Fix it and start a new audit for the same system."
            : run.status === "cancelled"
              ? "This audit was cancelled before it finished, so no results were saved."
              : "This audit is running in the background. Results appear here by themselves when it finishes, usually within a minute for sample data."}
        </WhatThisShows>
        <RunProgress run={run} />
        {(run.status === "failed" || run.status === "cancelled") && (
          <div className="flex justify-end">
            <Link href={`/audits/new?system=${run.system}`} className={ghostButtonClass}>
              <RotateCw className="w-4 h-4" aria-hidden="true" />
              Start a new audit
            </Link>
          </div>
        )}
      </PageShell>
    );
  }

  let results: CheckResult[] = [];
  let findings: Finding[] = [];
  let report: ReportLite | null = null;
  let previous: AuditRun | null = null;
  let failure: string | null = null;
  try {
    let siblings: AuditRun[];
    [results, findings, report, siblings] = await Promise.all([
      api<CheckResult[]>(`/ai/runs/${id}/results/`),
      list<Finding>(`/ai/findings/?run=${id}`),
      api<ReportLite>(`/ai/runs/${id}/report.json/`),
      list<AuditRun>(`/ai/runs/?system=${run.system}`),
    ]);
    previous =
      siblings
        .filter((r) => r.status === "completed" && r.id !== run.id && (r.finished_at ?? r.created_at) < (run.finished_at ?? run.created_at))
        .sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at))[0] ?? null;
  } catch (error) {
    failure = errorMessage(error);
  }

  const isLlm = run.config.system_type === "llm";
  const policyLabels = { ...(isLlm ? LLM_POLICY : TABULAR_POLICY), ...SHARED_POLICY };
  const policy = Object.entries(run.config.effective_thresholds ?? {}).filter(([k]) => k in policyLabels);

  return (
    <PageShell
      title={title}
      subtitle={`Finished ${dateTime(run.finished_at)} · reference "${run.reference_dataset_name}"${run.current_dataset_name ? ` · current "${run.current_dataset_name}"` : ""}`}
      sample={report?.datasets.some((d) => d.is_sample && !d.is_real_data)}
      realData={(() => {
        const real = report?.datasets.find((d) => d.is_real_data);
        return real ? { source: real.source_note } : false;
      })()}
      actions={
        <>
          <Link href={`/audits/new?system=${run.system}`} className={ghostButtonClass}>
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            Run again
          </Link>
          {previous && (
            <Link href={`/reports/${run.id}?compare=${previous.id}`} className={ghostButtonClass}>
              <GitCompare className="w-4 h-4" aria-hidden="true" />
              Compare with previous
            </Link>
          )}
          <a href={`/api/proxy/ai/runs/${run.id}/report.json/`} download={`audit-report-${run.id}.json`} className={ghostButtonClass}>
            <Download className="w-4 h-4" aria-hidden="true" />
            Export JSON
          </a>
          <Link href={`/reports/${run.id}`} className={ghostButtonClass}>
            <FileText className="w-4 h-4" aria-hidden="true" />
            View report
          </Link>
        </>
      }
    >
      <WhatThisShows>
        The results of one audit of this AI system. Use the tabs to see each kind of check. Every number comes with the policy limit it was compared against and a plain explanation of why it was or was not flagged.
        {previous ? " You can compare this run with the previous one to see what changed." : " Run it again later to compare results over time."}
      </WhatThisShows>
      {failure && <ErrorState message={failure} />}
      {report && (
        <ResultsTabs
          systemId={run.system}
          results={results}
          findings={findings}
          coverage={report.coverage as never}
        />
      )}
      <Panel title="Evidence: how this run was configured">
        <p className="text-xs text-slate-400 mb-4">
          Everything needed to reproduce this run: the data it read (with fingerprints), the column mapping, the policy limits and the software versions.
        </p>
        <dl className="grid md:grid-cols-2 gap-3 text-xs">
          {report && report.datasets.length > 0 && (
            <div className="md:col-span-2">
              <dt className="text-slate-400">Data snapshot</dt>
              <dd className="text-slate-200 space-y-1 mt-1">
                {report.datasets.map((d) => (
                  <div key={`${d.role}-${d.sha256}`}>
                    <span className="capitalize">{d.role}</span>: {d.name} · {d.row_count.toLocaleString()} rows ·{" "}
                    {d.is_real_data ? "real public data" : d.is_sample ? "synthetic sample" : "your data"}
                    <span className="block font-mono text-[11px] text-slate-500 break-all">sha256 {d.sha256}</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-slate-400">{isLlm ? "Answer / prompt / source columns" : "Prediction / outcome / favourable value"}</dt>
            <dd className="text-slate-200">
              {isLlm
                ? `${run.config.output_column ?? "none"} / ${run.config.prompt_column ?? "none"} / ${run.config.context_column ?? "none"}`
                : `${run.config.prediction_column} / ${run.config.label_column ?? "none"} / ${run.config.favourable_label}`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Groups compared</dt>
            <dd className="text-slate-200">{run.config.group_columns.join(", ") || "none"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-400">Policy limits used</dt>
            <dd className="text-slate-200">
              <ul className="mt-1 grid sm:grid-cols-2 gap-x-6 gap-y-0.5">
                {policy.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3"><span>{policyLabels[k]}</span><span className="font-mono">{v}</span></li>
                ))}
              </ul>
              <span className="block text-slate-500 mt-2">{run.config.thresholds_rationale}</span>
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-400">Software versions</dt>
            <dd className="text-slate-200">{Object.entries(run.library_versions).map(([k, v]) => `${k} ${v}`).join(", ")}</dd>
          </div>
        </dl>
      </Panel>
    </PageShell>
  );
}
