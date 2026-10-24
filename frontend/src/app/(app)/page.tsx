import Link from "next/link";
import { Activity, AlertTriangle, ClipboardList, Clock, Hourglass, Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CoverageStrip } from "@/components/audit/CoverageStrip";
import { LoadSampleButton } from "@/components/systems/LoadSampleButton";
import { EmptyState, ErrorState, Panel, buttonClass } from "@/components/ui/Panel";
import { api, errorMessage } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { Overview } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, icon: Icon }: { label: string; value: number; hint: string; icon: typeof Activity }) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" />
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{hint}</div>
    </div>
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
      subtitle="What has been checked, what needs review, and what is still open"
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Stat label="AI systems" value={data.totals.systems} hint="registered" icon={Activity} />
            <Stat label="Open findings" value={data.totals.open_findings} hint="not yet accepted or resolved" icon={AlertTriangle} />
            <Stat label="Awaiting review" value={data.totals.awaiting_review} hint="submitted by an owner" icon={Hourglass} />
            <Stat label="Overdue" value={data.totals.overdue_findings} hint="past their due date" icon={Clock} />
            <Stat label="Control gaps" value={data.totals.control_gaps} hint="privacy items needing evidence" icon={ClipboardList} />
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
                      <span>{s.control_gaps} control gaps</span>
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
                </Panel>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
