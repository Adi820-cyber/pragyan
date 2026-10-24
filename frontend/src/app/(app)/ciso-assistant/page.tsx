import { PageShell } from "@/components/layout/PageShell";
import { CisoAssistantView } from "./CisoAssistantView";

export const metadata = {
  title: "CISO Assistant GRC Suite | Reskure",
  description: "Community open-source all-in-one GRC platform for multi-framework compliance, decoupled crosswalks, and 5x5 risk quantification.",
};

export const dynamic = "force-dynamic";

export default function CisoAssistantPage() {
  return (
    <PageShell
      title="CISO Assistant GRC Suite"
      subtitle="Unified multi-framework compliance, decoupled control crosswalks ('Assess Once, Comply with Many'), and 5x5 risk quantification"
    >
      <CisoAssistantView />
    </PageShell>
  );
}
