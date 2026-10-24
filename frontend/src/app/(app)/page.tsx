import Link from "next/link";
import { Activity, AlertTriangle, ClipboardList, Clock, Hourglass, Plus, ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { CoverageStrip } from "@/components/audit/CoverageStrip";
import { LoadSampleButton } from "@/components/systems/LoadSampleButton";
import { EmptyState, ErrorState, buttonClass } from "@/components/ui/Panel";
import { api, errorMessage } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { Overview } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <Icon className="w-4 h-4 text-zinc-400" aria-hidden="true" />
      </div>
      <div className="text-2xl font-semibold text-zinc-100 mt-2 tabular-nums tracking-tight">{value}</div>
      <div className="text-[11px] text-zinc-400 mt-1">{hint}</div>
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
      subtitle="Operational readiness, open audit findings, and verification status"
      sample={data?.sample_mode}
      realData={
        data?.real_data_mode
          ? { source: "The COMPAS example uses ProPublica data from Broward County, Florida (2013-2014)." }
          : false
      }
      actions={
        <Link href="/audits/new" className={buttonClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New audit</span>
        </Link>
      }
    >
      {failure && <ErrorState message={failure} />}
      {data && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <section aria-label="System Metrics" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat label="AI systems" value={data.totals.systems} hint="Registered & active" icon={Activity} />
            <Stat
              label="Open findings"
              value={data.totals.open_findings}
              hint="Pending remediation"
              icon={AlertTriangle}
            />
            <Stat
              label="Awaiting review"
              value={data.totals.awaiting_review}
              hint="Submitted by owners"
              icon={Hourglass}
            />
            <Stat label="Overdue" value={data.totals.overdue_findings} hint="Past remediation SLA" icon={Clock} />
            <Stat
              label="Control gaps"
              value={data.totals.control_gaps}
              hint="Needing evidence/review"
              icon={ClipboardList}
            />
          </section>

          {/* Active Audit Execution Banner */}
          {data.totals.active_runs > 0 && (
            <div
              role="status"
              className="flex items-center justify-between p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs text-blue-200"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
                <span>
                  <strong>{data.totals.active_runs}</strong> audit{data.totals.active_runs > 1 ? "s are" : " is"}{" "}
                  currently queued or running.
                </span>
              </div>
              <Link
                href="/audits"
                className="inline-flex items-center gap-1 font-medium text-blue-100 hover:text-white underline underline-offset-4"
              >
                <span>View audits</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}

          {/* Systems Overview Section */}
          {data.systems.length === 0 ? (
            <EmptyState
              title="No AI systems registered yet"
              description="Register your first system to run automated fairness, drift, and privacy audits, or seed a demonstration dataset below."
              action={
                <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                  <LoadSampleButton scenario="finsum" label="Load FinSum Sample (LLM)" />
                  <LoadSampleButton scenario="compas" label="Load COMPAS Dataset (Classifier)" />
                  <Link
                    href="/systems"
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white px-3 py-2 border border-zinc-700 rounded-md bg-zinc-900 hover:bg-zinc-800 transition-colors"
                  >
                    Register custom system
                  </Link>
                </div>
              }
            />
          ) : (
            <section aria-labelledby="systems-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="systems-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Registered Systems ({data.systems.length})
                </h2>
                <Link
                  href="/systems"
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Manage all systems →
                </Link>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 divide-y divide-zinc-800/80 overflow-hidden">
                {data.systems.map((s) => (
                  <div key={s.id} className="p-4 md:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/systems/${s.id}`}
                          className="font-semibold text-sm text-zinc-100 hover:text-white transition-colors"
                        >
                          {s.name}
                        </Link>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                        <span className="tabular-nums">
                          <strong className="text-zinc-200">{s.open_findings}</strong> open findings
                        </span>
                        <span className="text-zinc-700">·</span>
                        <span className="tabular-nums">
                          <strong className="text-zinc-200">{s.control_gaps}</strong> control gaps
                        </span>
                        <span className="text-zinc-700">·</span>
                        {s.latest_run_id ? (
                          <Link
                            href={`/audits/${s.latest_run_id}`}
                            className="font-medium text-zinc-300 hover:text-white underline underline-offset-4 decoration-zinc-600 hover:decoration-zinc-300 transition-colors"
                          >
                            Latest audit ({dateTime(s.latest_run_at)})
                          </Link>
                        ) : (
                          <Link
                            href={`/audits/new?system=${s.id}`}
                            className="font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
                          >
                            Run first audit
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="pt-1">
                      <CoverageStrip coverage={s.coverage} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
