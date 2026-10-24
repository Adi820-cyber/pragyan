import { PageShell } from "@/components/layout/PageShell";
import { FindingsBoard } from "@/components/findings/FindingsBoard";
import { EmptyState, ErrorState } from "@/components/ui/Panel";
import { api, errorMessage, getMe, list } from "@/lib/server/api";
import type { Finding, Person } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FindingsPage() {
  let findings: Finding[] = [];
  let people: Person[] = [];
  let role = "";
  let membershipId = "";
  let failure: string | null = null;
  try {
    const [f, p, me] = await Promise.all([list<Finding>("/ai/findings/"), api<Person[]>("/ai/members/"), getMe()]);
    findings = f;
    people = p;
    role = me.active_membership?.role ?? "";
    membershipId = me.active_membership?.membership_id ?? "";
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell title="Findings & Actions" subtitle="Who is acting on each issue, and who signed off">
      {failure && <ErrorState message={failure} />}
      {!failure && findings.length === 0 && (
        <EmptyState title="No findings yet">Findings appear when an audit flags something for review.</EmptyState>
      )}
      {findings.length > 0 && <FindingsBoard findings={findings} people={people} role={role} myMembershipId={membershipId} />}
    </PageShell>
  );
}
