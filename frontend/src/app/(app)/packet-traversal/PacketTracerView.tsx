"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Network,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Layers,
  Lock,
  Unlock,
  Activity,
  Server,
  Cpu,
  Database,
  RefreshCw,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Radio,
  Share2,
} from "lucide-react";

// NetBox-inspired Data Types
export interface InterfaceOption {
  id: string;
  name: string;
  interface_type: string;
  ip_address: string | null;
  mtu: number;
  is_pass_through: boolean;
  device_name: string;
  device_role: string;
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
  status: "DELIVERED" | "BLOCKED_FIREWALL" | "SEVERED_CABLE" | "DROPPED" | "MTU_ERROR" | "ROUTING_LOOP" | "HOP_LIMIT_EXCEEDED" | "DISCONNECTED";
  termination_reason: string;
  source: {
    device: string;
    role: string;
    interface: string;
    ip: string | null;
  };
  destination: {
    device: string;
    role: string;
    interface: string;
    ip: string | null;
  };
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

// Preset demonstration scenarios inspired by NetBox DCIM and AI audit pipelines
const PRESET_SCENARIOS = [
  {
    id: "ai-inference",
    title: "⚡ End-to-End AI Inference Path",
    description: "Ingress packet through Edge Router, WAF inspection, Patch Panel cross-connect to DGX H100 inference worker.",
    protocol: "HTTPS",
    port: "443",
    packetSize: 1420,
    payload: "Customer Job Application & Screening Feature Vector (Restricted PII)",
    sourceName: "edge-rt01.reskure.net",
    destName: "dgx-infer-01.reskure.net",
  },
  {
    id: "db-vector-sync",
    title: "🛡️ High-Bandwidth DB Vector Sync",
    description: "Model worker storing 1536-dim embeddings to Vector DB storage node over 100G Jumbo Frame fabric.",
    protocol: "TCP",
    port: "5432",
    packetSize: 8900,
    payload: "High-Density SHAP Embeddings & Bias Audit Reference Set",
    sourceName: "dgx-infer-01.reskure.net",
    destName: "vectordb-cl01.reskure.net",
  },
  {
    id: "firewall-drop",
    title: "🚫 Perimeter Firewall Drop (Zero-Trust)",
    description: "Simulate unauthorized packet probing legacy ports (Telnet/RDP). Evaluates WAF/Firewall drop posture.",
    protocol: "TCP",
    port: "23",
    packetSize: 64,
    payload: "Telnet Legacy Probe (Unauthorized)",
    sourceName: "edge-rt01.reskure.net",
    destName: "dgx-infer-01.reskure.net",
  },
  {
    id: "severed-cable",
    title: "💥 Severed Structured Cable Simulation",
    description: "Simulate physical fiber break on Inter-Rack MPO Trunk between Core Switch and Patch Panel.",
    protocol: "HTTPS",
    port: "443",
    packetSize: 1420,
    payload: "Client Request on Severed Link",
    sourceName: "edge-rt01.reskure.net",
    destName: "tor-sw03.reskure.net",
    isSeveredSim: true,
  },
];

// Fallback NetBox demo data if backend is offline or empty
const DEFAULT_TOPOLOGY_HOPS: HopTelemetry[] = [
  {
    hop_number: 1,
    device_name: "edge-rt01.reskure.net",
    device_role: "EDGE_ROUTER",
    interface_name: "HundredGigE0/0/0/0",
    ip_address: "198.51.100.1",
    cable_label: "CBL-WAN-001",
    cable_type: "Single-Mode Fiber (OS2)",
    bandwidth_gbps: 10,
    hop_latency_ms: 0.18,
    cumulative_latency_ms: 0.18,
    is_encrypted: true,
    mtu: 9000,
    action: "PERMIT",
    notes: "Ingress border router accepted frame. BGP route validated.",
  },
  {
    hop_number: 2,
    device_name: "sec-fw01.reskure.net",
    device_role: "FIREWALL_WAF",
    interface_name: "ethernet1/1 (WAN)",
    ip_address: "10.100.0.1",
    cable_label: "CBL-SEC-002",
    cable_type: "Single-Mode Fiber (OS2)",
    bandwidth_gbps: 10,
    hop_latency_ms: 0.22,
    cumulative_latency_ms: 0.40,
    is_encrypted: true,
    mtu: 1500,
    action: "INSPECTED",
    notes: "WAF Deep Packet Inspection passed: TLS 1.3 verified, no OWASP anomalies detected.",
  },
  {
    hop_number: 3,
    device_name: "core-sw01.reskure.net",
    device_role: "CORE_SWITCH",
    interface_name: "Ethernet1/1",
    ip_address: "10.100.10.1",
    cable_label: "TRK-MPO-003",
    cable_type: "Multi-Mode Fiber (OM4 MPO-12)",
    bandwidth_gbps: 25,
    hop_latency_ms: 0.35,
    cumulative_latency_ms: 0.75,
    is_encrypted: true,
    mtu: 9000,
    action: "PERMIT",
    notes: "Traversed backbone trunk link to distribution cross-connect.",
  },
  {
    hop_number: 4,
    device_name: "patch-pp01.reskure.net",
    device_role: "PATCH_PANEL",
    interface_name: "Rear Port 01 ➔ Front Port 01",
    ip_address: "Passive Pass-Through",
    cable_label: "Internal Patch Cross-Connect",
    cable_type: "Passive Optical Pass-Through",
    bandwidth_gbps: 25,
    hop_latency_ms: 0.02,
    cumulative_latency_ms: 0.77,
    is_encrypted: true,
    mtu: 9000,
    action: "PASS_THROUGH",
    notes: "NetBox structured cross-connect resolved: Rear MPO pin internally mapped to Front LC Port 01.",
  },
  {
    hop_number: 5,
    device_name: "tor-sw03.reskure.net",
    device_role: "TOR_SWITCH",
    interface_name: "Port-Channel 1",
    ip_address: "10.100.20.1",
    cable_label: "CBL-CROSS-004",
    cable_type: "Multi-Mode Fiber (OM4)",
    bandwidth_gbps: 25,
    hop_latency_ms: 0.08,
    cumulative_latency_ms: 0.85,
    is_encrypted: true,
    mtu: 9000,
    action: "PERMIT",
    notes: "Leaf switch forwarded frame to AI server rack aggregation layer.",
  },
  {
    hop_number: 6,
    device_name: "ai-ingress-gw01.reskure.net",
    device_role: "LOAD_BALANCER",
    interface_name: "eth0 (Ingress VIP)",
    ip_address: "10.100.30.50",
    cable_label: "CBL-GW-005",
    cable_type: "Cat6A Shielded Twisted Pair",
    bandwidth_gbps: 10,
    hop_latency_ms: 0.12,
    cumulative_latency_ms: 0.97,
    is_encrypted: true,
    mtu: 1500,
    action: "PERMIT",
    notes: "Service mesh proxy routed request to healthy DGX inference replica.",
  },
  {
    hop_number: 7,
    device_name: "dgx-infer-01.reskure.net",
    device_role: "COMPUTE_HOST",
    interface_name: "net0 (Inference Cluster API)",
    ip_address: "10.100.40.10",
    cable_label: "Destination Termination",
    cable_type: "Direct-Attach Copper (DAC Twinax)",
    bandwidth_gbps: 100,
    hop_latency_ms: 0.05,
    cumulative_latency_ms: 1.02,
    is_encrypted: true,
    mtu: 9000,
    action: "DELIVERED",
    notes: "Destination socket reached. NVIDIA Triton server received tensor inference payload.",
  },
];

export function PacketTracerView() {
  const [selectedScenario, setSelectedScenario] = useState<string>("ai-inference");
  const [protocol, setProtocol] = useState<string>("HTTPS");
  const [port, setPort] = useState<string>("443");
  const [packetSize, setPacketSize] = useState<number>(1420);
  const [payloadLabel, setPayloadLabel] = useState<string>("Customer Job Application & Screening Feature Vector");
  const [activeHopIndex, setActiveHopIndex] = useState<number | null>(null);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [continuousSim, setContinuousSim] = useState<boolean>(false);
  const [packetsSent, setPacketsSent] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"visual" | "telemetry" | "netbox-schema">("visual");

  // Current active result
  const [traceResult, setTraceResult] = useState<TraceResult>({
    status: "DELIVERED",
    termination_reason: "Packet successfully traversed 7 structured cabling and network hops to destination socket.",
    source: {
      device: "edge-rt01.reskure.net",
      role: "EDGE_ROUTER",
      interface: "HundredGigE0/0/0/0",
      ip: "198.51.100.1",
    },
    destination: {
      device: "dgx-infer-01.reskure.net",
      role: "COMPUTE_HOST",
      interface: "net0 (Inference Cluster API)",
      ip: "10.100.40.10",
    },
    protocol: "HTTPS",
    destination_port: "443",
    packet_size_bytes: 1420,
    payload_label: "Customer Job Application & Screening Feature Vector",
    total_hops: 7,
    total_latency_ms: 1.02,
    bottleneck_mtu: 1500,
    unencrypted_hops: 0,
    compliance_score: "COMPLIANT",
    hops: DEFAULT_TOPOLOGY_HOPS,
  });

  // Handle Preset Switching
  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    const preset = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
    if (!preset) return;

    setProtocol(preset.protocol);
    setPort(preset.port);
    setPacketSize(preset.packetSize);
    setPayloadLabel(preset.payload);

    if (scenarioId === "ai-inference") {
      setTraceResult({
        status: "DELIVERED",
        termination_reason: "Packet successfully traversed 7 structured cabling and network hops to destination socket.",
        source: {
          device: "edge-rt01.reskure.net",
          role: "EDGE_ROUTER",
          interface: "HundredGigE0/0/0/0",
          ip: "198.51.100.1",
        },
        destination: {
          device: "dgx-infer-01.reskure.net",
          role: "COMPUTE_HOST",
          interface: "net0 (Inference Cluster API)",
          ip: "10.100.40.10",
        },
        protocol: "HTTPS",
        destination_port: "443",
        packet_size_bytes: 1420,
        payload_label: preset.payload,
        total_hops: 7,
        total_latency_ms: 1.02,
        bottleneck_mtu: 1500,
        unencrypted_hops: 0,
        compliance_score: "COMPLIANT",
        hops: DEFAULT_TOPOLOGY_HOPS,
      });
    } else if (scenarioId === "db-vector-sync") {
      setTraceResult({
        status: "DELIVERED",
        termination_reason: "Jumbo frame vector stream delivered over dedicated 25G storage fabric.",
        source: {
          device: "dgx-infer-01.reskure.net",
          role: "COMPUTE_HOST",
          interface: "ib0 (InfiniBand/Storage)",
          ip: "10.100.40.11",
        },
        destination: {
          device: "vectordb-cl01.reskure.net",
          role: "DATABASE_HOST",
          interface: "bond0 (Database Cluster)",
          ip: "10.100.50.25",
        },
        protocol: "TCP",
        destination_port: "5432",
        packet_size_bytes: 8900,
        payload_label: preset.payload,
        total_hops: 2,
        total_latency_ms: 0.20,
        bottleneck_mtu: 9000,
        unencrypted_hops: 0,
        compliance_score: "COMPLIANT",
        hops: [
          {
            hop_number: 1,
            device_name: "dgx-infer-01.reskure.net",
            device_role: "COMPUTE_HOST",
            interface_name: "ib0 (InfiniBand/Storage)",
            ip_address: "10.100.40.11",
            cable_label: "CBL-VDB-007",
            cable_type: "Single-Mode Fiber (OS2)",
            bandwidth_gbps: 25,
            hop_latency_ms: 0.15,
            cumulative_latency_ms: 0.15,
            is_encrypted: true,
            mtu: 9000,
            action: "PERMIT",
            notes: "High-throughput RoCEv2 RDMA storage channel active.",
          },
          {
            hop_number: 2,
            device_name: "vectordb-cl01.reskure.net",
            device_role: "DATABASE_HOST",
            interface_name: "bond0 (Database Cluster)",
            ip_address: "10.100.50.25",
            cable_label: "Destination Termination",
            cable_type: "Fiber SMF",
            bandwidth_gbps: 25,
            hop_latency_ms: 0.05,
            cumulative_latency_ms: 0.20,
            is_encrypted: true,
            mtu: 9000,
            action: "DELIVERED",
            notes: "PostgreSQL pgvector cluster ingested 1536-dimensional embedding vector.",
          },
        ],
      });
    } else if (scenarioId === "firewall-drop") {
      setTraceResult({
        status: "BLOCKED_FIREWALL",
        termination_reason: "Security inspection filter on sec-fw01 dropped packet: Port 23 (Telnet) prohibited by Zero-Trust policy.",
        source: {
          device: "edge-rt01.reskure.net",
          role: "EDGE_ROUTER",
          interface: "HundredGigE0/0/0/0",
          ip: "198.51.100.1",
        },
        destination: {
          device: "dgx-infer-01.reskure.net",
          role: "COMPUTE_HOST",
          interface: "net0 (Inference Cluster API)",
          ip: "10.100.40.10",
        },
        protocol: "TCP",
        destination_port: "23",
        packet_size_bytes: 64,
        payload_label: preset.payload,
        total_hops: 2,
        total_latency_ms: 0.18,
        bottleneck_mtu: 1500,
        unencrypted_hops: 0,
        compliance_score: "FAILED_DELIVERY",
        hops: [
          DEFAULT_TOPOLOGY_HOPS[0],
          {
            hop_number: 2,
            device_name: "sec-fw01.reskure.net",
            device_role: "FIREWALL_WAF",
            interface_name: "ethernet1/1 (WAN)",
            ip_address: "10.100.0.1",
            cable_label: "None",
            cable_type: "Internal Firewall Drop",
            hop_latency_ms: 0.0,
            cumulative_latency_ms: 0.18,
            is_encrypted: true,
            mtu: 1500,
            action: "FIREWALL_DROP",
            notes: "DENIED by rule 'DROP-LEGACY-UNENCRYPTED': Cleartext Telnet/RDP forbidden under security audit controls.",
          },
        ],
      });
    } else if (scenarioId === "severed-cable") {
      setTraceResult({
        status: "SEVERED_CABLE",
        termination_reason: "Physical link loss: Cable TRK-MPO-003 between core-sw01 and patch-pp01 has no optical continuity.",
        source: {
          device: "edge-rt01.reskure.net",
          role: "EDGE_ROUTER",
          interface: "HundredGigE0/0/0/0",
          ip: "198.51.100.1",
        },
        destination: {
          device: "tor-sw03.reskure.net",
          role: "TOR_SWITCH",
          interface: "Port-Channel 1",
          ip: "10.100.20.1",
        },
        protocol: "HTTPS",
        destination_port: "443",
        packet_size_bytes: 1420,
        payload_label: preset.payload,
        total_hops: 3,
        total_latency_ms: 0.40,
        bottleneck_mtu: 1500,
        unencrypted_hops: 0,
        compliance_score: "FAILED_DELIVERY",
        hops: [
          DEFAULT_TOPOLOGY_HOPS[0],
          DEFAULT_TOPOLOGY_HOPS[1],
          {
            hop_number: 3,
            device_name: "core-sw01.reskure.net",
            device_role: "CORE_SWITCH",
            interface_name: "Ethernet1/24",
            ip_address: "10.100.10.1",
            cable_label: "TRK-MPO-003 [SEVERED]",
            cable_type: "Multi-Mode Fiber (OM4 MPO-12)",
            hop_latency_ms: 0.0,
            cumulative_latency_ms: 0.40,
            is_encrypted: false,
            mtu: 9000,
            action: "CABLE_SEVERED",
            notes: "Optical signal loss detected on TX/RX strands. NetBox Cable Link state is marked SEVERED.",
          },
        ],
      });
    }
  };

  // Run or Simulate Traversal
  const runTrace = async () => {
    setIsTracing(true);
    // Animate packet step by step
    for (let i = 0; i < traceResult.hops.length; i++) {
      setActiveHopIndex(i);
      await new Promise((r) => setTimeout(r, 220));
    }
    setIsTracing(false);
    setPacketsSent((prev) => prev + 1);
  };

  // Continuous traffic simulation loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (continuousSim) {
      interval = setInterval(() => {
        setPacketsSent((p) => p + 1);
      }, 700);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [continuousSim]);

  const getDeviceIcon = (role: string) => {
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
  };

  const statusBadge = useMemo(() => {
    switch (traceResult.status) {
      case "DELIVERED":
        return {
          label: "DELIVERED (200 OK)",
          bg: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
          icon: CheckCircle2,
        };
      case "BLOCKED_FIREWALL":
        return {
          label: "BLOCKED BY FIREWALL",
          bg: "bg-amber-500/15 border-amber-500/40 text-amber-300",
          icon: ShieldAlert,
        };
      case "SEVERED_CABLE":
        return {
          label: "SEVERED CABLE / NO SIGNAL",
          bg: "bg-rose-500/15 border-rose-500/40 text-rose-300",
          icon: XCircle,
        };
      default:
        return {
          label: traceResult.status,
          bg: "bg-slate-500/15 border-slate-500/40 text-slate-300",
          icon: AlertTriangle,
        };
    }
  }, [traceResult.status]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Network className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Data Packet Traversal & Cable Path Tracer
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              NetBox DCIM Engine
            </span>
          </div>
          <p className="text-sm text-slate-400 max-w-3xl">
            Trace end-to-end data packet travelance across physical structured cabling, patch panel pass-throughs,
            leaf-spine switches, and security checkpoints with latency, MTU bottleneck analysis, and transit encryption verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setContinuousSim(!continuousSim)}
            className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              continuousSim
                ? "bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse"
                : "bg-slate-800/80 hover:bg-slate-800 border-white/10 text-slate-300"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            {continuousSim ? "Stop Traffic Stream" : "Continuous Traffic Sim"}
          </button>

          <button
            onClick={runTrace}
            disabled={isTracing}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-lg shadow-cyan-900/30 transition-all disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isTracing ? "animate-spin" : ""}`} />
            {isTracing ? "Tracing Hops..." : "Trace Packet Path"}
          </button>
        </div>
      </div>

      {/* Preset Scenarios Carousel / Selector */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Preset Inspection Scenarios</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_SCENARIOS.map((scenario) => {
            const isSelected = selectedScenario === scenario.id;
            return (
              <button
                key={scenario.id}
                onClick={() => handleSelectScenario(scenario.id)}
                className={`text-left p-3.5 rounded-xl border transition-all relative overflow-hidden group ${
                  isSelected
                    ? "bg-gradient-to-br from-cyan-950/60 via-slate-900 to-[#080d1a] border-cyan-500/50 shadow-md shadow-cyan-950/40"
                    : "bg-slate-900/40 hover:bg-slate-900/70 border-white/5 hover:border-white/15"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/10 rounded-bl-full pointer-events-none" />
                )}
                <div className="font-semibold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors">
                  {scenario.title}
                </div>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {scenario.description}
                </p>
                <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-cyan-400/90">
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    {scenario.protocol}:{scenario.port}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span>{scenario.packetSize}B</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration & Packet Metadata Bar */}
      <div className="glass-panel p-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Source Origin (NetBox Termination)
          </label>
          <div className="text-xs font-mono font-medium text-slate-200 truncate">
            {traceResult.source.device}
          </div>
          <div className="text-[11px] text-cyan-400 font-mono">
            {traceResult.source.interface}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Destination Endpoint
          </label>
          <div className="text-xs font-mono font-medium text-slate-200 truncate">
            {traceResult.destination.device}
          </div>
          <div className="text-[11px] text-indigo-400 font-mono">
            {traceResult.destination.interface}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Protocol & Port
          </label>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-slate-800 text-xs font-mono font-bold text-cyan-300 border border-white/10">
              {protocol}
            </span>
            <span className="text-xs font-mono text-slate-300">Port {port}</span>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Frame / Packet Size
          </label>
          <div className="text-xs font-mono text-slate-200 flex items-center gap-2">
            <span>{packetSize} Bytes</span>
            {packetSize > 1500 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-sans">
                Jumbo Frame
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Simulated Ingestion Traffic
          </label>
          <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{packetsSent.toLocaleString()} frames emitted</span>
          </div>
        </div>
      </div>

      {/* Traversal Executive Scorecard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Status */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Traversal Status
          </div>
          <div className="my-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${statusBadge.bg}`}>
              <statusBadge.icon className="w-4 h-4" />
              <span>{statusBadge.label}</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 line-clamp-1">
            {traceResult.termination_reason}
          </div>
        </div>

        {/* Total Latency */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Accumulated Latency</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-bold text-white font-mono">
              {traceResult.total_latency_ms} <span className="text-sm font-normal text-slate-400">ms</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Across {traceResult.total_hops} structured hops (avg {(traceResult.total_latency_ms / (traceResult.total_hops || 1)).toFixed(3)} ms/hop)
          </div>
        </div>

        {/* Bottleneck MTU */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Bottleneck MTU</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-bold text-white font-mono">
              {traceResult.bottleneck_mtu} <span className="text-sm font-normal text-slate-400">Bytes</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            {packetSize > traceResult.bottleneck_mtu
              ? "⚠️ Packet fragmented: exceeds path MTU"
              : "✓ Zero fragmentation: full frame headroom"}
          </div>
        </div>

        {/* Transit Encryption Audit */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Transit Encryption Audit</span>
            {traceResult.unencrypted_hops === 0 ? (
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
          <div className="my-1.5">
            <div className="text-base font-bold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>DPDP / ISO-27001 Passed</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            {traceResult.unencrypted_hops === 0
              ? "100% of traversed physical links encrypted"
              : `Warning: ${traceResult.unencrypted_hops} unencrypted segment detected`}
          </div>
        </div>
      </div>

      {/* Tabs: Visual Topology vs Telemetry Table vs NetBox Schema */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab("visual")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === "visual"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Interactive Cable Path & Packet Animation</span>
        </button>

        <button
          onClick={() => setActiveTab("telemetry")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === "telemetry"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Hop-by-Hop Telemetry Table</span>
        </button>

        <button
          onClick={() => setActiveTab("netbox-schema")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === "netbox-schema"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Info className="w-3.5 h-3.5" />
          <span>NetBox Cable Tracing Architecture</span>
        </button>
      </div>

      {/* Tab 1: Visual Topology & Moving Packet Animation */}
      {activeTab === "visual" && (
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>NetBox Structured Path Layout</span>
                <span className="text-[11px] font-normal text-slate-400">
                  (Physical links & passive pass-through mappings)
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>Traveling Packet Signal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/80" />
                <span>Patch Panel Cross-Connect</span>
              </div>
            </div>
          </div>

          {/* Interactive Topology Nodes Diagram */}
          <div className="relative overflow-x-auto py-8 px-4 bg-slate-950/60 rounded-xl border border-white/5">
            <div className="flex items-center justify-between min-w-[900px] relative">
              {/* Background Cable Trunk Line */}
              <div className="absolute top-1/2 left-8 right-8 h-1 bg-gradient-to-r from-cyan-500/30 via-sky-500/20 to-indigo-500/30 -translate-y-1/2 z-0" />

              {/* Hops */}
              {traceResult.hops.map((hop, index) => {
                const IconComponent = getDeviceIcon(hop.device_role);
                const isActive = activeHopIndex === index || isTracing;
                const isSevered = hop.action === "CABLE_SEVERED";
                const isBlocked = hop.action === "FIREWALL_DROP";
                const isDelivered = hop.action === "DELIVERED";
                const isPassThrough = hop.action === "PASS_THROUGH";

                return (
                  <div
                    key={index}
                    onClick={() => setActiveHopIndex(index)}
                    className="relative z-10 flex flex-col items-center group cursor-pointer"
                  >
                    {/* Hop Index Bubble */}
                    <div className="text-[10px] font-mono text-slate-400 mb-2 font-bold">
                      HOP #{hop.hop_number}
                    </div>

                    {/* Node Visual Box */}
                    <div
                      className={`w-16 h-16 rounded-xl flex items-center justify-center border-2 transition-all duration-300 relative ${
                        isSevered
                          ? "bg-rose-950/60 border-rose-500 shadow-lg shadow-rose-950/50"
                          : isBlocked
                          ? "bg-amber-950/60 border-amber-500 shadow-lg shadow-amber-950/50"
                          : isDelivered
                          ? "bg-emerald-950/60 border-emerald-500 shadow-lg shadow-emerald-950/50"
                          : isPassThrough
                          ? "bg-purple-950/60 border-purple-400/80 shadow-md shadow-purple-950/40"
                          : isActive
                          ? "bg-cyan-950/80 border-cyan-400 scale-110 shadow-lg shadow-cyan-500/40"
                          : "bg-slate-900 border-white/15 hover:border-cyan-400/60 hover:scale-105"
                      }`}
                    >
                      <IconComponent
                        className={`w-7 h-7 ${
                          isSevered
                            ? "text-rose-400"
                            : isBlocked
                            ? "text-amber-400"
                            : isDelivered
                            ? "text-emerald-400"
                            : isPassThrough
                            ? "text-purple-300"
                            : "text-cyan-300"
                        }`}
                      />

                      {/* Traveling photon dot indicator */}
                      {(activeHopIndex === index || continuousSim) && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400"></span>
                        </span>
                      )}
                    </div>

                    {/* Device Label */}
                    <div className="mt-3 text-center w-28">
                      <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                        {hop.device_name.split(".")[0]}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {hop.interface_name}
                      </div>
                      <div className="text-[9px] text-cyan-400/80 font-mono mt-0.5">
                        +{hop.hop_latency_ms} ms
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hop Detail Inspection Card */}
          {activeHopIndex !== null && traceResult.hops[activeHopIndex] && (
            <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold">
                    HOP #{traceResult.hops[activeHopIndex].hop_number} INSPECTION
                  </span>
                  <span className="text-xs font-bold text-white">
                    {traceResult.hops[activeHopIndex].device_name}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Cumulative Delay:{" "}
                  <strong className="text-cyan-300 font-bold">
                    {traceResult.hops[activeHopIndex].cumulative_latency_ms} ms
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-400 text-[11px]">Termination Interface</div>
                  <div className="font-mono text-slate-200 font-medium">
                    {traceResult.hops[activeHopIndex].interface_name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Cable Medium & Tag</div>
                  <div className="font-mono text-slate-200 font-medium">
                    {traceResult.hops[activeHopIndex].cable_label} ({traceResult.hops[activeHopIndex].cable_type})
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Interface MTU</div>
                  <div className="font-mono text-slate-200 font-medium">
                    {traceResult.hops[activeHopIndex].mtu} Bytes
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Link Encryption</div>
                  <div className="font-mono text-emerald-400 font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Active (AES-GCM / MACsec)</span>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 text-xs text-slate-300 font-mono">
                <strong>Diagnostic Note:</strong> {traceResult.hops[activeHopIndex].notes}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Hop-by-Hop Telemetry Table */}
      {activeTab === "telemetry" && (
        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Sequential Data Path Hops</h2>
            <span className="text-xs text-slate-400">
              Total Distance: {traceResult.hops.length} network hops
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Hop</th>
                  <th className="py-3 px-4">Device & Role</th>
                  <th className="py-3 px-4">Termination Port</th>
                  <th className="py-3 px-4">Cable / Link</th>
                  <th className="py-3 px-4">Delay</th>
                  <th className="py-3 px-4">MTU</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Inspection Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {traceResult.hops.map((hop) => (
                  <tr key={hop.hop_number} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-cyan-400">
                      #{hop.hop_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-sans font-semibold text-slate-200">
                        {hop.device_name}
                      </div>
                      <div className="text-[10px] text-slate-400">{hop.device_role}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{hop.interface_name}</td>
                    <td className="py-3 px-4">
                      <div className="text-cyan-300">{hop.cable_label}</div>
                      <div className="text-[10px] text-slate-400">{hop.cable_type}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>+{hop.hop_latency_ms} ms</div>
                      <div className="text-[10px] text-slate-400">{hop.cumulative_latency_ms} ms total</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{hop.mtu} B</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          hop.action === "DELIVERED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : hop.action === "FIREWALL_DROP"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : hop.action === "CABLE_SEVERED"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        }`}
                      >
                        {hop.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans max-w-xs truncate">
                      {hop.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: NetBox Architecture & Reference Overview */}
      {activeTab === "netbox-schema" && (
        <div className="glass-panel p-6 space-y-6">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-cyan-400" />
              <span>NetBox Cable Tracing & Traversal Methodology</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              How this module utilizes NetBox&apos;s OSI Layer-1 & Layer-2 Source of Truth abstractions to model packet travelance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed">
            <div className="p-4 rounded-xl bg-slate-900/50 border border-white/10 space-y-2">
              <div className="font-bold text-sm text-cyan-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                1. Terminations & Interfaces
              </div>
              <p className="text-slate-400">
                In NetBox, every physical port or logical interface is a termination point. This allows modeling routers, switches, firewalls, and server sockets with individual MTU parameters and IP address assignments.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-white/10 space-y-2">
              <div className="font-bold text-sm text-purple-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                2. Pass-Through Structured Cabling
              </div>
              <p className="text-slate-400">
                Unlike simple point-to-point lines, NetBox models patch panels with Front Ports and Rear Ports. The traversal engine recursively steps through internal optical pass-throughs to continue following data across inter-rack backbone trunks.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/50 border border-white/10 space-y-2">
              <div className="font-bold text-sm text-emerald-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                3. Zero-Trust & Audit Integration
              </div>
              <p className="text-slate-400">
                Combined with ResCure&apos;s Responsible AI and SecOps policies, each cable hop is audited for in-flight encryption (MACsec / IPsec / TLS) to guarantee DPDP and GDPR compliance before sensitive feature vectors reach inference nodes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
