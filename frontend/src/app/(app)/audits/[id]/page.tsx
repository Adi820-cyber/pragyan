import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { RunProgress } from "@/components/audit/RunProgress";
import { ResultsTabs } from "@/components/audit/ResultsTabs";
import { ErrorState, Panel, ghostButtonClass } from "@/components/ui/Panel";
import { ApiError, api, errorMessage, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AuditRun, CheckResult, Finding } from "@/lib/types";

export const dynamic = "force-dynamic";

type ReportLite = {
  coverage: Record<string, { status: string; counts: Record<string, number> }>;
  datasets: { is_sample: boolean; is_real_data: boolean; source_note: string }[];
};

export default async function AuditDetailPage({ params }: PageProps<"/audits/[id]">) {
  const { id } = await params;
  let run: AuditRun;
  try {
    run = await api<AuditRun>(`/ai/runs/${id}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <PageShell title="Audit Details">
        <ErrorState message={errorMessage(error)} />
      </PageShell>
    );
  }

  const title = `${run.system_name} (Model ${run.model_version_label})`;

  if (run.status !== "completed") {
    return (
      <PageShell title={title} subtitle={`Started ${dateTime(run.started_at ?? run.created_at)}`}>
        <RunProgress run={run} />
      </PageShell>
    );
  }

  let results: CheckResult[] = [];
  let findings: Finding[] = [];
  let report: ReportLite | null = null;
  let failure: string | null = null;
  try {
    [results, findings, report] = await Promise.all([
      api<CheckResult[]>(`/ai/runs/${id}/results/`),
      list<Finding>(`/ai/findings/?run=${id}`),
      api<ReportLite>(`/ai/runs/${id}/report.json/`),
    ]);
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title={title}
      subtitle={`Completed ${dateTime(run.finished_at)} · Reference dataset "${run.reference_dataset_name}"${
        run.current_dataset_name ? ` · Comparison dataset "${run.current_dataset_name}"` : ""
      }`}
      sample={report?.datasets.some((d) => d.is_sample && !d.is_real_data)}
      realData={(() => {
        const real = report?.datasets.find((d) => d.is_real_data);
        return real ? { source: real.source_note } : false;
      })()}
      actions={
        <Link href={`/reports/${run.id}`} className={ghostButtonClass}>
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          <span>View exportable report</span>
        </Link>
      }
    >
      {failure && <ErrorState message={failure} />}
      {report && (
        <ResultsTabs
          systemId={run.system}
          results={results}
          findings={findings}
          coverage={report.coverage as never}
        />
      )}
      <Panel title="Audit Execution Configuration">
        <dl className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <dt className="text-zinc-400 font-medium">
              {run.config.system_type === "llm"
                ? "Output / Prompt / Source columns"
                : "Prediction / Outcome / Favourable value"}
            </dt>
            <dd className="text-zinc-200 font-mono bg-zinc-900/60 p-2 rounded-md border border-zinc-800">
              {run.config.system_type === "llm"
                ? `${run.config.output_column ?? "none"} / ${run.config.prompt_column ?? "none"} / ${
                    run.config.context_column ?? "none"
                  }`
                : `${run.config.prediction_column} / ${run.config.label_column ?? "none"} / ${
                    run.config.favourable_label
                  }`}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-zinc-400 font-medium">Demographic / Sensitive Groups Evaluated</dt>
            <dd className="text-zinc-200 font-mono bg-zinc-900/60 p-2 rounded-md border border-zinc-800">
              {run.config.group_columns.join(", ") || "None specified"}
            </dd>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <dt className="text-zinc-400 font-medium">Active Policy Thresholds</dt>
            <dd className="text-zinc-200 font-mono text-[11px] bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800">
              {Object.entries(run.config.effective_thresholds ?? {})
                .map(([k, v]) => `${k} = ${v}`)
                .join("  |  ")}
              {run.config.thresholds_rationale && (
                <span className="block text-zinc-400 font-sans text-xs mt-1.5 pt-1.5 border-t border-zinc-800/60">
                  {run.config.thresholds_rationale}
                </span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <dt className="text-zinc-400 font-medium">Underlying Tool Versions</dt>
            <dd className="text-zinc-300 font-mono text-[11px]">
              {Object.entries(run.library_versions)
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ")}
            </dd>
          </div>
        </dl>
      </Panel>
    </PageShell>
  );
}
