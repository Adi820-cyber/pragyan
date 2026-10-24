import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { SystemForm } from "@/components/systems/SystemForm";
import { LoadSampleButton } from "@/components/systems/LoadSampleButton";
import { StateBadge } from "@/components/ui/StateBadge";
import { EmptyState, ErrorState, Panel } from "@/components/ui/Panel";
import { WhatThisShows } from "@/components/ui/WhatThisShows";
import { SYSTEM_TYPE_LABEL, impactProfile } from "@/lib/systemProfile";
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
    <PageShell title="AI Systems" subtitle="The systems you audit, who owns them and who reviews them">
      <WhatThisShows>
        The AI systems your organisation has registered for auditing. For each one you can see its type, who owns and reviews it, how much scrutiny it needs, and the outcome of its latest audit.
        Impact profile is a quick guide worked out from the answers recorded about the system, not a legal risk classification.
        Open a system to manage its model versions, data, vendors and rights processes.
      </WhatThisShows>
      {failure && <ErrorState message={failure} />}
      {!failure && systems.length === 0 && (
        <EmptyState title="No AI systems yet">
          <p className="mb-3">Register your first system below, or load an example.</p>
          <div className="flex flex-wrap items-center justify-center gap-3"><LoadSampleButton scenario="finsum" /><LoadSampleButton scenario="compas" /></div>
        </EmptyState>
      )}
      {systems.length > 0 && (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered AI systems</caption>
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                <th scope="col" className="p-3 font-medium">System</th>
                <th scope="col" className="p-3 font-medium">Type</th>
                <th scope="col" className="p-3 font-medium">Impact profile</th>
                <th scope="col" className="p-3 font-medium">Owner</th>
                <th scope="col" className="p-3 font-medium">Reviewer</th>
                <th scope="col" className="p-3 font-medium">Latest audit</th>
                <th scope="col" className="p-3 font-medium">Open findings</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="p-3">
                    <Link href={`/systems/${s.id}`} className="font-semibold text-cyan-300 hover:text-cyan-200">
                      {s.name}
                    </Link>
                    <div className="text-xs text-slate-500 max-w-md truncate">{s.purpose}</div>
                  </td>
                  <td className="p-3 text-xs text-slate-300">{SYSTEM_TYPE_LABEL[s.system_type] ?? s.system_type}</td>
                  <td className="p-3 text-xs text-slate-300">
                    {impactProfile(s).label}
                    {impactProfile(s).reasons.length > 0 && <div className="text-slate-500 max-w-48">{impactProfile(s).reasons.join(", ")}</div>}
                  </td>
                  <td className="p-3 text-slate-300">{s.owner_name ?? "Not assigned"}</td>
                  <td className="p-3 text-slate-300">{s.reviewer_name ?? "Not assigned"}</td>
                  <td className="p-3">
                    {s.latest_run ? (
                      <Link href={`/audits/${s.latest_run.id}`} className="inline-flex items-center gap-2">
                        <StateBadge state={s.latest_run.status} />
                        <span className="text-xs text-slate-400">{dateTime(s.latest_run.finished_at)}</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">Never audited</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-300">{s.open_findings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!failure && (
        <Panel title="Register an AI system">
          <SystemForm people={people} />
        </Panel>
      )}
    </PageShell>
  );
}
