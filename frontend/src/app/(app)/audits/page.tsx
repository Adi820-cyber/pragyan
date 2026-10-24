import Link from "next/link";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { StateBadge } from "@/components/ui/StateBadge";
import { EmptyState, ErrorState, buttonClass } from "@/components/ui/Panel";
import { errorMessage, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AuditRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function Counts({ run }: { run: AuditRun }) {
  const review = Object.values(run.state_counts).reduce((n, c) => n + (c?.review_required ?? 0), 0);
  const errors = Object.values(run.state_counts).reduce((n, c) => n + (c?.error ?? 0), 0);
  if (run.status !== "completed") return <span className="text-xs text-zinc-500">—</span>;
  return (
    <span className="text-xs text-zinc-300 tabular-nums">
      {review > 0 ? (
        <strong className="text-amber-300 font-medium">{review} to review</strong>
      ) : (
        <span className="text-zinc-400">0 alerts</span>
      )}
      {errors > 0 ? <span className="text-red-400 ml-1">({errors} errors)</span> : ""}
    </span>
  );
}

export default async function AuditsPage() {
  let runs: AuditRun[] = [];
  let failure: string | null = null;
  try {
    runs = await list<AuditRun>("/ai/runs/");
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title="Audits"
      subtitle="Execution history, reproducible evaluation parameters, and recorded results"
      actions={
        <Link href="/audits/new" className={buttonClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New audit</span>
        </Link>
      }
    >
      {failure && <ErrorState message={failure} />}

      {!failure && runs.length === 0 && (
        <EmptyState
          title="No audits conducted yet"
          description="Create your first audit run by selecting an AI system, binding input datasets, and configuring fairness/drift policies."
          action={
            <Link href="/audits/new" className={buttonClass}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Configure first audit</span>
            </Link>
          }
        />
      )}

      {runs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Audit runs, newest first</caption>
              <thead className="bg-zinc-900/80 text-xs font-medium text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th scope="col" className="py-3 px-4">System</th>
                  <th scope="col" className="py-3 px-4">Model Version</th>
                  <th scope="col" className="py-3 px-4">Status</th>
                  <th scope="col" className="py-3 px-4">Review Items</th>
                  <th scope="col" className="py-3 px-4 text-right">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/audits/${r.id}`}
                        className="font-medium text-zinc-100 hover:text-white underline underline-offset-4 decoration-zinc-700 hover:decoration-zinc-300 transition-colors"
                      >
                        {r.system_name}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-300">
                      <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                        {r.model_version_label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StateBadge state={r.status} />
                    </td>
                    <td className="py-3.5 px-4">
                      <Counts run={r} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-400 text-right tabular-nums">
                      {dateTime(r.started_at ?? r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
