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
    <PageShell
      title="Privacy & Governance Controls"
      subtitle="DPDP and GDPR readiness verification: evidence traceability, sign-offs, and compliance posture"
    >
      {failure && <ErrorState message={failure} />}

      {!failure && systems.length === 0 && (
        <EmptyState
          title="No active AI systems registered"
          description="Register an AI system to generate its regulatory privacy checklist under India DPDP and EU GDPR."
          action={
            <Link
              href="/systems"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 transition-colors"
            >
              Register system
            </Link>
          }
        />
      )}

      {systems.length > 0 && (
        <div className="space-y-4">
          <nav aria-label="System selector" className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 mr-1">System:</span>
            {systems.map((s) => {
              const isSelected = s.id === current?.id;
              return (
                <Link
                  key={s.id}
                  href={`/controls?system=${s.id}`}
                  aria-current={isSelected ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                    isSelected
                      ? "border-zinc-500 bg-zinc-800 text-zinc-100 shadow-xs"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {s.name}
                </Link>
              );
            })}
          </nav>

          {current && assessments.length === 0 && (
            <EmptyState
              title="No control frameworks enabled for this system"
              description="Edit this system to enable the India DPDP Act 2023, EU GDPR, or both control packs."
              action={
                <Link
                  href={`/systems/${current.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 transition-colors"
                >
                  Configure system checklists
                </Link>
              }
            />
          )}

          {current && assessments.length > 0 && (
            <ControlsBoard assessments={assessments} packs={packs} role={role} />
          )}
        </div>
      )}
    </PageShell>
  );
}
