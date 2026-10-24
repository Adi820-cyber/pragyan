import { PageShell } from "@/components/layout/PageShell";
import { FindingsBoard } from "@/components/findings/FindingsBoard";
import { EmptyState, ErrorState } from "@/components/ui/Panel";
import { api, errorMessage, getMe, list } from "@/lib/server/api";
import type { Finding, FindingSummary, Person } from "@/lib/types";

function Count({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="glass-panel p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${tone || "text-white"}`}>{value}</div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function FindingsPage() {
  let findings: Finding[] = [];
  let people: Person[] = [];
  let role = "";
  let membershipId = "";
  let summary: FindingSummary | null = null;
  let failure: string | null = null;
  try {
    const [f, p, me, s] = await Promise.all([
      list<Finding>("/ai/findings/"),
      api<Person[]>("/ai/members/"),
      getMe(),
      api<FindingSummary>("/ai/findings/summary/"),
    ]);
    findings = f;
    summary = s;
    people = p;
    role = me.active_membership?.role ?? "";
    membershipId = me.active_membership?.membership_id ?? "";
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell title="Findings & Actions" subtitle="Assign each issue to an owner, track the fix, and have a different person sign it off">
      {failure && <ErrorState message={failure} />}
      {!failure && findings.length === 0 && (
        <EmptyState title="No findings yet">Findings appear when an audit flags something for review.</EmptyState>
      )}
      {summary && findings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Count label="Open" value={summary.open} />
          <Count label="Unassigned" value={summary.unassigned} tone={summary.unassigned ? "text-amber-300" : ""} />
          <Count label="Overdue" value={summary.overdue} tone={summary.overdue ? "text-rose-300" : ""} />
          <Count label="Ready for review" value={summary.awaiting_review} />
          <Count label="Closed" value={summary.closed} tone="text-emerald-300" />
          <Count label="Assigned to me" value={summary.mine} />
          <Count label="Needs my review" value={summary.awaiting_my_review} />
        </div>
      )}
      {findings.length > 0 && <FindingsBoard findings={findings} people={people} role={role} myMembershipId={membershipId} />}
    </PageShell>
  );
}
