import { PacketTracerView } from "./PacketTracerView";

export const metadata = {
  title: "Packet Traversal & Cable Path Tracer — Reskure",
  description: "Recursive physical and logical data packet traversal engine for enterprise infrastructure and AI pipelines.",
};

export default function PacketTraversalPage() {
  return (
    <div className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 flex-1 min-w-0">
      <header className="border-b border-zinc-800 pb-4">
        <h1 className="text-base font-semibold text-zinc-100 tracking-tight">Packet Traversal & Infrastructure Topology</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Verify physical and logical network hops, transit encryption boundaries, and MTU bottlenecks across AI inference pipelines.
        </p>
      </header>
      <PacketTracerView />
    </div>
  );
}
