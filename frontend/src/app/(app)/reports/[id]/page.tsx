import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { ReportFrame } from "@/components/reports/ReportFrame";
import { StateBadge } from "@/components/ui/StateBadge";
import { ErrorState, Panel, buttonClass, inputClass } from "@/components/ui/Panel";
import { ApiError, api, errorMessage, list } from "@/lib/server/api";
import { CATEGORY_LABEL, dateTime } from "@/lib/format";
import { METRIC_LABEL, formatValue } from "@/components/audit/ResultCard";
import type { AuditRun, RunDiff } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const compare = typeof query.compare === "string" ? query.compare : undefined;

  let run: AuditRun;
  let others: AuditRun[] = [];
  let diff: RunDiff | null = null;
  let failure: string | null = null;
  try {
    run = await api<AuditRun>(`/ai/runs/${id}/`);
    others = (await list<AuditRun>(`/ai/runs/?system=${run.system}`)).filter(
      (r) => r.status === "completed" && r.id !== run.id
    );
    if (compare) diff = await api<RunDiff>(`/ai/runs/${id}/diff/${compare}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    failure = errorMessage(error);
    return (
      <PageShell title="Report">
        <ErrorState message={failure} />
      </PageShell>
    );
  }

  const otherLabel = (r: AuditRun) => `Model ${r.model_version_label} (${dateTime(r.finished_at)})`;

  return (
    <PageShell
      title={`Audit Report: ${run.system_name}`}
      subtitle={`Evaluated Model ${run.model_version_label} · Completed ${dateTime(run.finished_at)}`}
    >
      {others.length > 0 && (
        <Panel
          title="Differential Run Comparison"
          subtitle="Compare metric changes and finding regressions against historical runs"
        >
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="compare" className="block text-xs font-medium text-zinc-300 mb-1">
                Historical Benchmark Run
              </label>
              <select id="compare" name="compare" defaultValue={compare ?? ""} className={inputClass}>
                <option value="">Select comparison run</option>
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {otherLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={buttonClass}>
              Compare Runs
            </button>
          </form>

          {diff && (
            <div className="mt-5 space-y-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-300">{diff.note}</p>
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <caption className="sr-only">Metric deviations between runs</caption>
                  <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th scope="col" className="p-2.5">Evaluation Check</th>
                      <th scope="col" className="p-2.5">Benchmark Run</th>
                      <th scope="col" className="p-2.5">Active Run</th>
                      <th scope="col" className="p-2.5">Status Transition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {diff.changes
                      .filter(
                        (c) =>
                          [
                            "demographic_parity",
                            "selection_rate_ratio",
                            "equalized_odds",
                            "feature_distribution",
                            "prediction_distribution",
                            "proxy_screen",
                            "performance",
                          ].includes(c.check_key) || c.base_state !== c.other_state
                      )
                      .map((c, i) => (
                        <tr key={i} className="hover:bg-zinc-800/20">
                          <th scope="row" className="p-2.5 text-left font-sans font-medium text-zinc-200">
                            {CATEGORY_LABEL[c.category]}: {METRIC_LABEL[c.metric] ?? c.metric}
                            {c.subject ? ` (${c.subject})` : ""}
                          </th>
                          <td className="p-2.5 tabular-nums text-zinc-400">
                            {c.other_value === null
                              ? "—"
                              : formatValue({ metric: c.metric, value: c.other_value, unit: "" })}
                          </td>
                          <td className="p-2.5 tabular-nums text-zinc-100 font-semibold">
                            {c.base_value === null
                              ? "—"
                              : formatValue({ metric: c.metric, value: c.base_value, unit: "" })}
                          </td>
                          <td className="p-2.5 font-sans">
                            <span className="inline-flex items-center gap-1.5">
                              {c.other_state ? <StateBadge state={c.other_state} /> : "—"}
                              <span className="text-zinc-500 font-mono">→</span>
                              {c.base_state ? <StateBadge state={c.base_state} /> : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/40 space-y-1">
                  <h4 className="font-semibold text-zinc-200">Resolved in Active Run</h4>
                  {diff.findings.new_in_other.length === 0 ? (
                    <p className="text-zinc-500">None</p>
                  ) : (
                    <ul className="text-zinc-300 space-y-0.5">
                      {diff.findings.new_in_other.map((f, i) => (
                        <li key={i}>{f.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/40 space-y-1">
                  <h4 className="font-semibold text-zinc-200">Persisting Findings</h4>
                  {diff.findings.persisting.length === 0 ? (
                    <p className="text-zinc-500">None</p>
                  ) : (
                    <ul className="text-zinc-300 space-y-0.5">
                      {diff.findings.persisting.map((f, i) => (
                        <li key={i}>{f.base.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/40 space-y-1">
                  <h4 className="font-semibold text-zinc-200">Newly Introduced Issues</h4>
                  {diff.findings.gone_in_other.length === 0 ? (
                    <p className="text-zinc-500">None</p>
                  ) : (
                    <ul className="text-zinc-300 space-y-0.5">
                      {diff.findings.gone_in_other.map((f, i) => (
                        <li key={i}>{f.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-zinc-400">
                Resolved findings must still undergo formal audit closure in the{" "}
                <Link href="/findings" className="underline underline-offset-2 text-zinc-300 hover:text-white">
                  Findings register
                </Link>
                .
              </p>
            </div>
          )}
        </Panel>
      )}

      <ReportFrame runId={run.id} />
    </PageShell>
  );
}
