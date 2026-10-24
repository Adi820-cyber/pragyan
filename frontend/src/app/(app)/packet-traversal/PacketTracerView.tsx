"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Info,
  Layers,
  Lock,
  Network,
  Play,
  Radio,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  XCircle,
  Zap,
  Loader2,
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

const PRESETS = [
  {
    id: "ai-inference",
    title: "AI Inference Ingress Path",
    description: "Ingress through edge router, firewall inspection, patch-panel cross-connect to DGX inference host.",
    protocol: "HTTPS",
    port: 443,
    size: 1420,
    payload: "Screening feature vector (Personal PII payload)",
    src: ["edge-rt", "Hundred"],
    dst: ["dgx-infer", "net0"],
    cut: [] as string[],
  },
  {
    id: "db-vector-sync",
    title: "High-Bandwidth Vector DB Sync",
    description: "Inference worker synchronizing embeddings with Vector DB cluster over jumbo frame fabric.",
    protocol: "TCP",
    port: 5432,
    size: 8900,
    payload: "Embeddings vector & reference audit partition",
    src: ["dgx-infer", "ib0"],
    dst: ["vectordb", "bond0"],
    cut: [] as string[],
  },
  {
    id: "firewall-drop",
    title: "Perimeter Firewall Drop",
    description: "Legacy Telnet connection attempt targeting inference host. Validates perimeter block policy.",
    protocol: "TCP",
    port: 23,
    size: 64,
    payload: "Telnet probe (Unauthorized egress attempt)",
    src: ["edge-rt", "Hundred"],
    dst: ["dgx-infer", "net0"],
    cut: [] as string[],
  },
  {
    id: "severed-cable",
    title: "Core Backbone Severance Simulation",
    description: "Evaluates traversal behavior assuming core patch-panel trunk is disconnected.",
    protocol: "HTTPS",
    port: 443,
    size: 1420,
    payload: "API client request",
    src: ["edge-rt", "Hundred"],
    dst: ["tor-sw", "Port-Channel"],
    cut: ["TRK-MPO-003"],
  },
];

const PROTOCOLS = ["HTTPS", "TCP", "UDP", "GRPC", "ICMP"];

function iconFor(role: string) {
  switch (role) {
    case "EDGE_ROUTER":
      return Radio;
    case "FIREWALL_WAF":
      return ShieldCheck;
    case "CORE_SWITCH":
    case "TOR_SWITCH":
      return Network;
    case "PATCH_PANEL":
      return Layers;
    case "LOAD_BALANCER":
      return Share2;
    case "COMPUTE_HOST":
      return Cpu;
    case "DATABASE_HOST":
      return Database;
    default:
      return Server;
  }
}

const STATUS_BADGE: Record<string, { label: string; tone: string; icon: typeof Activity }> = {
  DELIVERED: {
    label: "Path Verified (Delivered)",
    tone: "bg-emerald-950/50 border-emerald-800/80 text-emerald-300",
    icon: CheckCircle2,
  },
  BLOCKED_FIREWALL: {
    label: "Dropped by Firewall Rule",
    tone: "bg-amber-950/50 border-amber-800/80 text-amber-300",
    icon: ShieldAlert,
  },
  SEVERED_CABLE: {
    label: "Link Severed / Broken Line",
    tone: "bg-red-950/50 border-red-800/80 text-red-300",
    icon: XCircle,
  },
  DROPPED: {
    label: "Device Offline / Link Down",
    tone: "bg-red-950/50 border-red-800/80 text-red-300",
    icon: XCircle,
  },
  DISCONNECTED: {
    label: "No Physical Path Found",
    tone: "bg-zinc-900 border-zinc-700 text-zinc-300",
    icon: AlertTriangle,
  },
  HOP_LIMIT_EXCEEDED: {
    label: "Routing Loop (Hop Limit)",
    tone: "bg-zinc-900 border-zinc-700 text-zinc-300",
    icon: AlertTriangle,
  },
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
    [interfaces]
  );
  const availablePresets = useMemo(() => PRESETS.filter((p) => findPort(p.src) && findPort(p.dst)), [findPort]);

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
        await new Promise((res) => setTimeout(res, 120));
      }
    } catch (e) {
      setResult(null);
      setTraceError(errText(e));
    } finally {
      setTracing(false);
    }
  }

  const badge = result
    ? STATUS_BADGE[result.status] ?? {
        label: result.status,
        tone: "bg-zinc-900 border-zinc-700 text-zinc-300",
        icon: AlertTriangle,
      }
    : null;

  const toggleCut = (label: string) =>
    setCut((c) => (c.includes(label) ? c.filter((x) => x !== label) : [...c, label]));

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 p-8 text-xs text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        <span>Loading network topology records...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 p-4 space-y-3">
        <p className="text-xs text-red-200">{loadError}</p>
        <button type="button" onClick={load} className={ghostButtonClass}>
          Retry loading topology
        </button>
      </div>
    );
  }

  if (!topology || topology.devices.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-10 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
          <Network className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-semibold text-zinc-100">No Network Devices or Interfaces Recorded</h2>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Record hardware devices, physical interfaces, and cables via API, or initialize the demonstration enterprise topology.
        </p>
        <div className="pt-2">
          <button type="button" onClick={() => seed(false)} disabled={seeding} className={buttonClass}>
            {seeding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Seeding topology...</span>
              </>
            ) : (
              <span>Load Demonstration Topology</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  const hasUnencrypted = (result?.unencrypted_hops ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Preset Evaluation Scenarios */}
      <section aria-labelledby="presets-h" className="space-y-2.5">
        <h2 id="presets-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
          <span>Preset Demonstration Scenarios</span>
        </h2>
        {availablePresets.length === 0 ? (
          <p className="text-xs text-zinc-500">Presets require the demo topology. Configure endpoints below.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {availablePresets.map((p) => {
              const isSelected = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  aria-pressed={isSelected}
                  className={`text-left p-3.5 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer ${
                    isSelected
                      ? "border-zinc-400 bg-zinc-800 text-zinc-100 shadow-xs"
                      : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/30 hover:border-zinc-700 text-zinc-300"
                  }`}
                >
                  <div className="font-semibold text-xs text-zinc-100">{p.title}</div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{p.description}</p>
                  <div className="mt-2 text-[10px] font-mono text-zinc-300 bg-zinc-950/80 px-1.5 py-0.5 rounded border border-zinc-800 inline-block">
                    {p.protocol}:{p.port} · {p.size}B
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Traversal Configuration Console */}
      <section aria-labelledby="cfg-h" className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <h2 id="cfg-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Trace Parameters & Ingress Configuration
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Source Interface (Egress / Ingress)" htmlFor="t_src">
            <select id="t_src" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass}>
              {topology.devices.map((d) => (
                <optgroup key={d.id} label={`${d.name} (${d.role.replaceAll("_", " ").toLowerCase()})`}>
                  {d.interfaces.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.ip_address ? `(${i.ip_address})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Destination Interface (Target)" htmlFor="t_dst">
            <select id="t_dst" value={destId} onChange={(e) => setDestId(e.target.value)} className={inputClass}>
              {topology.devices.map((d) => (
                <optgroup key={d.id} label={`${d.name} (${d.role.replaceAll("_", " ").toLowerCase()})`}>
                  {d.interfaces.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.ip_address ? `(${i.ip_address})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Network Protocol" htmlFor="t_proto">
            <select id="t_proto" value={protocol} onChange={(e) => setProtocol(e.target.value)} className={inputClass}>
              {PROTOCOLS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Target Port" htmlFor="t_port">
            <input
              id="t_port"
              type="number"
              min={0}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field
            label="Packet Size (Bytes)"
            htmlFor="t_size"
            hint={size > 1500 ? "Jumbo Frame (>1500B)" : undefined}
          >
            <input
              id="t_size"
              type="number"
              min={64}
              max={65535}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Payload Label / Sensitivity" htmlFor="t_payload">
            <input
              id="t_payload"
              maxLength={200}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <fieldset className="pt-1 border-t border-zinc-800">
          <legend className="text-xs font-medium text-zinc-300 mb-2">
            Simulate Cable Cuts / Degraded Links (Ephemeral Simulation)
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {topology.cables.map((c) => {
              const isCut = cut.includes(c.label);
              return (
                <label
                  key={c.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                    isCut
                      ? "border-red-500 bg-red-950/60 text-red-200 font-semibold"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isCut}
                    onChange={() => toggleCut(c.label)}
                    className="sr-only"
                  />
                  <span>
                    {c.label} {c.status !== "CONNECTED" ? `(${c.status.toLowerCase()})` : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={runTrace}
            disabled={tracing || !sourceId || !destId}
            className={buttonClass}
          >
            {tracing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{tracing ? "Tracing hops..." : "Trace Data Packet Route"}</span>
          </button>
          {traceError && (
            <div role="alert" className="text-xs text-red-400">
              {traceError}
            </div>
          )}
        </div>
      </section>

      {!result && !traceError && (
        <div className="p-8 rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-400">
          Select a test scenario preset or specify source and destination ports to initiate path analysis.
        </div>
      )}

      {/* Traversal Results & Hop Telemetry */}
      {result && badge && (
        <div className="space-y-5">
          {/* Top Telemetry KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-live="polite">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Termination Outcome
              </div>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-semibold ${badge.tone}`}>
                <badge.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{badge.label}</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{result.termination_reason}</p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <span>Cumulative Latency</span>
                <Activity className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              </div>
              <div className="text-2xl font-semibold text-zinc-100 font-mono tabular-nums">
                {result.total_latency_ms} <span className="text-xs font-normal text-zinc-400">ms</span>
              </div>
              <p className="text-[11px] text-zinc-400 tabular-nums">
                Measured across {result.total_hops} physical/logical hop{result.total_hops === 1 ? "" : "s"}.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <span>Bottleneck MTU</span>
                <Layers className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
              </div>
              <div className="text-2xl font-semibold text-zinc-100 font-mono tabular-nums">
                {result.bottleneck_mtu} <span className="text-xs font-normal text-zinc-400">bytes</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {result.packet_size_bytes > result.bottleneck_mtu
                  ? "Packet size exceeds smallest MTU (Fragmentation required)."
                  : "Packet fits without fragmentation."}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <span>Transit Encryption</span>
                {hasUnencrypted ? (
                  <Unlock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                )}
              </div>
              <div
                className={`text-xs font-semibold my-1.5 ${
                  hasUnencrypted ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {hasUnencrypted
                  ? `${result.unencrypted_hops} unencrypted link${result.unencrypted_hops === 1 ? "" : "s"} on route`
                  : "Traversed links flagged encrypted"}
              </div>
              <p className="text-[11px] text-zinc-400">
                Evaluated against recorded cable flags in infrastructure database.
              </p>
            </div>
          </div>

          {/* Sub-view switcher */}
          <div role="tablist" aria-label="Trace telemetry views" className="flex gap-1 border-b border-zinc-800 pb-2">
            {([
              ["visual", "Interactive Hop Flow"],
              ["telemetry", "Hop-by-Hop Telemetry Table"],
              ["about", "Architecture & Rules"],
            ] as const).map(([key, label]) => {
              const isSelected = tab === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setTab(key)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer ${
                    isSelected
                      ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {tab === "visual" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
              <div className="overflow-x-auto py-4 px-3 bg-zinc-950/80 rounded-md border border-zinc-800">
                <ol className="flex items-start gap-4 min-w-max" aria-label="Traversal order">
                  {result.hops.map((hop, index) => {
                    const Icon = iconFor(hop.device_role);
                    const severed = hop.action === "CABLE_SEVERED";
                    const blocked = hop.action === "FIREWALL_DROP" || hop.action === "DROP_OFFLINE";
                    const delivered = hop.action === "DELIVERED";
                    const passive = hop.action === "PASS_THROUGH";
                    const active = activeHop === index;

                    const tone = severed
                      ? "bg-red-950/60 border-red-500 text-red-200"
                      : blocked
                      ? "bg-amber-950/60 border-amber-500 text-amber-200"
                      : delivered
                      ? "bg-emerald-950/60 border-emerald-500 text-emerald-200"
                      : passive
                      ? "bg-zinc-900 border-zinc-700 text-zinc-400"
                      : active
                      ? "bg-zinc-800 border-zinc-200 text-zinc-100 shadow-sm"
                      : "bg-zinc-900/80 border-zinc-800 text-zinc-400";

                    return (
                      <li key={hop.hop_number}>
                        <button
                          type="button"
                          onClick={() => setActiveHop(index)}
                          aria-pressed={active}
                          className="flex flex-col items-center w-28 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-md p-1 cursor-pointer"
                        >
                          <span className="text-[10px] font-mono text-zinc-400 mb-1.5 font-semibold tabular-nums">
                            HOP #{hop.hop_number}
                          </span>
                          <span
                            className={`w-14 h-14 rounded-md flex items-center justify-center border transition-all ${tone} ${
                              active ? "ring-2 ring-zinc-300 scale-105" : ""
                            }`}
                          >
                            <Icon className="w-6 h-6" aria-hidden="true" />
                          </span>
                          <span className="mt-2 text-center w-28">
                            <span className="block text-xs font-semibold text-zinc-100 truncate">
                              {hop.device_name.split(".")[0]}
                            </span>
                            <span className="block text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                              {hop.interface_name}
                            </span>
                            <span className="block text-[10px] text-zinc-300 font-mono tabular-nums mt-0.5">
                              +{hop.hop_latency_ms} ms
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {activeHop !== null && result.hops[activeHop] && (
                <div className="p-4 rounded-md border border-zinc-700 bg-zinc-900/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                    <span className="text-xs font-semibold text-zinc-100">
                      Hop {result.hops[activeHop].hop_number}: {result.hops[activeHop].device_name} (
                      {result.hops[activeHop].device_role})
                    </span>
                    <span className="text-xs font-mono text-zinc-400 tabular-nums">
                      Cumulative Delay:{" "}
                      <strong className="text-zinc-100">{result.hops[activeHop].cumulative_latency_ms} ms</strong>
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <dt className="text-zinc-400">Interface</dt>
                      <dd className="font-mono text-zinc-200 mt-0.5">{result.hops[activeHop].interface_name}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400">Interconnect Cable</dt>
                      <dd className="font-mono text-zinc-200 mt-0.5">
                        {result.hops[activeHop].cable_label} ({result.hops[activeHop].cable_type})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400">Interface MTU</dt>
                      <dd className="font-mono text-zinc-200 mt-0.5 tabular-nums">
                        {result.hops[activeHop].mtu} bytes
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400">Link Security</dt>
                      <dd
                        className={`font-mono text-xs mt-0.5 ${
                          result.hops[activeHop].is_encrypted ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {result.hops[activeHop].is_encrypted ? "Encrypted Cable" : "Unencrypted Medium"}
                      </dd>
                    </div>
                  </dl>

                  {result.hops[activeHop].mtu_issue && (
                    <div className="text-xs text-amber-300 p-2 rounded bg-amber-950/40 border border-amber-800/60">
                      {result.hops[activeHop].mtu_issue}
                    </div>
                  )}

                  <p className="p-2.5 rounded bg-zinc-950 text-xs text-zinc-300 font-mono">
                    <strong className="text-zinc-400">Audit Observation:</strong> {result.hops[activeHop].notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "telemetry" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Detailed hop telemetry</caption>
                  <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th scope="col" className="py-2.5 px-3">Hop</th>
                      <th scope="col" className="py-2.5 px-3">Device & Role</th>
                      <th scope="col" className="py-2.5 px-3">Interface</th>
                      <th scope="col" className="py-2.5 px-3">Cable</th>
                      <th scope="col" className="py-2.5 px-3 text-right">Hop Delay</th>
                      <th scope="col" className="py-2.5 px-3 text-right">Path Delay</th>
                      <th scope="col" className="py-2.5 px-3 text-right">MTU</th>
                      <th scope="col" className="py-2.5 px-3">Action</th>
                      <th scope="col" className="py-2.5 px-3">Observation Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {result.hops.map((hop) => (
                      <tr key={hop.hop_number} className="hover:bg-zinc-800/20">
                        <th scope="row" className="py-2.5 px-3 font-semibold text-zinc-100 tabular-nums">
                          #{hop.hop_number}
                        </th>
                        <td className="py-2.5 px-3 font-sans">
                          <div className="font-medium text-zinc-200">{hop.device_name}</div>
                          <div className="text-[10px] text-zinc-400">{hop.device_role}</div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">{hop.interface_name}</td>
                        <td className="py-2.5 px-3">
                          <div className="text-zinc-200">{hop.cable_label}</div>
                          <div className="text-[10px] text-zinc-500">{hop.cable_type}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">
                          +{hop.hop_latency_ms} ms
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-zinc-100 font-semibold">
                          {hop.cumulative_latency_ms} ms
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">
                          {hop.mtu} B
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="text-[11px] font-medium text-zinc-200 capitalize">
                            {hop.action.replaceAll("_", " ").toLowerCase()}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans text-zinc-400 max-w-xs truncate">
                          {hop.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "about" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 grid md:grid-cols-3 gap-6 text-xs leading-relaxed">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                  <Info className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                  <span>Interfaces & Cabling</span>
                </h3>
                <p className="text-zinc-400">
                  Every interface represents a physical or logical termination point bound to an MTU and subnet. Cables join pairs of interfaces and model propagation latency, nominal bandwidth, and transit encryption.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-zinc-100">
                  Security Inspection Rules
                </h3>
                <p className="text-zinc-400">
                  Evaluates device power state and active stateless/stateful firewall filters. Inspects destination port lists and port ranges against ingress rules to test perimeter defense.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-zinc-100">
                  Compliance Scope
                </h3>
                <p className="text-zinc-400">
                  Path traversal constructs an architectural model from registered DCIM inventory. Unencrypted links provide evidence for risk assessments, but wire-level verification remains necessary for full SOC2/ISO audit sign-off.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
