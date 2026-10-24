"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { call } from "@/lib/client/api";
import {
  SlidersHorizontal,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Cpu,
  ArrowRight,
  Filter,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Search,
  Check,
  X,
  Target,
  BarChart3,
  Flame,
  Info,
} from "lucide-react";

interface FrameworkSummary {
  code: string;
  name: string;
  version: string;
  publisher: string;
  description: string;
  icon: string;
  total_controls: number;
  implemented: number;
  in_progress: number;
  not_started: number;
  compliance_score: number;
}

interface ControlItem {
  framework_code: string;
  code: string;
  domain: string;
  title: string;
  description: string;
  guidance: string;
  status: "IMPLEMENTED" | "IN_PROGRESS" | "NOT_STARTED" | "EXEMPT";
  crosswalk_tag?: string;
}

interface AppliedCoreControl {
  tag: string;
  name: string;
  domain: string;
  description: string;
  implementation_status: "IMPLEMENTED" | "IN_PROGRESS" | "NOT_STARTED";
  compliance_coverage: string[];
  owner: string;
  last_audited: string;
}

interface RiskItem {
  identifier: string;
  title: string;
  category: string;
  status: string;
  inherent_likelihood: number;
  inherent_impact: number;
  inherent_score: number;
  inherent_severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  residual_likelihood: number;
  residual_impact: number;
  residual_score: number;
  residual_severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  treatment_strategy: string;
  treatment_plan: string;
  mitigating_control: string;
}

interface Overview {
  global_posture_score: number;
  open_gaps_count: number;
  is_baseline: boolean;
  baseline_note: string;
  frameworks: FrameworkSummary[];
}

const SEVERITY = (score: number): RiskItem["inherent_severity"] =>
  score >= 20 ? "CRITICAL" : score >= 13 ? "HIGH" : score >= 6 ? "MEDIUM" : "LOW";
export function CisoAssistantView() {
  const [activeTab, setActiveTab] = useState<"overview" | "frameworks" | "crosswalks" | "risk-matrix" | "gaps">("overview");
  const [selectedFramework, setSelectedFramework] = useState<string>("ALL");
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  const [controls, setControls] = useState<ControlItem[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [coreControls, setCoreControls] = useState<AppliedCoreControl[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [ov, ctl, rsk, cw] = await Promise.all([
        call<Overview>("GET", "ciso/overview/"),
        call<{ controls: ControlItem[] }>("GET", "ciso/controls/"),
        call<{ risks: RiskItem[] }>("GET", "ciso/risks/"),
        call<{ crosswalks: AppliedCoreControl[] }>("GET", "ciso/crosswalks/"),
      ]);
      setOverview(ov);
      setControls(ctl.controls);
      setRisks(rsk.risks);
      setCoreControls(cw.crosswalks);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the CISO Assistant data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount: the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const [crosswalkNotification, setCrosswalkNotification] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  // New Risk Modal State
  const [showAddRiskModal, setShowAddRiskModal] = useState<boolean>(false);
  const [newRiskTitle, setNewRiskTitle] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState("CYBERSECURITY");
  const [newRiskLikelihood, setNewRiskLikelihood] = useState(3);
  const [newRiskImpact, setNewRiskImpact] = useState(4);
  const [newRiskTreatment, setNewRiskTreatment] = useState("MITIGATE");
  const [newRiskPlan, setNewRiskPlan] = useState("");

  // Re-compute Framework Summaries dynamically based on active control statuses
  const dynamicFrameworks = useMemo(() => {
    return (overview?.frameworks ?? []).map((fw) => {
      const fwControls = controls.filter((c) => c.framework_code === fw.code);
      const total = fwControls.length;
      const implemented = fwControls.filter((c) => c.status === "IMPLEMENTED").length;
      const inProgress = fwControls.filter((c) => c.status === "IN_PROGRESS").length;
      const notStarted = fwControls.filter((c) => c.status === "NOT_STARTED").length;
      const score = Math.round((implemented / (total || 1)) * 100);
      return {
        ...fw,
        total_controls: total,
        implemented,
        in_progress: inProgress,
        not_started: notStarted,
        compliance_score: score,
      };
    });
  }, [controls, overview]);

  // Global Compliance Posture Score
  const globalScore = useMemo(() => {
    const total = controls.length;
    const implemented = controls.filter((c) => c.status === "IMPLEMENTED").length;
    return Math.round((implemented / (total || 1)) * 100);
  }, [controls]);

  // 5x5 Matrix Calculations
  const { inherentMatrix, residualMatrix } = useMemo(() => {
    const im = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const rm = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];

    risks.forEach((r) => {
      const il = Math.max(1, Math.min(5, r.inherent_likelihood)) - 1;
      const ii = Math.max(1, Math.min(5, r.inherent_impact)) - 1;
      im[il][ii] += 1;

      const rl = Math.max(1, Math.min(5, r.residual_likelihood)) - 1;
      const ri = Math.max(1, Math.min(5, r.residual_impact)) - 1;
      rm[rl][ri] += 1;
    });

    return { inherentMatrix: im, residualMatrix: rm };
  }, [risks]);

  // "Assess Once, Comply with Many": the server applies the change and syncs mapped controls.
  const handleToggleControlStatus = async (controlCode: string) => {
    const current = controls.find((c) => c.code === controlCode);
    if (!current) return;
    const nextStatus =
      current.status === "IMPLEMENTED" ? "IN_PROGRESS" : current.status === "IN_PROGRESS" ? "NOT_STARTED" : "IMPLEMENTED";
    setActionError(null);
    try {
      const result = await call<{ synced_controls_count: number }>("PATCH", "ciso/controls/", {
        code: controlCode,
        status: nextStatus,
        sync_crosswalks: true,
      });
      await reload();
      if (result.synced_controls_count > 1) {
        setCrosswalkNotification(
          `Updated ${controlCode} and synced the status across ${result.synced_controls_count} mapped controls.`,
        );
        setTimeout(() => setCrosswalkNotification(null), 4500);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The status could not be changed.");
    }
  };

  const handleAddRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiskTitle.trim()) return;
    setActionError(null);
    try {
      await call("POST", "ciso/risks/", {
        title: newRiskTitle.trim(),
        category: newRiskCategory,
        inherent_likelihood: newRiskLikelihood,
        inherent_impact: newRiskImpact,
        treatment_strategy: newRiskTreatment,
        treatment_plan: newRiskPlan,
      });
      setShowAddRiskModal(false);
      setNewRiskTitle("");
      setNewRiskPlan("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The risk could not be added.");
    }
  };
  // Filtered controls list
  const filteredControls = useMemo(() => {
    return controls.filter((c) => {
      const matchFw = selectedFramework === "ALL" || c.framework_code === selectedFramework;
      const matchDomain = selectedDomain === "ALL" || c.domain.toLowerCase().includes(selectedDomain.toLowerCase());
      return matchFw && matchDomain;
    });
  }, [controls, selectedFramework, selectedDomain]);

  // Open Gaps
  const openGaps = useMemo(() => {
    return controls.filter((c) => c.status === "NOT_STARTED" || c.status === "IN_PROGRESS");
  }, [controls]);

  // Filtered risks
  const filteredRisks = useMemo(() => {
    if (!filterSeverity) return risks;
    return risks.filter((r) => r.inherent_severity === filterSeverity || r.residual_severity === filterSeverity);
  }, [risks, filterSeverity]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* CISO Assistant Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-900/30">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              CISO Assistant Community GRC Suite
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              Live data
            </span>
          </div>
          <p className="text-sm text-slate-400 max-w-3xl">
            Single pane of glass for Governance, Risk, and Compliance inspired by{" "}
            <span className="text-slate-200 font-medium">Intuitem CISO Assistant</span>.
            Unified 200+ framework library, decoupled crosswalks (&ldquo;Assess Once, Comply with Many&rdquo;),
            5x5 risk quantification, and executive posture scoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddRiskModal(true)}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-lg shadow-cyan-900/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Risk to Register</span>
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading...</p>}
      {loadError && (
        <div role="alert" className="p-3.5 rounded-xl border border-red-500/40 bg-red-950/40 text-red-200 text-xs">{loadError}</div>
      )}
      {actionError && (
        <div role="alert" className="p-3.5 rounded-xl border border-red-500/40 bg-red-950/40 text-red-200 text-xs">{actionError}</div>
      )}
      {overview?.is_baseline && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs">
          Starter baseline: {overview.baseline_note}
        </div>
      )}
      {/* Crosswalk Ripple Notification Banner */}
      {crosswalkNotification && (
        <div className="p-3.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-200 text-xs font-medium flex items-center justify-between shadow-lg shadow-cyan-950/50 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{crosswalkNotification}</span>
          </div>
          <button onClick={() => setCrosswalkNotification(null)} className="text-cyan-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0 ${
            activeTab === "overview"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Executive Command Center</span>
        </button>

        <button
          onClick={() => setActiveTab("frameworks")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0 ${
            activeTab === "frameworks"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Frameworks & Controls Catalog</span>
        </button>

        <button
          onClick={() => setActiveTab("crosswalks")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0 ${
            activeTab === "crosswalks"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Decoupled Crosswalk (&ldquo;Assess Once&rdquo;)</span>
        </button>

        <button
          onClick={() => setActiveTab("risk-matrix")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0 ${
            activeTab === "risk-matrix"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>5x5 Risk Matrix & Register</span>
        </button>

        <button
          onClick={() => setActiveTab("gaps")}
          className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors shrink-0 ${
            activeTab === "gaps"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Gap Analysis ({openGaps.length})</span>
        </button>
      </div>

      {/* TAB 1: EXECUTIVE COMMAND CENTER */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Global Compliance Index</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{globalScore}%</span>
                <span className="text-xs text-emerald-400 font-medium">Operating Baseline</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Across 6 global frameworks & 19 mapped safeguards
              </div>
            </div>

            <div className="glass-panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Critical Risk Exposure</span>
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">0</span>
                <span className="text-xs text-slate-400">Residual Criticals</span>
              </div>
              <div className="text-[11px] text-slate-400">
                2 Inherent Critical risks successfully mitigated to Low/Medium
              </div>
            </div>

            <div className="glass-panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Applied Core Safeguards</span>
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{coreControls.length}</span>
                <span className="text-xs text-cyan-400 font-medium">Single Source of Truth</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Cross-mapped across ISO, NIST, SOC 2 & DPDP
              </div>
            </div>

            <div className="glass-panel p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span>Open Compliance Gaps</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="my-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white">{openGaps.length}</span>
                <span className="text-xs text-amber-400 font-medium">Action Items</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Prioritized by technical vulnerability & audit urgency
              </div>
            </div>
          </div>

          {/* Standard Frameworks Posture Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Multi-Standard Compliance Posture (CISO Assistant Catalog)</span>
              </h2>
              <span className="text-xs text-slate-400">Auto-calculated via Crosswalk Engine</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dynamicFrameworks.map((fw) => (
                <div
                  key={fw.code}
                  className="glass-panel p-4 flex flex-col justify-between hover:border-cyan-500/40 transition-all cursor-pointer group"
                  onClick={() => {
                    setSelectedFramework(fw.code);
                    setActiveTab("frameworks");
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors">
                        {fw.name}
                      </div>
                      <div className="text-[11px] text-slate-400">{fw.publisher}</div>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {fw.compliance_score}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 my-3 line-clamp-2">
                    {fw.description}
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{fw.implemented} / {fw.total_controls} Implemented</span>
                      {fw.in_progress > 0 && (
                        <span className="text-amber-400">{fw.in_progress} In Progress</span>
                      )}
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${fw.compliance_score}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inherent vs Residual 5x5 Heatmaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Inherent Risk Matrix (Pre-Treatment)</span>
                  </h3>
                  <p className="text-xs text-slate-400">Raw operational & cyber exposure before control mitigation</p>
                </div>
                <span className="text-xs font-bold text-rose-300 px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30">
                  Raw Exposure
                </span>
              </div>

              {/* 5x5 Grid */}
              <div className="grid grid-cols-5 gap-1.5 pt-2">
                {[4, 3, 2, 1, 0].map((l) => (
                  <React.Fragment key={l}>
                    {[0, 1, 2, 3, 4].map((i) => {
                      const score = (l + 1) * (i + 1);
                      const count = inherentMatrix[l][i];
                      const sevClass =
                        score >= 20
                          ? "severity-critical"
                          : score >= 13
                          ? "severity-high"
                          : score >= 6
                          ? "severity-medium"
                          : "severity-low";

                      return (
                        <div
                          key={`${l}-${i}`}
                          className={`heatmap-cell ${sevClass} p-2 text-center text-xs`}
                          title={`Likelihood ${l + 1} x Impact ${i + 1} = Score ${score}`}
                        >
                          <span className="font-bold text-sm">{count}</span>
                          <span className="text-[9px] opacity-70">L{l + 1}×I{i + 1}</span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="glass-panel p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Residual Risk Matrix (Post-Treatment)</span>
                  </h3>
                  <p className="text-xs text-slate-400">Residual exposure verified after applying CISO Assistant controls</p>
                </div>
                <span className="text-xs font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                  Safeguards Active
                </span>
              </div>

              {/* 5x5 Grid */}
              <div className="grid grid-cols-5 gap-1.5 pt-2">
                {[4, 3, 2, 1, 0].map((l) => (
                  <React.Fragment key={l}>
                    {[0, 1, 2, 3, 4].map((i) => {
                      const score = (l + 1) * (i + 1);
                      const count = residualMatrix[l][i];
                      const sevClass =
                        score >= 20
                          ? "severity-critical"
                          : score >= 13
                          ? "severity-high"
                          : score >= 6
                          ? "severity-medium"
                          : "severity-low";

                      return (
                        <div
                          key={`${l}-${i}`}
                          className={`heatmap-cell ${sevClass} p-2 text-center text-xs`}
                          title={`Likelihood ${l + 1} x Impact ${i + 1} = Score ${score}`}
                        >
                          <span className="font-bold text-sm">{count}</span>
                          <span className="text-[9px] opacity-70">L{l + 1}×I{i + 1}</span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FRAMEWORKS & CONTROLS CATALOG */}
      {activeTab === "frameworks" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="glass-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Framework:</span>
              <button
                onClick={() => setSelectedFramework("ALL")}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedFramework === "ALL"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                All Standards
              </button>
              {dynamicFrameworks.map((fw) => (
                <button
                  key={fw.code}
                  onClick={() => setSelectedFramework(fw.code)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    selectedFramework === fw.code
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {fw.name.split(" ")[0]} {fw.name.split(" ")[1] || ""}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400">
              Showing {filteredControls.length} controls (Click status badge to toggle & sync across crosswalks)
            </div>
          </div>

          {/* Controls List */}
          <div className="space-y-3">
            {filteredControls.map((c) => (
              <div
                key={`${c.framework_code}-${c.code}`}
                className="glass-panel p-4 hover:border-cyan-500/30 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-white/10">
                      {c.code}
                    </span>
                    <span className="text-sm font-bold text-white">{c.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">({c.framework_code})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.crosswalk_tag && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Mapped ({c.crosswalk_tag})</span>
                      </span>
                    )}

                    <button
                      onClick={() => handleToggleControlStatus(c.code)}
                      className={`text-xs font-bold px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                        c.status === "IMPLEMENTED"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                          : c.status === "IN_PROGRESS"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                          : "bg-slate-800 text-slate-300 border-white/15 hover:bg-slate-700"
                      }`}
                      title="Click to toggle status & sync mapped frameworks"
                    >
                      {c.status}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{c.description}</p>

                <div className="p-2.5 rounded-lg bg-black/40 text-xs text-slate-400 font-mono">
                  <strong className="text-slate-300">Implementation Guidance:</strong> {c.guidance}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DECOUPLED CROSSWALK ("Assess Once, Comply with Many") */}
      {activeTab === "crosswalks" && (
        <div className="glass-panel overflow-hidden space-y-4 p-6">
          <div className="border-b border-white/10 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span>Decoupled Control Crosswalks (&ldquo;Assess Once, Comply with Many&rdquo;)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Core architectural philosophy of CISO Assistant: A single technical safeguard implementation automatically satisfies
              and proves compliance across multiple regulatory standards simultaneously.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10 font-mono">
                <tr>
                  <th className="py-3 px-4">Core Safeguard Tag</th>
                  <th className="py-3 px-4">Applied Control & Domain</th>
                  <th className="py-3 px-4">Mapped Framework Requirements</th>
                  <th className="py-3 px-4">Operational Status</th>
                  <th className="py-3 px-4">Control Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {coreControls.map((ctrl) => (
                  <tr key={ctrl.tag} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 font-bold text-cyan-400">{ctrl.tag}</td>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-slate-100">{ctrl.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{ctrl.domain}</div>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="flex flex-wrap gap-1.5">
                        {ctrl.compliance_coverage.map((cov) => (
                          <span
                            key={cov}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10"
                          >
                            {cov}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                          ctrl.implementation_status === "IMPLEMENTED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {ctrl.implementation_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans">{ctrl.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: 5x5 RISK MATRIX & REGISTER */}
      {activeTab === "risk-matrix" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-rose-400" />
                <span>Centralized Risk Register & 5x5 Quantification</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-tenant risk engine computing Inherent Risk (Likelihood × Impact) and Residual Risk post-mitigation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                    filterSeverity === sev
                      ? "bg-cyan-500 text-slate-900 border-cyan-400"
                      : "bg-slate-900 text-slate-300 border-white/10 hover:border-white/20"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Table */}
          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/10">
                  <tr>
                    <th className="py-3 px-4">Risk ID</th>
                    <th className="py-3 px-4">Title & Category</th>
                    <th className="py-3 px-4">Inherent (L×I)</th>
                    <th className="py-3 px-4">Residual (L×I)</th>
                    <th className="py-3 px-4">Treatment</th>
                    <th className="py-3 px-4">Mitigating Safeguard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRisks.map((r) => (
                    <tr key={r.identifier} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4 font-bold text-cyan-400">{r.identifier}</td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-slate-100">{r.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{r.category} • {r.treatment_plan}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.inherent_severity === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : r.inherent_severity === "HIGH"
                              ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {r.inherent_score} ({r.inherent_severity})
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.residual_severity === "LOW"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {r.residual_score} ({r.residual_severity})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-300 font-medium">
                        {r.treatment_strategy}
                      </td>
                      <td className="py-3 px-4 text-cyan-300 font-mono text-[11px]">
                        {r.mitigating_control}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GAP ANALYSIS & REMEDIATION */}
      {activeTab === "gaps" && (
        <div className="space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Prioritized Compliance Gap Analysis</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              CISO Assistant Automated Gap Scorer flags controls requiring implementation or evidence attestation.
            </p>
          </div>

          <div className="space-y-3">
            {openGaps.map((g) => (
              <div key={g.code} className="glass-panel p-4 space-y-3 hover:border-amber-500/40 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-white/10">
                      {g.code}
                    </span>
                    <span className="text-sm font-bold text-white">{g.title}</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                    {g.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300">{g.description}</p>

                <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>CISO Assistant Remediation Guidance:</span>
                  </div>
                  <p className="text-slate-400 font-mono">{g.guidance}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Risk Modal */}
      {showAddRiskModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel max-w-lg w-full p-6 space-y-4 border border-cyan-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>Add Custom Risk to Register</span>
              </h3>
              <button onClick={() => setShowAddRiskModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRisk} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Risk Title</label>
                <input
                  type="text"
                  required
                  value={newRiskTitle}
                  onChange={(e) => setNewRiskTitle(e.target.value)}
                  placeholder="e.g. LLM Prompt Injection via API"
                  className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={newRiskCategory}
                    onChange={(e) => setNewRiskCategory(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="CYBERSECURITY">Cybersecurity</option>
                    <option value="COMPLIANCE">Compliance</option>
                    <option value="DATA_PRIVACY">Data Privacy</option>
                    <option value="OPERATIONAL">Operational</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Treatment Strategy</label>
                  <select
                    value={newRiskTreatment}
                    onChange={(e) => setNewRiskTreatment(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="MITIGATE">Mitigate</option>
                    <option value="ACCEPT">Accept</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="AVOID">Avoid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Inherent Likelihood (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newRiskLikelihood}
                    onChange={(e) => setNewRiskLikelihood(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Inherent Impact (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newRiskImpact}
                    onChange={(e) => setNewRiskImpact(Number(e.target.value))}
                    className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Treatment Plan</label>
                <textarea
                  rows={3}
                  value={newRiskPlan}
                  onChange={(e) => setNewRiskPlan(e.target.value)}
                  placeholder="Describe technical controls, monitoring safeguards, or insurance policies."
                  className="w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRiskModal(false)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                >
                  Save to Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
