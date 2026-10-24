import { PageShell } from "@/components/layout/PageShell";
import { PacketTracerView } from "./PacketTracerView";

export const metadata = {
  title: "Network paths | Reskure",
  description: "Trace how data travels across the cabling, firewalls and switches recorded for your AI infrastructure.",
};

export const dynamic = "force-dynamic";

export default function PacketTraversalPage() {
  return (
    <PageShell title="Network paths" subtitle="Where data travels between the systems you audit, and where it could be blocked, cut or unencrypted">
      <PacketTracerView />
    </PageShell>
  );
}
