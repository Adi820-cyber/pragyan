import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RiskHeatmap5x5 } from "@/components/dashboard/RiskHeatmap5x5";
import { ComplianceGauge } from "@/components/dashboard/ComplianceGauge";
import { SecOpsFeed } from "@/components/dashboard/SecOpsFeed";
import { ReskureApi } from "@/legacy/api";
import {
  ShieldAlert,
  CheckCircle2,
  Server,
  GitPullRequest,
  Lock,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [risks, posture, alerts, approvals] = await Promise.all([
    ReskureApi.getRisks(),
    ReskureApi.getCompliancePosture(),
    ReskureApi.getAlerts(),
    ReskureApi.getApprovals(),
  ]);

  const criticalRisksCount = risks.filter((r) => r.inherent_severity === "CRITICAL").length;

  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Executive Command Center"
          subtitle="Real-time multi-tenant GRC, risk quantification & SecOps posture"
        />

        <main className="p-8 space-y-8 flex-1 overflow-y-auto">
          {/* Top Key Metrics Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <MetricCard
              title="Critical Risks"
              value={criticalRisksCount}
              subValue="5x5 Score ≥ 20 (High Exposure)"
              icon={ShieldAlert}
              variant="rose"
              badge="Appetite: Max 0"
            />
            <MetricCard
              title="Compliance Posture"
              value={`${posture.compliance_posture_percentage}%`}
              subValue="NIST CSF 2.0 Operating Controls"
              icon={CheckCircle2}
              variant="emerald"
              badge="Target: 100%"
            />
            <MetricCard
              title="Monitored Cloud Assets"
              value="18"
              subValue="AWS Aurora, S3, IAM, Azure SQL"
              icon={Server}
              variant="cyan"
              badge="Prowler / CSPM Sync"
            />
            <MetricCard
              title="Pending Approvals"
              value={approvals.filter((a) => a.status === "PENDING").length}
              subValue="Segregation of Duties Enforced"
              icon={GitPullRequest}
              variant="purple"
              badge="Requires Lead Sign-off"
            />
          </div>

          {/* Central Grid: 5x5 Heatmap + Compliance Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <RiskHeatmap5x5 risks={risks} />
            </div>
            <div className="lg:col-span-4">
              <ComplianceGauge stats={posture} />
            </div>
          </div>

          {/* SecOps & Security Operations Stream */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <SecOpsFeed alerts={alerts} />
            </div>

            {/* Quick Architecture Proof Panel */}
            <div className="lg:col-span-4 glass-panel p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    Clean-Room Architecture
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Proprietary Safe
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-white/5">
                    <div className="font-semibold text-slate-200">Hard Tenant Isolation</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Row-Level Security (PostgreSQL RLS) enforced independently of user roles.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-white/5">
                    <div className="font-semibold text-slate-200">Zero Copyleft Contamination</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Clean-room Django core referencing permissive standards (MIT, Apache-2.0, BSD-3, CC0).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-white/5">
                    <div className="font-semibold text-slate-200">Central Policy Engine</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Deterministic RBAC + ABAC scoping + Segregation of Duties checks with audit logs.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 mt-4 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">OpenAPI Interactive Docs</span>
                <a
                  href="http://localhost:8000/api/docs/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors"
                >
                  Swagger UI <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
