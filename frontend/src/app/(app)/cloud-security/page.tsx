import { PageShell } from "@/components/layout/PageShell";
import { ErrorState } from "@/components/ui/Panel";
import { api, list, errorMessage } from "@/lib/server/api";
import type { CloudSecurityOverview, CloudAccount, CloudScan, CloudFinding } from "@/lib/types";
import { CloudSecurityDashboard } from "./CloudSecurityDashboard";

export const dynamic = "force-dynamic";

export default async function CloudSecurityPage() {
  let overview: CloudSecurityOverview | null = null;
  let accounts: CloudAccount[] = [];
  let scans: CloudScan[] = [];
  let findings: CloudFinding[] = [];
  let failure: string | null = null;

  try {
    const [ov, accs, scs, fnds] = await Promise.all([
      api<CloudSecurityOverview>("/cloud-security/overview/"),
      list<CloudAccount>("/cloud-security/accounts/"),
      list<CloudScan>("/cloud-security/scans/"),
      list<CloudFinding>("/cloud-security/findings/"),
    ]);
    overview = ov;
    accounts = accs;
    scans = scs;
    findings = fnds;
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell
      title="Cloud Security (Prowler)"
      subtitle="Automated cloud security posture management and CIS Benchmark scanning across AWS, Azure, and Google Cloud"
    >
      {failure && <ErrorState message={failure} />}
      {!failure && overview && (
        <CloudSecurityDashboard
          overview={overview}
          accounts={accounts}
          scans={scans}
          findings={findings}
        />
      )}
    </PageShell>
  );
}
