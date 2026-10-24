"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  Server,
  Database,
  Lock,
  Layers,
  Sparkles,
  Terminal,
  Activity,
  Download,
  Key,
  Shield,
  FileSpreadsheet,
} from "lucide-react";
import type {
  CloudAccount,
  CloudScan,
  CloudFinding,
  CloudSecurityOverview,
  CloudProvider,
  CloudFindingSeverity,
} from "@/lib/types";
import { StateBadge } from "@/components/ui/StateBadge";
import { Panel, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { dateTime } from "@/lib/format";

interface Props {
  overview: CloudSecurityOverview;
  accounts: CloudAccount[];
  scans: CloudScan[];
  findings: CloudFinding[];
}

export function CloudSecurityDashboard({ overview, accounts, scans, findings }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "accounts" | "scans">("overview");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modal states
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<CloudFinding | null>(null);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    accountId: string;
    message: string;
    ok: boolean;
  } | null>(null);

  const [accountFormData, setAccountFormData] = useState({
    name: "",
    provider: "AWS" as CloudProvider,
    account_id: "",
    region_default: "us-east-1",
    role_arn: "",
    environment: "PRODUCTION",
    notes: "",
  });

  const [scanFormData, setScanFormData] = useState({
    account_id: accounts[0]?.id || "",
    scan_type: "FULL_AUDIT",
  });

  // Safe active account ID for scan modal
  const effectiveScanAccountId =
    scanFormData.account_id && accounts.some((a) => a.id === scanFormData.account_id)
      ? scanFormData.account_id
      : accounts[0]?.id || "";

  // Seed sample demo
  async function handleSeedDemo() {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/proxy/cloud-security/demo/seed/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to seed demo data");
      }
    } catch {
      alert("Error contacting server");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Connect new cloud account
  async function handleConnectAccount(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/proxy/cloud-security/accounts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountFormData),
      });
      if (res.ok) {
        setShowConnectModal(false);
        setAccountFormData({
          name: "",
          provider: "AWS",
          account_id: "",
          region_default: "us-east-1",
          role_arn: "",
          environment: "PRODUCTION",
          notes: "",
        });
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to create cloud account");
      }
    } catch {
      alert("Error connecting cloud account");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Test cloud credentials connection
  async function handleTestConnection(accountId: string) {
    setTestingAccountId(accountId);
    setConnectionTestResult(null);
    try {
      const res = await fetch(`/api/proxy/cloud-security/accounts/${accountId}/test-connection/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setConnectionTestResult({
        accountId,
        message: data.message || "Account ID format accepted. No live call was made.",
        ok: res.ok,
      });
    } catch {
      setConnectionTestResult({
        accountId,
        message: "Failed to connect to authentication endpoint.",
        ok: false,
      });
    } finally {
      setTestingAccountId(null);
    }
  }

  // Trigger scan
  async function handleTriggerScan(e: React.FormEvent) {
    e.preventDefault();
    const targetAccountId = effectiveScanAccountId;
    if (!targetAccountId) {
      alert("Please connect or select a cloud account first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/proxy/cloud-security/scans/trigger/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: targetAccountId,
          scan_type: scanFormData.scan_type,
        }),
      });
      if (res.ok) {
        setShowScanModal(false);
        router.refresh();
      } else {
        alert("Failed to initiate scan");
      }
    } catch {
      alert("Error triggering scan");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick scan single account
  async function handleQuickScan(accountId: string) {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/proxy/cloud-security/accounts/${accountId}/scan/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_type: "FULL_AUDIT" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      alert("Scan failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Mark finding resolved or accepted
  async function handleUpdateFindingStatus(findingId: string, actionType: "resolve" | "suppress") {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/proxy/cloud-security/findings/${findingId}/${actionType}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: actionType === "resolve" ? "Remediated via applied policy fix" : "Risk accepted by auditor",
        }),
      });
      if (res.ok) {
        setSelectedFinding(null);
        router.refresh();
      }
    } catch {
      alert("Failed to update finding status");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Export findings CSV
  function handleExportFindings() {
    window.location.href = "/api/proxy/cloud-security/findings/export/";
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (selectedProvider !== "ALL" && f.provider.toUpperCase() !== selectedProvider) return false;
    if (selectedSeverity !== "ALL" && f.severity !== selectedSeverity) return false;
    if (selectedStatus !== "ALL" && f.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        f.check_title.toLowerCase().includes(q) ||
        f.resource_name.toLowerCase().includes(q) ||
        f.resource_id.toLowerCase().includes(q) ||
        f.check_id.toLowerCase().includes(q) ||
        f.service.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div role="note" className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs">
        Simulated results: scans run the built-in Prowler-style rule catalogue against sample accounts. No call is made to
        AWS, Azure or Google Cloud, so these findings do not describe a real environment.
      </div>
      {/* Top Banner & Main Controls */}
      <div className="glass-panel p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-l-cyan-500 shadow-xl shadow-cyan-950/20">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-wide">Prowler Cloud Security Engine</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              v4.3 CSPM Active
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Automated multi-cloud security assessment engine across AWS, Azure, and GCP. Continuous compliance mapping to
            CIS Foundations Benchmarks, NIST 800-53, SOC 2, and ISO 27001.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSeedDemo}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-2 transition-colors disabled:opacity-50 border border-indigo-400/20"
            title="Seed or reset multi-cloud demo accounts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? "animate-spin" : ""}`} />
            {accounts.length === 0 ? "Load Prowler Demo" : "Reload Sample Clouds"}
          </button>
          <button
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 hover:bg-white/5 text-slate-200 text-xs font-medium px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Account
          </button>
          <button
            onClick={() => {
              setScanFormData((prev) => ({
                ...prev,
                account_id: effectiveScanAccountId,
              }));
              setShowScanModal(true);
            }}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 py-2 transition-colors disabled:opacity-50 shadow-md shadow-cyan-900/30"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Scan
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Posture Score Gauge */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Security Posture</span>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-2 flex items-center gap-3">
            <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={
                    overview.overall_score >= 80
                      ? "text-emerald-400"
                      : overview.overall_score >= 60
                      ? "text-amber-400"
                      : "text-rose-400"
                  }
                  strokeDasharray={`${overview.overall_score}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-bold text-white">
                {overview.total_accounts > 0 ? `${Math.round(overview.overall_score)}%` : "—"}
              </span>
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {overview.overall_score >= 80
                  ? "Strong Posture"
                  : overview.overall_score >= 60
                  ? "Moderate Risk"
                  : overview.total_accounts > 0
                  ? "Review Needed"
                  : "No Scans"}
              </div>
              <div className="text-[11px] text-slate-400">
                {overview.total_accounts > 0 ? `${overview.overall_score}% of checks passed` : "Pending initial scan"}
              </div>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                overview.overall_score >= 80
                  ? "bg-emerald-500"
                  : overview.overall_score >= 60
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(overview.overall_score, 100)}%` }}
            />
          </div>
        </div>

        {/* Critical Risk */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Critical Severity</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400 my-1">{overview.severity_counts.CRITICAL}</div>
          <div className="text-[11px] text-slate-500">Immediate exploit risk</div>
        </div>

        {/* High Risk */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>High Severity</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-400 my-1">{overview.severity_counts.HIGH}</div>
          <div className="text-[11px] text-slate-500">Remediation priority</div>
        </div>

        {/* Passing Checks */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Passing Checks</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 my-1">{overview.status_counts.PASS}</div>
          <div className="text-[11px] text-slate-500">Checks passed (simulated)</div>
        </div>

        {/* Multi-cloud Accounts */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Connected Clouds</span>
            <Cloud className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white my-1">{overview.total_accounts}</div>
          <div className="text-[11px] text-slate-500">AWS, Azure & GCP</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "overview"
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          Posture Overview
        </button>
        <button
          onClick={() => setActiveTab("findings")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
            activeTab === "findings"
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Prowler Findings</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-bold">
            {findings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("accounts")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
            activeTab === "accounts"
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Cloud Accounts</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-bold">
            {accounts.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("scans")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
            activeTab === "scans"
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Audit Scans</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-bold">
            {scans.length}
          </span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OVERVIEW */}
      {/* ========================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Multi-cloud Provider Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["AWS", "AZURE", "GCP"] as CloudProvider[]).map((prov) => {
              const data = overview.providers_summary[prov] || { accounts_count: 0, avg_score: 0, open_issues: 0 };
              const color =
                prov === "AWS"
                  ? "from-amber-600/20"
                  : prov === "AZURE"
                  ? "from-sky-600/20"
                  : "from-emerald-600/20";
              const border =
                prov === "AWS"
                  ? "border-amber-500/30"
                  : prov === "AZURE"
                  ? "border-sky-500/30"
                  : "border-emerald-500/30";
              const text =
                prov === "AWS" ? "text-amber-400" : prov === "AZURE" ? "text-sky-400" : "text-emerald-400";

              return (
                <div
                  key={prov}
                  className={`glass-panel p-5 border ${border} bg-gradient-to-br ${color} to-transparent`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-bold tracking-wider ${text}`}>{prov}</span>
                    <span className="text-xs text-slate-400 font-medium">{data.accounts_count} accounts</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {data.avg_score > 0 ? `${data.avg_score}%` : "—"}
                      </div>
                      <div className="text-[11px] text-slate-400">Compliance score</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-rose-400">{data.open_issues}</div>
                      <div className="text-[11px] text-slate-400">Open issues</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Frameworks Compliance Matrix */}
            <div className="lg:col-span-2 glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">Compliance Benchmarks & Standards</h3>
                  <p className="text-xs text-slate-400">Automated evaluation against global regulatory baselines</p>
                </div>
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>

              <div className="space-y-3">
                {overview.frameworks.map((fw) => (
                  <div key={fw.code} className="p-3 rounded-lg bg-slate-900/60 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{fw.name}</span>
                      <span className="font-bold text-cyan-300">{fw.score}% Pass</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                        style={{ width: `${fw.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Failed Services */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">Top Affected Services</h3>
                  <p className="text-xs text-slate-400">Cloud components with highest defect count</p>
                </div>
                <Activity className="w-4 h-4 text-amber-400" />
              </div>

              <div className="space-y-2">
                {overview.top_services.length === 0 ? (
                  <div className="text-xs text-slate-500 py-6 text-center">No active defect hotspots identified</div>
                ) : (
                  overview.top_services.map((svc) => (
                    <div
                      key={`${svc.provider}-${svc.service}`}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {svc.provider}
                        </span>
                        <span className="text-xs font-medium text-slate-200 uppercase">{svc.service}</span>
                      </div>
                      <span className="text-xs font-bold text-rose-400">{svc.count} findings</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Critical Open Findings Feed */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white">High Priority Remediation Queue</h3>
                <p className="text-xs text-slate-400">Directly exposed attack surface requiring immediate mitigation</p>
              </div>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>

            <div className="space-y-3">
              {overview.critical_findings.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center">
                  No critical vulnerabilities detected. Run a scan to evaluate your posture.
                </div>
              ) : (
                overview.critical_findings.map((f) => (
                  <div
                    key={f.id}
                    className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge state={f.severity} />
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {f.provider} : {f.service.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{f.region}</span>
                        {f.affected_asset_name && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300/90 font-mono px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
                            <Server className="w-2.5 h-2.5" />
                            Asset: {f.affected_asset_name}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-white">{f.check_title}</h4>
                      <p className="text-xs text-slate-300 font-mono truncate">{f.resource_id}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedFinding(f)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        Remediate
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: FINDINGS EXPLORER */}
      {/* ========================================================= */}
      {activeTab === "findings" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="glass-panel p-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search check, ARN, service, or rule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Providers</option>
                <option value="AWS">AWS</option>
                <option value="AZURE">Azure</option>
                <option value="GCP">GCP</option>
              </select>

              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="FAIL">Fail</option>
                <option value="PASS">Pass</option>
              </select>

              <button
                onClick={handleExportFindings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                title="Download Prowler findings export as CSV"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Findings Table */}
          <div className="glass-panel overflow-hidden border border-white/10 rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="p-3">Status</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">Check / Standard</th>
                    <th className="p-3">Provider</th>
                    <th className="p-3">Resource Target</th>
                    <th className="p-3">Region</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredFindings.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No findings match your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredFindings.map((f) => (
                      <tr key={f.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <StateBadge state={f.status} />
                        </td>
                        <td className="p-3">
                          <StateBadge state={f.severity} />
                        </td>
                        <td className="p-3 max-w-xs">
                          <div className="font-semibold text-white truncate">{f.check_title}</div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">{f.check_id}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-300">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold">
                            {f.provider}
                          </span>
                        </td>
                        <td className="p-3 max-w-sm">
                          <div className="text-slate-200 font-mono text-[11px] truncate">
                            {f.resource_name || f.resource_id}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 uppercase">{f.service}</span>
                            {f.affected_asset_name && (
                              <span className="text-[10px] text-cyan-400 font-mono">
                                • Asset: {f.affected_asset_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-400">{f.region}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedFinding(f)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-medium transition-colors"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: CLOUD ACCOUNTS */}
      {/* ========================================================= */}
      {activeTab === "accounts" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-white">Registered Cloud Accounts</h2>
            <button onClick={() => setShowConnectModal(true)} className={buttonClass}>
              <Plus className="w-4 h-4" />
              Connect Cloud Account
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.length === 0 ? (
              <div className="col-span-3 glass-panel p-8 text-center text-slate-400">
                No cloud accounts connected yet. Click &quot;Connect Cloud Account&quot; or &quot;Load Prowler Demo&quot;.
              </div>
            ) : (
              accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="glass-panel p-5 space-y-4 border border-white/10 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-white/10">
                        {acc.provider}
                      </span>
                      <StateBadge state={acc.status} />
                    </div>
                    <h3 className="text-base font-bold text-white">{acc.name}</h3>
                    <div className="text-xs font-mono text-slate-400 truncate">ID: {acc.account_id}</div>
                    <div className="text-xs text-slate-400">Region: {acc.region_default}</div>
                    {acc.role_arn && (
                      <div className="text-[11px] font-mono text-slate-500 truncate">Role: {acc.role_arn}</div>
                    )}
                  </div>

                  {connectionTestResult && connectionTestResult.accountId === acc.id && (
                    <div
                      className={`p-2.5 rounded-lg text-[11px] leading-tight ${
                        connectionTestResult.ok
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                      }`}
                    >
                      {connectionTestResult.message}
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Compliance Score</span>
                      <span className="font-bold text-cyan-400">{acc.compliance_score}%</span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                      <div className="p-1 rounded bg-rose-500/10 text-rose-300">
                        <div className="font-bold">{acc.critical_findings_count}</div>
                        <div>Crit</div>
                      </div>
                      <div className="p-1 rounded bg-amber-500/10 text-amber-300">
                        <div className="font-bold">{acc.high_findings_count}</div>
                        <div>High</div>
                      </div>
                      <div className="p-1 rounded bg-yellow-500/10 text-yellow-300">
                        <div className="font-bold">{acc.medium_findings_count}</div>
                        <div>Med</div>
                      </div>
                      <div className="p-1 rounded bg-slate-500/10 text-slate-300">
                        <div className="font-bold">{acc.low_findings_count}</div>
                        <div>Low</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleTestConnection(acc.id)}
                        disabled={testingAccountId === acc.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 hover:bg-white/5 text-slate-300 text-xs font-medium py-2 px-3 transition-colors disabled:opacity-50"
                        title="Verify API credentials / IAM STS connectivity"
                      >
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        {testingAccountId === acc.id ? "Testing..." : "Test"}
                      </button>
                      <button
                        onClick={() => handleQuickScan(acc.id)}
                        disabled={isSubmitting}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold py-2 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Scan Now
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: AUDIT SCANS HISTORY */}
      {/* ========================================================= */}
      {activeTab === "scans" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-white">Prowler Audit Execution History</h2>
            <button
              onClick={() => {
                setScanFormData((prev) => ({
                  ...prev,
                  account_id: effectiveScanAccountId,
                }));
                setShowScanModal(true);
              }}
              disabled={accounts.length === 0}
              className={buttonClass}
            >
              <Play className="w-4 h-4" />
              Run New Scan
            </button>
          </div>

          <div className="glass-panel overflow-hidden border border-white/10 rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="p-3">Status</th>
                    <th className="p-3">Target Account</th>
                    <th className="p-3">Scan Type</th>
                    <th className="p-3">Started At</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Checks (Pass/Fail)</th>
                    <th className="p-3">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {scans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No scans executed yet.
                      </td>
                    </tr>
                  ) : (
                    scans.map((s) => (
                      <tr key={s.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3">
                          <StateBadge state={s.status} />
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-white">{s.account_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {s.account_provider} ({s.account_id_val})
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-300">{s.scan_type.replace(/_/g, " ")}</td>
                        <td className="p-3 text-slate-400 font-mono">{s.started_at ? dateTime(s.started_at) : "—"}</td>
                        <td className="p-3 text-slate-400 font-mono">{s.duration_seconds}s</td>
                        <td className="p-3">
                          <span className="text-emerald-400 font-semibold">{s.passed_checks} passed</span> /{" "}
                          <span className="text-rose-400 font-semibold">{s.failed_checks} failed</span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-cyan-300">{s.compliance_score}%</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: CONNECT CLOUD ACCOUNT */}
      {/* ========================================================= */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel max-w-lg w-full p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Connect Cloud Provider Account</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConnectAccount} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Cloud Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["AWS", "AZURE", "GCP"] as CloudProvider[]).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setAccountFormData({ ...accountFormData, provider: prov })}
                      className={`p-2 rounded-lg font-bold border transition-colors ${
                        accountFormData.provider === prov
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500"
                          : "bg-slate-900 text-slate-400 border-white/10 hover:bg-slate-800"
                      }`}
                    >
                      {prov}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Account / Environment Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Production Workloads"
                  value={accountFormData.name}
                  onChange={(e) => setAccountFormData({ ...accountFormData, name: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Account ID / Subscription</label>
                  <input
                    type="text"
                    required
                    placeholder="123456789012"
                    value={accountFormData.account_id}
                    onChange={(e) => setAccountFormData({ ...accountFormData, account_id: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Primary Region</label>
                  <input
                    type="text"
                    required
                    placeholder="us-east-1"
                    value={accountFormData.region_default}
                    onChange={(e) => setAccountFormData({ ...accountFormData, region_default: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">IAM Role ARN / Service Principal</label>
                <input
                  type="text"
                  placeholder="arn:aws:iam::123456789012:role/ProwlerAuditorRole"
                  value={accountFormData.role_arn}
                  onChange={(e) => setAccountFormData({ ...accountFormData, role_arn: e.target.value })}
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500 mt-1">Requires read-only audit policy (SecurityAudit)</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className={ghostButtonClass}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className={buttonClass}>
                  {isSubmitting ? "Connecting..." : "Save & Verify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: TRIGGER SCAN */}
      {/* ========================================================= */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel max-w-md w-full p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Execute Prowler Audit</h3>
              <button onClick={() => setShowScanModal(false)} className="text-slate-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleTriggerScan} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Account</label>
                <select
                  value={effectiveScanAccountId}
                  onChange={(e) => setScanFormData({ ...scanFormData, account_id: e.target.value })}
                  className={inputClass}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.provider}] {acc.name} ({acc.account_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Scan Profile</label>
                <select
                  value={scanFormData.scan_type}
                  onChange={(e) => setScanFormData({ ...scanFormData, scan_type: e.target.value })}
                  className={inputClass}
                >
                  <option value="FULL_AUDIT">Full Prowler Security Audit (All Services)</option>
                  <option value="CIS_BENCHMARK">CIS Foundations Benchmark Compliance</option>
                  <option value="IAM_AND_STORAGE">Identity, Access & Storage Security</option>
                  <option value="QUICK_SCAN">Critical & High Vulnerability Triage</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-200">
                Prowler will assess cryptographic controls, IAM policies, network security groups, and storage access rules.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button type="button" onClick={() => setShowScanModal(false)} className={ghostButtonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className={buttonClass}>
                  {isSubmitting ? "Running Prowler..." : "Start Scan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: FINDING REMEDIATION DRAWER */}
      {/* ========================================================= */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="glass-panel max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-white/10 space-y-5 shadow-2xl shadow-cyan-950/40">
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StateBadge state={selectedFinding.severity} />
                  <StateBadge state={selectedFinding.status} />
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {selectedFinding.provider} : {selectedFinding.service.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{selectedFinding.check_title}</h3>
                <div className="text-xs text-slate-400 font-mono">{selectedFinding.check_id}</div>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-slate-400 hover:text-white text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Target Details */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/60 p-3 rounded-lg border border-white/5">
              <div>
                <span className="text-slate-400">Target Resource:</span>
                <div className="text-slate-200 font-mono text-[11px] truncate mt-0.5">
                  {selectedFinding.resource_name || selectedFinding.resource_id}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Region:</span>
                <div className="text-slate-200 font-mono mt-0.5">{selectedFinding.region}</div>
              </div>
              {selectedFinding.affected_asset_name && (
                <div className="col-span-2">
                  <span className="text-slate-400">Cataloged Asset Inventory:</span>
                  <div className="text-cyan-300 font-medium text-[11px] mt-0.5">
                    {selectedFinding.affected_asset_name}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-slate-400">Resource ARN / URI:</span>
                <div className="text-slate-300 font-mono text-[11px] break-all mt-0.5">
                  {selectedFinding.resource_id}
                </div>
              </div>
            </div>

            {/* Finding Description / Status Extended */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-semibold text-slate-200">Defect Analysis & Evidence</h4>
              <p className="text-slate-300 leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-white/5">
                {selectedFinding.status_extended}
              </p>
            </div>

            {/* Compliance Frameworks */}
            {selectedFinding.compliance && selectedFinding.compliance.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <h4 className="font-semibold text-slate-200">Compliance Citations</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedFinding.compliance.map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Remediation Instructions */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-semibold text-slate-200">Remediation Guidance</h4>
              <p className="text-slate-300 leading-relaxed">{selectedFinding.remediation_recommendation_text}</p>
              {selectedFinding.remediation_recommendation_url && (
                <a
                  href={selectedFinding.remediation_recommendation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs mt-1"
                >
                  <span>Official Remediation Documentation</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Remediation Code Snippet */}
            {selectedFinding.remediation_code && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-200">Remediation CLI / Terraform Snippet</h4>
                  <button
                    onClick={() => copyToClipboard(selectedFinding.remediation_code)}
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? "Copied" : "Copy Fix"}</span>
                  </button>
                </div>
                <div className="relative rounded-lg bg-black/80 border border-white/10 p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre">
                  {selectedFinding.remediation_code}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateFindingStatus(selectedFinding.id, "resolve")}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-md shadow-emerald-950/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Resolved
                </button>
                <button
                  onClick={() => handleUpdateFindingStatus(selectedFinding.id, "suppress")}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/5 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Accept Risk
                </button>
              </div>
              <button onClick={() => setSelectedFinding(null)} className={ghostButtonClass}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
