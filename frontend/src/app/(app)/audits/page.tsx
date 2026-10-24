import Link from "next/link";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { AuditsTable } from "@/components/audit/AuditsTable";
import { EmptyState, ErrorState, buttonClass } from "@/components/ui/Panel";
import { WhatThisShows } from "@/components/ui/WhatThisShows";
import { errorMessage, list } from "@/lib/server/api";
import type { AuditRun } from "@/lib/types";

export const dynamic = "force-dynamic";

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
      <WhatThisShows>
        Every audit ever run on your AI systems, newest first. Open one to see its bias, drift, explainability, privacy and governance results, or compare it with an earlier run of the same system.
      </WhatThisShows>
      {failure && <ErrorState message={failure} />}
      {!failure && runs.length === 0 && (
        <EmptyState title="No audits yet">Start one from the New audit button. Runs finish in about a minute for the sample data.</EmptyState>
      )}
      {runs.length > 0 && <AuditsTable runs={runs} />}
    </PageShell>
  );
}
