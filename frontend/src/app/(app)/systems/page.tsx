import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { SystemForm } from "@/components/systems/SystemForm";
import { LoadSampleButton } from "@/components/systems/LoadSampleButton";
import { StateBadge } from "@/components/ui/StateBadge";
import { EmptyState, ErrorState, Panel } from "@/components/ui/Panel";
import { api, errorMessage, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AISystem, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SystemsPage() {
  let systems: AISystem[] = [];
  let people: Person[] = [];
  let failure: string | null = null;
  try {
    [systems, people] = await Promise.all([list<AISystem>("/ai/systems/"), api<Person[]>("/ai/members/")]);
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title="AI Systems Inventory"
      subtitle="Registered machine learning models, algorithmic systems, ownership assignments, and audit logs"
    >
      {failure && <ErrorState message={failure} />}

      {!failure && systems.length === 0 && (
        <EmptyState
          title="No AI systems registered yet"
          description="Register your AI system to begin running fairness audits, drift tracking, and DPDP/GDPR assessments, or seed a demonstration model."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              <LoadSampleButton scenario="finsum" label="Load FinSum Sample (LLM)" />
              <LoadSampleButton scenario="compas" label="Load COMPAS Dataset (Classifier)" />
            </div>
          }
        />
      )}

      {systems.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Registered AI systems inventory</caption>
              <thead className="bg-zinc-900/80 text-xs font-medium text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th scope="col" className="py-3 px-4">System Name & Purpose</th>
                  <th scope="col" className="py-3 px-4">Type</th>
                  <th scope="col" className="py-3 px-4">Owner</th>
                  <th scope="col" className="py-3 px-4">Reviewer</th>
                  <th scope="col" className="py-3 px-4">Latest Audit Run</th>
                  <th scope="col" className="py-3 px-4 text-right">Open Findings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {systems.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-4 min-w-[240px]">
                      <Link
                        href={`/systems/${s.id}`}
                        className="font-medium text-zinc-100 hover:text-white underline underline-offset-4 decoration-zinc-700 hover:decoration-zinc-300 transition-colors"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-zinc-400 max-w-sm truncate mt-0.5">{s.purpose}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-300">
                        {s.system_type === "llm" ? "LLM" : "Classifier"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-300">
                      {s.owner_name ?? <span className="text-zinc-500">Unassigned</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-300">
                      {s.reviewer_name ?? <span className="text-zinc-500">Unassigned</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {s.latest_run ? (
                        <Link
                          href={`/audits/${s.latest_run.id}`}
                          className="inline-flex items-center gap-2 hover:underline decoration-zinc-600"
                        >
                          <StateBadge state={s.latest_run.status} />
                          <span className="text-zinc-400 tabular-nums">
                            {dateTime(s.latest_run.finished_at)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-zinc-500">No audits run</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-right tabular-nums">
                      {s.open_findings > 0 ? (
                        <span className="font-semibold text-amber-300">{s.open_findings}</span>
                      ) : (
                        <span className="text-zinc-500">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!failure && (
        <Panel
          title="Register New AI System"
          subtitle="Declare architectural type, human oversight roles, and statutory regulatory requirements"
        >
          <SystemForm people={people} />
        </Panel>
      )}
    </PageShell>
  );
}
