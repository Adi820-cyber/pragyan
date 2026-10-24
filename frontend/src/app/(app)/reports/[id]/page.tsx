import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { ReportFrame } from "@/components/reports/ReportFrame";
import { ReportActions } from "@/components/reports/ReportActions";
import { GenerateReportButton } from "@/components/reports/GenerateReportButton";
import { VerifyFingerprint } from "@/components/reports/VerifyFingerprint";
import { StateBadge } from "@/components/ui/StateBadge";
import { ErrorState, Panel, buttonClass, inputClass } from "@/components/ui/Panel";
import { ApiError, api, errorMessage, getMe, list } from "@/lib/server/api";
import { CATEGORY_LABEL, canEdit, dateTime } from "@/lib/format";
import { METRIC_LABEL, formatValue } from "@/components/audit/ResultCard";
import type { AuditReportDetail, AuditReportRow, AuditRun, RunDiff } from "@/lib/types";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  generate: "Generated",
  submit: "Submitted for review",
  approve: "Approved",
  request_changes: "Changes requested",
};

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const compare = typeof query.compare === "string" ? query.compare : undefined;

  let report: AuditReportDetail | null = null;
  let run: AuditRun | null = null;
  let role = "";
  let myId = "";
  let others: AuditRun[] = [];
  let versions: AuditReportRow[] = [];
  let diff: RunDiff | null = null;
  try {
    const me = await getMe();
    role = me.active_membership?.role ?? "";
    myId = me.active_membership?.membership_id ?? "";
    try {
      report = await api<AuditReportDetail>(`/ai/reports/${id}/`);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
      // Older links point at an audit run. Offer to generate a report; nothing is created by opening this page.
      run = await api<AuditRun>(`/ai/runs/${id}/`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) notFound();
        throw e;
      });
    }
    if (report) {
      const [runs, vers] = await Promise.all([
        list<AuditRun>(`/ai/runs/?system=${report.system}`),
        list<AuditReportRow>(`/ai/reports/?system=${report.system}`),
      ]);
      others = runs.filter((r) => r.status === "completed" && r.id !== report!.run);
      versions = vers;
      if (compare) diff = await api<RunDiff>(`/ai/runs/${report.run}/diff/${compare}/`);
    }
  } catch (error) {
    return (
      <PageShell title="Report">
        <ErrorState message={errorMessage(error)} />
      </PageShell>
    );
  }

  if (!report) {
    return (
      <PageShell title={`Report: ${run!.system_name}`} subtitle="No frozen report exists for this audit yet">
        <Panel title="Generate a report">
          <p className="text-sm text-slate-300 mb-3">
            This audit finished {dateTime(run!.finished_at)}. Generating freezes its results into a versioned report that a different person can review and approve.
          </p>
          {run!.status === "completed" && canEdit(role) ? (
            <GenerateReportButton runId={run!.id} />
          ) : (
            <p className="text-xs text-slate-400">{run!.status !== "completed" ? `The audit is ${run!.status}; reports need a completed audit.` : "Your role is read-only."}</p>
          )}
          <p className="text-xs text-slate-500 mt-3"><Link href="/reports" className="underline">Back to reports</Link></p>
        </Panel>
      </PageShell>
    );
  }

  const ex = report.executive_summary;
  const rm = report.regulatory_mapping;
  const otherLabel = (r: AuditRun) => `Model ${r.model_version_label}, ${dateTime(r.finished_at)}`;
  const verdictTone = ex?.verdict.level === "attention" ? "border-rose-500/40 bg-rose-500/10" : ex?.verdict.level === "no_alert" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10";

  return (
    <PageShell title={`Report: ${report.system_name} v${report.version}`} subtitle={`Model ${report.model_version_label}, audit finished ${dateTime(report.audit_date)}`}>
      <p className="text-xs text-slate-400 max-w-3xl">
        What this shows: a frozen copy of one completed audit, written for a non-specialist reader. It lists what was measured, what needs a person&apos;s
        attention and what was not tested. It supports evidence for DPDP and GDPR provisions and does not say the system is compliant.
      </p>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Sign-off" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <StateBadge state={report.status} />
            <span className="text-xs text-slate-400">Version {report.version}</span>
            {versions.length > 1 && (
              <span className="text-xs text-slate-500">
                Other versions:{" "}
                {versions.filter((v) => v.id !== report!.id).map((v) => (
                  <Link key={v.id} href={`/reports/${v.id}`} className="underline mr-2">v{v.version} ({v.status_label})</Link>
                ))}
              </span>
            )}
          </div>
          <ol className="space-y-3 mb-4 border-l border-white/10 pl-4" aria-label="Report timeline">
            {report.events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="font-semibold text-slate-100">{ACTION_LABEL[e.action] ?? e.action}</span>
                <span className="text-slate-400"> by {e.actor_name}, {dateTime(e.created_at)}</span>
                {e.comment && <p className="text-xs text-slate-400">{e.comment}</p>}
              </li>
            ))}
            {report.status !== "approved" && (
              <li className="text-sm text-slate-500">{report.status === "draft" ? "Next: submit for review" : "Next: approval by a different reviewer"}</li>
            )}
          </ol>
          <ReportActions report={report} role={role} myMembershipId={myId} />
        </Panel>
        <Panel title="Tamper-evident fingerprint">
          <p className="text-xs text-slate-400 mb-2">SHA-256 of the frozen report content and of the measurements it was built from.</p>
          <code className="block text-[11px] break-all text-cyan-200 bg-black/30 rounded p-2 mb-3">{report.fingerprint}</code>
          <VerifyFingerprint reportId={report.id} />
        </Panel>
      </div>

      {ex && (
        <Panel title="Executive summary">
          <div className={`rounded-lg border p-4 mb-5 ${verdictTone}`}>
            <p className="font-semibold text-white">{ex.verdict.headline}</p>
            <p className="text-sm text-slate-200 mt-1">{ex.verdict.text}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <section aria-labelledby="top-risks">
              <h3 id="top-risks" className="font-semibold text-slate-100 mb-2">Top risks</h3>
              {ex.top_risks.length === 0 ? <p className="text-slate-500 text-xs">No open findings or alerts.</p> : (
                <ol className="list-decimal pl-5 space-y-2 text-slate-300">
                  {ex.top_risks.map((r, i) => (
                    <li key={i}>
                      <span className="font-medium text-slate-100">{r.title}</span> {r.severity && <StateBadge state={r.severity} />}
                      <p className="text-xs text-slate-400">{r.why}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="not-tested">
              <h3 id="not-tested" className="font-semibold text-slate-100 mb-2">Not tested or limited</h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">{ex.not_tested.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          </div>
          <h3 className="font-semibold text-slate-100 mt-6 mb-2 text-sm">What failed and why</h3>
          {ex.failed.length === 0 ? <p className="text-slate-500 text-xs">No measurement crossed the screening policy.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Measurements that need review</caption>
                <thead><tr className="text-left text-slate-400 border-b border-white/10">
                  <th scope="col" className="p-2 font-medium">Check</th><th scope="col" className="p-2 font-medium">Value</th><th scope="col" className="p-2 font-medium">Rows</th><th scope="col" className="p-2 font-medium">Why</th>
                </tr></thead>
                <tbody>
                  {ex.failed.map((f, i) => (
                    <tr key={i} className="border-b border-white/5 text-slate-300 align-top">
                      <th scope="row" className="p-2 text-left font-medium">{f.category}: {METRIC_LABEL[f.check] ?? f.check}{f.subject ? ` (${f.subject})` : ""}</th>
                      <td className="p-2">{f.value === null ? "n/a" : formatValue({ metric: f.check, value: f.value, unit: "" })}{f.threshold !== null && <span className="text-slate-500"> (threshold {f.threshold})</span>}</td>
                      <td className="p-2">{f.support_n ?? "-"}</td>
                      <td className="p-2">{f.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="font-semibold text-slate-100 mt-6 mb-2 text-sm">Key numbers by area</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {ex.categories.map((c) => (
              <div key={c.key} className="rounded-lg border border-white/10 p-3 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-100">{c.label}</span>
                  <StateBadge state={c.status} label={c.status_label.replace(/^Assessed: /, "")} />
                </div>
                <p className="text-slate-300">{c.headline}</p>
                {c.count_text && <p className="text-slate-500 mt-1">{c.count_text}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Vendors: {ex.governance.vendors} recorded, {ex.governance.vendors_sharing_personal_data} share personal data ({ex.governance.vendors_sharing_without_contract} with no contract on record). Data rights:{" "}
            {ex.governance.rights_procedures} procedures recorded, {ex.governance.rights_without_procedure} missing, {ex.governance.rights_never_tested} never tested.
          </p>
        </Panel>
      )}

      {rm && (
        <Panel title="Regulation mapping (DPDP Act 2023 and GDPR)">
          <p className="text-xs text-amber-200/90 mb-3">{rm.notice}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Audit areas and the provisions they support evidence for</caption>
              <thead><tr className="text-left text-slate-400 border-b border-white/10">
                <th scope="col" className="p-2 font-medium">Audit area</th><th scope="col" className="p-2 font-medium">Supports evidence for (DPDP)</th><th scope="col" className="p-2 font-medium">Supports evidence for (GDPR)</th>
              </tr></thead>
              <tbody>
                {rm.areas.map((a) => (
                  <tr key={a.key} className="border-b border-white/5 text-slate-300 align-top">
                    <th scope="row" className="p-2 text-left font-medium">{a.label}<div className="text-slate-500 font-normal">{a.coverage}</div></th>
                    <td className="p-2">{a.dpdp}</td>
                    <td className="p-2">{a.gdpr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(["DPDP", "GDPR"] as const).map((reg) => rm.controls[reg].length > 0 && (
            <div key={reg} className="mt-4">
              <h3 className="text-sm font-semibold text-slate-100 mb-1">{reg} readiness controls</h3>
              <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-300">
                {rm.controls[reg].map((c) => (
                  <li key={c.control_id}><span className="font-medium">{c.control_id}</span> {c.title} <span className="text-slate-500">({c.source})</span>: {c.status_text}</li>
                ))}
              </ul>
            </div>
          ))}
          {rm.controls.DPDP.length === 0 && rm.controls.GDPR.length === 0 && (
            <p className="text-xs text-slate-400 mt-3">No jurisdiction was selected for this system, so no control checklist was assessed.</p>
          )}
        </Panel>
      )}

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

      <Panel title="Full report (print or export)">
        <ReportFrame reportId={report.id} version={report.version} />
      </Panel>
    </PageShell>
  );
}