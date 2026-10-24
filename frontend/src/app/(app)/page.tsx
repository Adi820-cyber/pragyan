import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Hourglass, Inbox, Plus, Truck, UserCheck, UserX } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CoverageStrip } from "@/components/audit/CoverageStrip";
import { LoadSampleButton } from "@/components/systems/LoadSampleButton";
import { EmptyState, ErrorState, Panel, buttonClass } from "@/components/ui/Panel";
import { api, errorMessage } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { Overview } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, what, href, icon: Icon }: { label: string; value: number | string; hint: string; what: string; href: string; icon: typeof Activity }) {
  return (
    <Link href={href} className="glass-panel p-4 block hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-400">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" />
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{hint}</div>
      <p className="text-[11px] text-slate-400 mt-2 border-t border-white/10 pt-2"><strong className="text-slate-300">What this shows:</strong> {what}</p>
    </Link>
  );
}

export default async function OverviewPage() {
  let data: Overview | null = null;
  let failure: string | null = null;
  try {
    data = await api<Overview>("/ai/overview/");
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title="Overview"
      subtitle="What has been checked, what needs review, and what is still open. Every number links to the page it summarises."
      sample={data?.sample_mode}
      realData={data?.real_data_mode ? { source: "The COMPAS example uses ProPublica data from Broward County, Florida (2013-2014)." } : false}
      actions={
        <Link href="/audits/new" className={buttonClass}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New audit
        </Link>
      }
    >
      {failure && <ErrorState message={failure} />}
      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="AI systems" value={data.totals.systems} hint="registered, not archived" href="/systems" icon={Activity}
              what="How many AI systems are registered. Each one can be audited and given a privacy checklist." />
            <Stat label="Open findings" value={data.totals.open_findings} hint="not yet accepted or resolved" href="/findings" icon={AlertTriangle}
              what="Issues from audits that someone still has to fix or formally accept." />
            <Stat label="Awaiting review" value={data.totals.awaiting_review} hint="submitted by an owner" href="/findings" icon={Hourglass}
              what="Fixes an owner has submitted that a reviewer has not yet checked." />
            <Stat label="Overdue findings" value={data.totals.overdue_findings} hint="past their due date" href="/findings" icon={Clock}
              what="Open findings whose due date has passed." />
            <Stat label="Controls with reviewed evidence" value={data.controls.reviewed_pct === null ? "n/a" : `${data.controls.reviewed_pct}%`}
              hint={data.controls.applicable ? `${data.controls.reviewed} of ${data.controls.applicable} applicable items` : "no privacy checklist in use yet"} href="/controls" icon={ClipboardCheck}
              what="Share of applicable DPDP/GDPR checklist items where a reviewer judged the evidence adequate. It is not a compliance score." />
            <Stat label="Control gaps" value={data.totals.control_gaps} hint="privacy items still open" href="/controls" icon={ClipboardList}
              what="Checklist items that need evidence, wait for review, or have a recorded gap." />
            <Stat label="High-risk vendors" value={data.vendors.high_risk} hint={`of ${data.vendors.total} recorded; ${data.vendors.without_dpa} share data without a DPA on record`} href="/controls?tab=vendors" icon={Truck}
              what="Vendors where the recorded facts show a serious gap, such as personal data shared without a contract or no transfer mechanism." />
            <Stat label="Open data requests" value={data.requests.open} hint={`${data.requests.overdue} overdue, ${data.requests.due_in_7_days} due within 7 days`} href="/controls?tab=requests" icon={Inbox}
              what="Requests from people about their data that are not closed, and how many have missed their due date." />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Unassigned" value={data.totals.unassigned_findings} hint="open findings with no owner" href="/findings" icon={UserX}
              what="Open findings nobody has been asked to fix yet." />
            <Stat label="Assigned to me" value={data.totals.my_open_actions} hint={`${data.totals.my_overdue_actions} overdue`} href="/findings" icon={UserCheck}
              what="Open findings where you are the person asked to fix them." />
            <Stat label="Needs my review" value={data.totals.awaiting_my_review} hint="fixed by someone else" href="/findings" icon={Hourglass}
              what="Fixes submitted by someone else that you can review. You cannot approve your own work." />
            <Stat label="Closed" value={data.totals.closed_findings} hint="resolved or risk accepted" href="/findings" icon={CheckCircle2}
              what="Findings a reviewer approved as fixed, or formally accepted as a risk." />
          </div>

          {data.totals.active_runs > 0 && (
            <p role="status" className="text-xs text-sky-200">
              {data.totals.active_runs} audit{data.totals.active_runs > 1 ? "s are" : " is"} queued or running.{" "}
              <Link href="/audits" className="underline">
                View audits
              </Link>
            </p>
          )}

          {data.systems.length === 0 ? (
            <EmptyState title="No AI systems yet">
              <p className="mb-4">
                Register the system you want to check, or load an example: a synthetic LLM assistant log, or real public data from a deployed risk-scoring tool.
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-wrap items-center justify-center gap-3"><LoadSampleButton scenario="finsum" /><LoadSampleButton scenario="compas" /></div>
                <Link href="/systems" className="text-xs text-cyan-300 hover:text-cyan-200 underline">
                  Register a system
                </Link>
              </div>
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {data.systems.map((s) => (
                <Panel
                  key={s.id}
                  title={s.name}
                  action={
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>{s.open_findings} open findings</span>
                      <Link href={`/controls?tab=controls&system=${s.id}`} className="underline">
                        {s.control_gaps} control gaps{s.controls.reviewed_pct === null ? "" : `, ${s.controls.reviewed_pct}% reviewed`}
                      </Link>
                      {s.latest_run_id ? (
                        <Link href={`/audits/${s.latest_run_id}`} className="text-cyan-300 hover:text-cyan-200 underline">
                          Latest audit {dateTime(s.latest_run_at)}
                        </Link>
                      ) : (
                        <Link href={`/audits/new?system=${s.id}`} className="text-cyan-300 hover:text-cyan-200 underline">
                          Run first audit
                        </Link>
                      )}
                    </div>
                  }
                >
                  <CoverageStrip coverage={s.coverage} />
                  {!s.latest_run_id && <p className="text-xs text-slate-400">No audit has completed for this system, so there are no automated results yet.</p>}
                </Panel>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
