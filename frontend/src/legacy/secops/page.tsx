import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SecOpsFeed } from "@/components/dashboard/SecOpsFeed";
import { ReskureApi } from "@/legacy/api";
import { Radio, ShieldAlert, Cpu, Server, Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SecOpsPage() {
  const alerts = await ReskureApi.getAlerts();

  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Unified SecOps Triage & Containment"
          subtitle="Real-time SIEM/CSPM alert normalization & response orchestration"
        />

        <main className="p-8 space-y-8 flex-1 overflow-y-auto">
          {/* Connector Health Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">AWS Security Hub</div>
                <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-beacon"></span> Connected
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Azure Defender</div>
                <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-beacon"></span> Connected
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Wazuh SIEM / XDR</div>
                <div className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-beacon"></span> Ingesting
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Google Cloud SCC</div>
                <div className="text-[10px] text-amber-400 font-medium">Standby Mode</div>
              </div>
            </div>
          </div>

          {/* Alert Stream & Containment Trigger */}
          <SecOpsFeed alerts={alerts} />
        </main>
      </div>
    </div>
  );
}
