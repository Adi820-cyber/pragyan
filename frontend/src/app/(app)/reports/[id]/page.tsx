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
    others = (await list<AuditRun>(`/ai/runs/?system=${run.system}`)).filter((r) => r.status === "completed" && r.id !== run.id);
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

  const otherLabel = (r: AuditRun) => `Model ${r.model_version_label}, ${dateTime(r.finished_at)}`;

  return (
    <PageShell title={`Report: ${run.system_name}, model ${run.model_version_label}`} subtitle={`Run finished ${dateTime(run.finished_at)}`}>
      {others.length > 0 && (
        <Panel title="Compare with another run of this system">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="compare" className="block text-xs text-slate-300 mb-1">Other run</label>
              <select id="compare" name="compare" defaultValue={compare ?? ""} className={inputClass}>
                <option value="">Choose a run</option>
                {others.map((r) => <option key={r.id} value={r.id}>{otherLabel(r)}</option>)}
              </select>
            </div>
            <button type="submit" className={buttonClass}>Compare</button>
          </form>

          {diff && (
            <div className="mt-5 space-y-4">
              <p className="text-xs text-slate-400">{diff.note}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="text-left text-slate-300 mb-1">Measurements that changed (this report compared with the other run)</caption>
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-white/10">
                      <th scope="col" className="p-2 font-medium">Check</th>
                      <th scope="col" className="p-2 font-medium">Other run</th>
                      <th scope="col" className="p-2 font-medium">This run</th>
                      <th scope="col" className="p-2 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.changes
                      .filter((c) => ["demographic_parity", "selection_rate_ratio", "equalized_odds", "feature_distribution", "prediction_distribution", "proxy_screen", "performance"].includes(c.check_key) || c.base_state !== c.other_state)
                      .map((c, i) => (
                        <tr key={i} className="border-b border-white/5 text-slate-200">
                          <th scope="row" className="p-2 text-left font-medium">
                            {CATEGORY_LABEL[c.category]}: {METRIC_LABEL[c.metric] ?? c.metric}{c.subject ? ` (${c.subject})` : ""}
                          </th>
                          <td className="p-2">{c.other_value === null ? "none" : formatValue({ metric: c.metric, value: c.other_value, unit: "" })}</td>
                          <td className="p-2">{c.base_value === null ? "none" : formatValue({ metric: c.metric, value: c.base_value, unit: "" })}</td>
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1">
                              {c.other_state ? <StateBadge state={c.other_state} /> : "none"}
                              <span aria-hidden="true">→</span>
                              <span className="sr-only">to</span>
                              {c.base_state ? <StateBadge state={c.base_state} /> : "none"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <div><h3 className="font-semibold text-slate-200 mb-1">No longer raised</h3>{diff.findings.new_in_other.length === 0 ? <p className="text-slate-500">None</p> : <ul className="text-slate-300 space-y-1">{diff.findings.new_in_other.map((f, i) => <li key={i}>{f.title}</li>)}</ul>}</div>
                <div><h3 className="font-semibold text-slate-200 mb-1">Still raised</h3>{diff.findings.persisting.length === 0 ? <p className="text-slate-500">None</p> : <ul className="text-slate-300 space-y-1">{diff.findings.persisting.map((f, i) => <li key={i}>{f.base.title}</li>)}</ul>}</div>
                <div><h3 className="font-semibold text-slate-200 mb-1">Newly raised</h3>{diff.findings.gone_in_other.length === 0 ? <p className="text-slate-500">None</p> : <ul className="text-slate-300 space-y-1">{diff.findings.gone_in_other.map((f, i) => <li key={i}>{f.title}</li>)}</ul>}</div>
              </div>
              <p className="text-[11px] text-slate-500">
                A finding that is no longer raised is not automatically resolved. Check the measurements and keep the history in <Link href="/findings" className="underline">Findings</Link>.
              </p>
            </div>
          )}
        </Panel>
      )}
      <ReportFrame runId={run.id} />
    </PageShell>
  );
}
