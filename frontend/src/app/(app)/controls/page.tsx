import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { ControlsBoard } from "@/components/controls/ControlsBoard";
import { EmptyState, ErrorState } from "@/components/ui/Panel";
import { api, errorMessage, getMe, list } from "@/lib/server/api";
import type { AISystem, ControlAssessment, ControlPack } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ControlsPage({ searchParams }: PageProps<"/controls">) {
  const params = await searchParams;
  let systems: AISystem[] = [];
  let assessments: ControlAssessment[] = [];
  let packs: ControlPack[] = [];
  let role = "";
  let failure: string | null = null;
  let current: AISystem | undefined;
  try {
    const [s, p, me] = await Promise.all([list<AISystem>("/ai/systems/"), api<ControlPack[]>("/ai/control-packs/"), getMe()]);
    systems = s.filter((x) => x.status !== "ARCHIVED");
    packs = p;
    role = me.active_membership?.role ?? "";
    const wanted = typeof params.system === "string" ? params.system : systems[0]?.id;
    current = systems.find((x) => x.id === wanted) ?? systems[0];
    if (current) assessments = await list<ControlAssessment>(`/ai/control-assessments/?system=${current.id}`);
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell title="Privacy & Controls" subtitle="DPDP and GDPR readiness: what evidence exists and who reviewed it">
      {failure && <ErrorState message={failure} />}
      {!failure && systems.length === 0 && <EmptyState title="No AI systems yet">Register a system to get its privacy checklist.</EmptyState>}
      {systems.length > 0 && (
        <nav aria-label="Choose a system" className="flex flex-wrap gap-2">
          {systems.map((s) => (
            <Link
              key={s.id}
              href={`/controls?system=${s.id}`}
              aria-current={s.id === current?.id ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs border ${s.id === current?.id ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      )}
      {current && assessments.length === 0 && (
        <EmptyState title="No checklist selected for this system">
          Edit the system to choose India DPDP, EU GDPR, or both.
        </EmptyState>
      )}
      {current && assessments.length > 0 && <ControlsBoard assessments={assessments} packs={packs} role={role} />}
    </PageShell>
  );
}
