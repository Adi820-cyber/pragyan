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
  datasets: { is_sample: boolean }[];
};

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
      subtitle={`Finished ${dateTime(run.finished_at)} · reference "${run.reference_dataset_name}"${run.current_dataset_name ? ` · current "${run.current_dataset_name}"` : ""}`}
      sample={report?.datasets.some((d) => d.is_sample)}
      actions={
        <Link href={`/reports/${run.id}`} className={ghostButtonClass}>
          <FileText className="w-4 h-4" aria-hidden="true" />
          View report
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
      <Panel title="How this run was configured">
        <dl className="grid md:grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-slate-400">Prediction / outcome / favourable value</dt>
            <dd className="text-slate-200">{run.config.prediction_column} / {run.config.label_column ?? "none"} / {run.config.favourable_label}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Groups compared</dt>
            <dd className="text-slate-200">{run.config.group_columns.join(", ") || "none"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-slate-400">Policy thresholds</dt>
            <dd className="text-slate-200">
              {Object.entries(run.config.effective_thresholds ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}
              <span className="block text-slate-500 mt-1">{run.config.thresholds_rationale}</span>
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
