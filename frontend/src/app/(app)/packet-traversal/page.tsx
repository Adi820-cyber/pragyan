import { PacketTracerView } from "./PacketTracerView";

export const metadata = {
  title: "Packet Traversal & Cable Path Tracer | Reskure",
  description: "NetBox-inspired recursive physical and logical data packet traversal engine for enterprise infrastructure and AI pipelines.",
};

export default function PacketTraversalPage() {
  return (
    <main id="main" className="flex-1 overflow-y-auto">
      <PacketTracerView />
    </main>
  );
}
