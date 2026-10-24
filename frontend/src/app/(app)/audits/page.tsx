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
  if (run.status !== "completed") return <span className="text-xs text-slate-500">n/a</span>;
  return (
    <span className="text-xs text-slate-300">
      {review} to review{errors > 0 ? `, ${errors} errors` : ""}
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
      subtitle="Every run keeps its inputs, policy and results"
      actions={
        <Link href="/audits/new" className={buttonClass}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New audit
        </Link>
      }
    >
      {failure && <ErrorState message={failure} />}
      {!failure && runs.length === 0 && (
        <EmptyState title="No audits yet">Start one from the New audit button. Runs finish in about a minute for the sample data.</EmptyState>
      )}
      {runs.length > 0 && (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit runs, newest first</caption>
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                <th scope="col" className="p-3 font-medium">System</th>
                <th scope="col" className="p-3 font-medium">Model</th>
                <th scope="col" className="p-3 font-medium">Status</th>
                <th scope="col" className="p-3 font-medium">Outcome</th>
                <th scope="col" className="p-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="p-3">
                    <Link href={`/audits/${r.id}`} className="font-semibold text-cyan-300 hover:text-cyan-200">
                      {r.system_name}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-300">{r.model_version_label}</td>
                  <td className="p-3"><StateBadge state={r.status} /></td>
                  <td className="p-3"><Counts run={r} /></td>
                  <td className="p-3 text-xs text-slate-400">{dateTime(r.started_at ?? r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
