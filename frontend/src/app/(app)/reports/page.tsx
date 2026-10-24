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
    <PageShell title="Reports" subtitle="Exportable evidence for a customer, investor or reviewer">
      {failure && <ErrorState message={failure} />}
      {!failure && runs.length === 0 && <EmptyState title="No reports yet">A report is available once an audit has completed.</EmptyState>}
      {runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}`} className="flex flex-wrap items-center gap-4 glass-panel p-4">
                <span className="font-semibold text-cyan-300">{r.system_name}</span>
                <span className="text-sm text-slate-300">model {r.model_version_label}</span>
                <StateBadge state={r.status} />
                <span className="text-xs text-slate-400 ml-auto">{dateTime(r.finished_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
