"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, Database, Info, Layers, Lock, Network, Play, Radio, Server, Share2, ShieldAlert,
  ShieldCheck, Unlock, XCircle, Zap,
} from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { buttonClass, Field, ghostButtonClass, inputClass } from "@/components/ui/Panel";

export interface NetInterface {
  id: string;
  device: string;
  device_name: string;
  device_role: string;
  name: string;
  ip_address: string | null;
  mtu: number;
  is_pass_through: boolean;
}
export interface NetDevice {
  id: string;
  name: string;
  role: string;
  status: string;
  interfaces: NetInterface[];
}
export interface NetCable {
  id: string;
  label: string;
  status: string;
  termination_a_name: string;
  termination_b_name: string;
  is_encrypted: boolean;
}
interface Topology {
  tenant_name: string;
  devices: NetDevice[];
  cables: NetCable[];
  rules: { id: string }[];
}
export interface HopTelemetry {
  hop_number: number;
  device_name: string;
  device_role: string;
  interface_name: string;
  ip_address: string;
  cable_label: string;
  cable_type: string;
  bandwidth_gbps?: number;
  hop_latency_ms: number;
  cumulative_latency_ms: number;
  is_encrypted: boolean;
  mtu: number;
  mtu_issue?: string | null;
  action: string;
  notes: string;
}
export interface TraceResult {
  status: string;
  termination_reason: string;
  source: { device: string; role: string; interface: string; ip: string | null };
  destination: { device: string; role: string; interface: string; ip: string | null };
  protocol: string;
  destination_port: string;
  packet_size_bytes: number;
  payload_label: string;
  total_hops: number;
  total_latency_ms: number;
  bottleneck_mtu: number;
  unencrypted_hops: number;
  compliance_score: string;
  hops: HopTelemetry[];
}

/** Presets look their ports up by name in the stored network; a preset is only offered if its ports exist. */
const PRESETS = [
  { id: "ai-inference", title: "End-to-end AI inference path", description: "Ingress through the edge router, firewall, patch-panel cross-connect and top-of-rack switch to the inference host.",
    protocol: "HTTPS", port: 443, size: 1420, payload: "Applicant screening feature vector (personal data)", src: ["edge-rt", "Hundred"], dst: ["dgx-infer", "net0"], cut: [] as string[] },
  { id: "db-vector-sync", title: "High-bandwidth vector store sync", description: "Inference host writing embeddings to the vector database with jumbo frames.",
    protocol: "TCP", port: 5432, size: 8900, payload: "Embeddings and audit reference set", src: ["dgx-infer", "ib0"], dst: ["vectordb", "bond0"], cut: [] as string[] },
  { id: "firewall-drop", title: "Perimeter firewall drop", description: "Legacy Telnet probe against the inference host. Tests whether the firewall rule really matches.",
    protocol: "TCP", port: 23, size: 64, payload: "Telnet probe (unauthorised)", src: ["edge-rt", "Hundred"], dst: ["dgx-infer", "net0"], cut: [] as string[] },
  { id: "severed-cable", title: "What if the backbone trunk is cut?", description: "Assumes the core-to-patch-panel trunk is cut for this trace only. Nothing is changed in your records.",
    protocol: "HTTPS", port: 443, size: 1420, payload: "Client request", src: ["edge-rt", "Hundred"], dst: ["tor-sw", "Port-Channel"], cut: ["TRK-MPO-003"] },
];

const PROTOCOLS = ["HTTPS", "TCP", "UDP", "GRPC", "ICMP"];

function iconFor(role: string) {
  switch (role) {
    case "EDGE_ROUTER": return Radio;
    case "FIREWALL_WAF": return ShieldCheck;
    case "CORE_SWITCH":
    case "TOR_SWITCH": return Network;
    case "PATCH_PANEL": return Layers;
    case "LOAD_BALANCER": return Share2;
    case "COMPUTE_HOST": return Cpu;
    case "DATABASE_HOST": return Database;
    default: return Server;
  }
}

const STATUS_BADGE: Record<string, { label: string; tone: string; icon: typeof Activity }> = {
  DELIVERED: { label: "Delivered", tone: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300", icon: CheckCircle2 },
  BLOCKED_FIREWALL: { label: "Blocked by firewall", tone: "bg-amber-500/15 border-amber-500/40 text-amber-300", icon: ShieldAlert },
  SEVERED_CABLE: { label: "Cable cut: no signal", tone: "bg-rose-500/15 border-rose-500/40 text-rose-300", icon: XCircle },
  DROPPED: { label: "Dropped: device offline", tone: "bg-rose-500/15 border-rose-500/40 text-rose-300", icon: XCircle },
  DISCONNECTED: { label: "No path between these ports", tone: "bg-slate-500/15 border-slate-500/40 text-slate-300", icon: AlertTriangle },
  HOP_LIMIT_EXCEEDED: { label: "Hop limit exceeded", tone: "bg-slate-500/15 border-slate-500/40 text-slate-300", icon: AlertTriangle },
};

export function PacketTracerView() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [protocol, setProtocol] = useState("HTTPS");
  const [port, setPort] = useState(443);
  const [size, setSize] = useState(1420);
  const [payload, setPayload] = useState("Applicant screening feature vector (personal data)");
  const [cut, setCut] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const [result, setResult] = useState<TraceResult | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);
  const [activeHop, setActiveHop] = useState<number | null>(null);
  const [tab, setTab] = useState<"visual" | "telemetry" | "about">("visual");
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTopology(await call<Topology>("GET", "network/topology/"));
    } catch (e) {
      setLoadError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const interfaces = useMemo(() => (topology?.devices ?? []).flatMap((d) => d.interfaces), [topology]);
  const findPort = useCallback(
    (spec: string[]) => interfaces.find((i) => i.device_name.startsWith(spec[0]) && i.name.includes(spec[1])),
    [interfaces],
  );
  const availablePresets = useMemo(() => PRESETS.filter((p) => findPort(p.src) && findPort(p.dst)), [findPort]);

  // Pick sensible defaults once the network has loaded.
  useEffect(() => {
    if (!interfaces.length || sourceId) return;
    const first = availablePresets[0];
    setSourceId((first ? findPort(first.src) : interfaces[0])?.id ?? "");
    setDestId((first ? findPort(first.dst) : interfaces[interfaces.length - 1])?.id ?? "");
  }, [interfaces, availablePresets, findPort, sourceId]);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    const s = p && findPort(p.src);
    const d = p && findPort(p.dst);
    if (!p || !s || !d) return;
    setSelectedPreset(id);
    setSourceId(s.id);
    setDestId(d.id);
    setProtocol(p.protocol);
    setPort(p.port);
    setSize(p.size);
    setPayload(p.payload);
    setCut(p.cut);
    setResult(null);
    setTraceError(null);
  }

  async function seed(replace = false) {
    setSeeding(true);
    setLoadError(null);
    try {
      await call("POST", "network/demo/seed/", { replace });
      await load();
    } catch (e) {
      setLoadError(errText(e));
    } finally {
      setSeeding(false);
    }
  }

  async function runTrace() {
    setTracing(true);
    setTraceError(null);
    setActiveHop(null);
    try {
      const r = await call<TraceResult>("POST", "network/trace/", {
        source_interface_id: sourceId,
        destination_interface_id: destId,
        protocol,
        destination_port: port,
        packet_size_bytes: size,
        payload_label: payload,
        assume_severed_cables: cut,
      });
      setResult(r);
      for (let i = 0; i < r.hops.length; i++) {
        setActiveHop(i);
        await new Promise((res) => setTimeout(res, 180));
      }
    } catch (e) {
      setResult(null);
      setTraceError(errText(e));
    } finally {
      setTracing(false);
    }
  }

  const badge = result ? (STATUS_BADGE[result.status] ?? { label: result.status, tone: "bg-slate-500/15 border-slate-500/40 text-slate-300", icon: AlertTriangle }) : null;
  const toggleCut = (label: string) => setCut((c) => (c.includes(label) ? c.filter((x) => x !== label) : [...c, label]));

  if (loading) return <p role="status" className="text-sm text-slate-400">Loading the network...</p>;

  if (loadError)
    return (
      <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3">
        <p className="text-sm text-rose-200">{loadError}</p>
        <button type="button" onClick={load} className={ghostButtonClass}>Try again</button>
      </div>
    );

  if (!topology || topology.devices.length === 0)
    return (
      <div className="glass-panel p-10 text-center space-y-4">
        <Network className="w-8 h-8 text-slate-500 mx-auto" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-200">No network recorded yet</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Record devices, ports and cables through the API, or load a sample enterprise network (an administrator action) to try the tracer.
        </p>
        <button type="button" onClick={() => seed(false)} disabled={seeding} className={buttonClass}>
          {seeding ? "Loading..." : "Load the sample network"}
        </button>
      </div>
    );

  const hasUnencrypted = (result?.unencrypted_hops ?? 0) > 0;

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400 max-w-3xl">
        Follow a packet across the cabling, patch panels, firewalls and switches you have recorded for {topology.tenant_name}. The tracer reads your stored network and checks
        device status, firewall rules, cables, MTU and encryption flags along the way. It is a model built from your records: it does not send traffic, and it is only as accurate as the inventory.
      </p>

      <section aria-labelledby="presets-h" className="space-y-2">
        <h2 id="presets-h" className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" /> Preset scenarios
        </h2>
        {availablePresets.length === 0 ? (
          <p className="text-xs text-slate-500">Presets need the sample network. Choose ports yourself below.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {availablePresets.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p.id)} aria-pressed={selectedPreset === p.id}
                className={`text-left p-3.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${selectedPreset === p.id ? "bg-cyan-950/50 border-cyan-500/50" : "bg-slate-900/40 hover:bg-slate-900/70 border-white/10"}`}>
                <div className="font-semibold text-sm text-slate-100">{p.title}</div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{p.description}</p>
                <div className="mt-2 text-[11px] font-mono text-cyan-400/90">{p.protocol}:{p.port} · {p.size}B</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="cfg-h" className="glass-panel p-5 space-y-4">
        <h2 id="cfg-h" className="text-sm font-bold text-white">Trace settings</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="From (source port)" htmlFor="t_src">
            <select id="t_src" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass}>
              {(topology.devices).map((d) => (
                <optgroup key={d.id} label={`${d.name} (${d.role.replaceAll("_", " ").toLowerCase()})`}>
                  {d.interfaces.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="To (destination port)" htmlFor="t_dst">
            <select id="t_dst" value={destId} onChange={(e) => setDestId(e.target.value)} className={inputClass}>
              {(topology.devices).map((d) => (
                <optgroup key={d.id} label={`${d.name} (${d.role.replaceAll("_", " ").toLowerCase()})`}>
                  {d.interfaces.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Protocol" htmlFor="t_proto">
            <select id="t_proto" value={protocol} onChange={(e) => setProtocol(e.target.value)} className={inputClass}>
              {PROTOCOLS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Destination port" htmlFor="t_port">
            <input id="t_port" type="number" min={0} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Packet size (bytes)" htmlFor="t_size" hint={size > 1500 ? "Larger than a standard 1500-byte frame" : undefined}>
            <input id="t_size" type="number" min={64} max={65535} value={size} onChange={(e) => setSize(Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="What it carries" htmlFor="t_payload">
            <input id="t_payload" maxLength={200} value={payload} onChange={(e) => setPayload(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-slate-300">What if these cables were cut? (this trace only; nothing is saved)</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2">
            {topology.cables.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-xs text-slate-200">
                <input type="checkbox" checked={cut.includes(c.label)} onChange={() => toggleCut(c.label)} className="accent-cyan-500" />
                {c.label}{c.status !== "CONNECTED" ? ` (${c.status.toLowerCase()})` : ""}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <button type="button" onClick={runTrace} disabled={tracing || !sourceId || !destId} className={buttonClass}>
            <Play className={`w-4 h-4 ${tracing ? "animate-pulse" : ""}`} aria-hidden="true" />
            {tracing ? "Tracing..." : "Trace packet path"}
          </button>
          {traceError && <p role="alert" className="text-xs text-rose-300">{traceError}</p>}
        </div>
      </section>

      {!result && !traceError && (
        <p className="text-sm text-slate-400" role="status">Choose a preset or two ports, then trace. Nothing has been traced yet.</p>
      )}

      {result && badge && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4" aria-live="polite">
            <div className="glass-panel p-4 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Result</div>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${badge.tone}`}>
                <badge.icon className="w-4 h-4" aria-hidden="true" />
                <span>{badge.label}</span>
              </div>
              <p className="text-[11px] text-slate-400">{result.termination_reason}</p>
            </div>
            <div className="glass-panel p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Accumulated latency</span><Activity className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-white font-mono my-1.5">{result.total_latency_ms} <span className="text-sm font-normal text-slate-400">ms</span></div>
              <p className="text-[11px] text-slate-400">Across {result.total_hops} hop{result.total_hops === 1 ? "" : "s"}. Latency comes from the figures recorded for each cable.</p>
            </div>
            <div className="glass-panel p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Smallest MTU on the path</span><Layers className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-white font-mono my-1.5">{result.bottleneck_mtu} <span className="text-sm font-normal text-slate-400">bytes</span></div>
              <p className="text-[11px] text-slate-400">
                {result.packet_size_bytes > result.bottleneck_mtu ? "The packet is larger than the path MTU and would be fragmented." : "The packet fits without fragmentation."}
              </p>
            </div>
            <div className="glass-panel p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Transit encryption</span>
                {hasUnencrypted ? <Unlock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" /> : <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />}
              </div>
              <div className={`text-sm font-bold my-2 ${hasUnencrypted ? "text-amber-300" : "text-emerald-300"}`}>
                {hasUnencrypted ? `${result.unencrypted_hops} link${result.unencrypted_hops === 1 ? "" : "s"} recorded as unencrypted` : "Every traversed link is recorded as encrypted"}
              </div>
              <p className="text-[11px] text-slate-400">From the cable inventory. It has not been verified on the wire, and it is not a compliance finding by itself.</p>
            </div>
          </div>

          <div role="tablist" aria-label="Trace views" className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
            {([["visual", "Path"], ["telemetry", "Hop-by-hop table"], ["about", "How it works"]] as const).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 ${tab === key ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-slate-400 hover:text-white border border-transparent"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "visual" && (
            <div className="glass-panel p-6 space-y-6">
              <div className="overflow-x-auto py-6 px-4 bg-slate-950/60 rounded-xl border border-white/5">
                <ol className="flex items-start gap-4 min-w-max" aria-label="Hops in order">
                  {result.hops.map((hop, index) => {
                    const Icon = iconFor(hop.device_role);
                    const severed = hop.action === "CABLE_SEVERED";
                    const blocked = hop.action === "FIREWALL_DROP" || hop.action === "DROP_OFFLINE";
                    const delivered = hop.action === "DELIVERED";
                    const passive = hop.action === "PASS_THROUGH";
                    const active = activeHop === index;
                    const tone = severed ? "bg-rose-950/60 border-rose-500" : blocked ? "bg-amber-950/60 border-amber-500" : delivered ? "bg-emerald-950/60 border-emerald-500"
                      : passive ? "bg-purple-950/60 border-purple-400/80" : active ? "bg-cyan-950/80 border-cyan-400" : "bg-slate-900 border-white/15";
                    return (
                      <li key={hop.hop_number}>
                        <button type="button" onClick={() => setActiveHop(index)} aria-pressed={active}
                          className="flex flex-col items-center w-28 group focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg">
                          <span className="text-[10px] font-mono text-slate-400 mb-2 font-bold">HOP {hop.hop_number}</span>
                          <span className={`w-16 h-16 rounded-xl flex items-center justify-center border-2 transition-transform ${tone} ${active ? "scale-110" : ""}`}>
                            <Icon className="w-7 h-7 text-slate-100" aria-hidden="true" />
                          </span>
                          <span className="mt-3 text-center">
                            <span className="block text-xs font-semibold text-slate-200 truncate w-28">{hop.device_name.split(".")[0]}</span>
                            <span className="block text-[10px] font-mono text-slate-400 truncate w-28">{hop.interface_name}</span>
                            <span className="block text-[10px] text-cyan-400/80 font-mono mt-0.5">+{hop.hop_latency_ms} ms</span>
                            <span className="block text-[10px] text-slate-300 mt-0.5">{hop.action.replaceAll("_", " ").toLowerCase()}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {activeHop !== null && result.hops[activeHop] && (
                <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-white">Hop {result.hops[activeHop].hop_number}: {result.hops[activeHop].device_name}</span>
                    <span className="text-xs font-mono text-slate-400">Cumulative delay <strong className="text-cyan-300">{result.hops[activeHop].cumulative_latency_ms} ms</strong></span>
                  </div>
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div><dt className="text-slate-400">Port</dt><dd className="font-mono text-slate-200">{result.hops[activeHop].interface_name}</dd></div>
                    <div><dt className="text-slate-400">Cable</dt><dd className="font-mono text-slate-200">{result.hops[activeHop].cable_label} ({result.hops[activeHop].cable_type})</dd></div>
                    <div><dt className="text-slate-400">MTU</dt><dd className="font-mono text-slate-200">{result.hops[activeHop].mtu} bytes</dd></div>
                    <div>
                      <dt className="text-slate-400">Encryption (as recorded)</dt>
                      <dd className={`font-mono ${result.hops[activeHop].is_encrypted ? "text-emerald-400" : "text-amber-300"}`}>
                        {result.hops[activeHop].is_encrypted ? "Recorded as encrypted" : "Not encrypted"}
                      </dd>
                    </div>
                  </dl>
                  {result.hops[activeHop].mtu_issue && <p className="text-xs text-amber-200">{result.hops[activeHop].mtu_issue}</p>}
                  <p className="p-2.5 rounded-lg bg-black/40 text-xs text-slate-300 font-mono"><strong>Note:</strong> {result.hops[activeHop].notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === "telemetry" && (
            <div className="glass-panel overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Hops of the traced path</caption>
                <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
                  <tr>
                    <th scope="col" className="py-3 px-4">Hop</th><th scope="col" className="py-3 px-4">Device</th><th scope="col" className="py-3 px-4">Port</th>
                    <th scope="col" className="py-3 px-4">Cable</th><th scope="col" className="py-3 px-4">Delay</th><th scope="col" className="py-3 px-4">MTU</th>
                    <th scope="col" className="py-3 px-4">Action</th><th scope="col" className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {result.hops.map((hop) => (
                    <tr key={hop.hop_number}>
                      <th scope="row" className="py-3 px-4 font-bold text-cyan-400 text-left">#{hop.hop_number}</th>
                      <td className="py-3 px-4"><div className="font-sans font-semibold text-slate-200">{hop.device_name}</div><div className="text-[10px] text-slate-400">{hop.device_role}</div></td>
                      <td className="py-3 px-4 text-slate-300">{hop.interface_name}</td>
                      <td className="py-3 px-4"><div className="text-cyan-300">{hop.cable_label}</div><div className="text-[10px] text-slate-400">{hop.cable_type}</div></td>
                      <td className="py-3 px-4"><div>+{hop.hop_latency_ms} ms</div><div className="text-[10px] text-slate-400">{hop.cumulative_latency_ms} ms total</div></td>
                      <td className="py-3 px-4 text-slate-300">{hop.mtu} B</td>
                      <td className="py-3 px-4 text-slate-100">{hop.action.replaceAll("_", " ")}</td>
                      <td className="py-3 px-4 text-slate-300 font-sans">{hop.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "about" && (
            <div className="glass-panel p-6 grid md:grid-cols-3 gap-6 text-xs leading-relaxed">
              <div className="space-y-2"><h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2"><Info className="w-4 h-4" aria-hidden="true" /> Ports and cables</h3>
                <p className="text-slate-400">Every port is a termination point with its own MTU and address. A cable joins two ports and carries latency, bandwidth and an encryption flag. The tracer finds the shortest route over cables, passive patch-panel cross-connects and forwarding inside a device.</p></div>
              <div className="space-y-2"><h3 className="font-bold text-sm text-purple-300">What is checked on the way</h3>
                <p className="text-slate-400">At each device: whether it is online and whether a firewall rule drops or inspects the traffic (ports can be single, a list such as 23,3389, or a range such as 8000-9000). On each cable: whether it is cut, degraded or unencrypted. Along the path: the smallest MTU.</p></div>
              <div className="space-y-2"><h3 className="font-bold text-sm text-emerald-300">What it does not tell you</h3>
                <p className="text-slate-400">It reads your records. It does not send traffic or prove that encryption is active on the wire. Use it to find gaps in the inventory and in rules, then verify on the equipment. Unencrypted links matter to privacy law only in the context of the data they carry.</p></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
