import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { StateBadge } from "@/components/ui/StateBadge";
import { EmptyState, ErrorState } from "@/components/ui/Panel";
import { errorMessage, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AuditRun } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  let runs: AuditRun[] = [];
  let failure: string | null = null;
  try {
    runs = (await list<AuditRun>("/ai/runs/")).filter((r) => r.status === "completed");
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title="Audit Reports & Attestations"
      subtitle="Exportable evidence packages, regulatory summaries, and differential comparison reports"
    >
      {failure && <ErrorState message={failure} />}

      {!failure && runs.length === 0 && (
        <EmptyState
          title="No completed audit reports yet"
          description="Reports are automatically compiled upon the completion of an audit run. Start an audit to generate your first attestation."
          action={
            <Link
              href="/audits/new"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 transition-colors"
            >
              Start an audit run
            </Link>
          }
        />
      )}

      {runs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden shadow-xs">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/reports/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-zinc-800/30 transition-colors group"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-sm text-zinc-100 group-hover:text-white underline underline-offset-4 decoration-zinc-700 group-hover:decoration-zinc-300 transition-colors">
                  {r.system_name}
                </span>
                <span className="text-xs font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300">
                  Model {r.model_version_label}
                </span>
                <StateBadge state={r.status} />
              </div>
              <span className="text-xs text-zinc-400 tabular-nums">
                Completed {dateTime(r.finished_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
