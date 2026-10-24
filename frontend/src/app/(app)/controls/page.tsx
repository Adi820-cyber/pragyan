import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { ControlsBoard } from "@/components/controls/ControlsBoard";
import { VendorRegister } from "@/components/controls/VendorRegister";
import { RequestsRegister } from "@/components/controls/RequestsRegister";
import { EmptyState, ErrorState } from "@/components/ui/Panel";
import { api, errorMessage, getMe, list } from "@/lib/server/api";
import type { AISystem, ControlAssessment, ControlPack, DataSubjectRequest, Dependency, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "controls", label: "Controls" },
  { key: "vendors", label: "Vendors & processors" },
  { key: "requests", label: "Data-subject requests" },
] as const;

export default async function ControlsPage({ searchParams }: PageProps<"/controls">) {
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.tab)?.key ?? "controls";
  let systems: AISystem[] = [];
  let assessments: ControlAssessment[] = [];
  let packs: ControlPack[] = [];
  let vendors: Dependency[] = [];
  let requests: DataSubjectRequest[] = [];
  let people: Person[] = [];
  let role = "";
  let failure: string | null = null;
  let current: AISystem | undefined;
  try {
    const [s, p, me, members] = await Promise.all([list<AISystem>("/ai/systems/"), api<ControlPack[]>("/ai/control-packs/"), getMe(), api<Person[]>("/ai/members/")]);
    systems = s.filter((x) => x.status !== "ARCHIVED");
    packs = p;
    people = members;
    role = me.active_membership?.role ?? "";
    const wanted = typeof params.system === "string" ? params.system : undefined;
    // Default to a system that has a privacy checklist, so the page does not open on an empty state.
    current = systems.find((x) => x.id === wanted) ?? systems.find((x) => x.jurisdictions?.length) ?? systems[0];
    if (tab === "controls" && current) assessments = await list<ControlAssessment>(`/ai/control-assessments/?system=${current.id}`);
    if (tab === "vendors") vendors = await list<Dependency>("/ai/dependencies/");
    if (tab === "requests") requests = await list<DataSubjectRequest>("/ai/subject-requests/");
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell title="Privacy & Controls" subtitle="DPDP and GDPR readiness: what evidence exists, who reviewed it, and who the data goes to">
      {failure && <ErrorState message={failure} />}
      {!failure && systems.length === 0 && <EmptyState title="No AI systems yet">Register a system to get its privacy checklist.</EmptyState>}
      {!failure && systems.length > 0 && (
        <>
          <nav aria-label="Privacy sections" className="flex gap-2 border-b border-white/10 pb-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/controls?tab=${t.key}${current && t.key === "controls" ? `&system=${current.id}` : ""}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${t.key === tab ? "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30" : "text-slate-400 hover:text-slate-200 border border-transparent"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {tab === "controls" && (
            <>
              <nav aria-label="Choose a system" className="flex flex-wrap gap-2">
                {systems.map((s) => (
                  <Link
                    key={s.id}
                    href={`/controls?tab=controls&system=${s.id}`}
                    aria-current={s.id === current?.id ? "page" : undefined}
                    className={`rounded-full px-3 py-1 text-xs border ${s.id === current?.id ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
                  >
                    {s.name}
                  </Link>
                ))}
              </nav>
              {current && assessments.length === 0 && (
                <EmptyState title="No privacy checklist for this system">
                  No law is selected for it, so no DPDP or GDPR items apply.{" "}
                  <Link href={`/systems/${current.id}`} className="underline text-cyan-300">Edit the system</Link> to choose India DPDP, EU GDPR, or both.
                </EmptyState>
              )}
              {current && assessments.length > 0 && <ControlsBoard assessments={assessments} packs={packs} role={role} people={people} />}
            </>
          )}
          {tab === "vendors" && <VendorRegister vendors={vendors} systems={systems} role={role} />}
          {tab === "requests" && <RequestsRegister requests={requests} systems={systems} people={people} role={role} />}
        </>
      )}
    </PageShell>
  );
}
