import { CisoAssistantView } from "./CisoAssistantView";

export const metadata = {
  title: "CISO Assistant GRC Suite | Reskure",
  description: "Community open-source all-in-one GRC platform for multi-framework compliance, decoupled crosswalks, and 5x5 risk quantification.",
};

export default function CisoAssistantPage() {
  return (
    <main id="main" className="flex-1 overflow-y-auto">
      <CisoAssistantView />
    </main>
  );
}
