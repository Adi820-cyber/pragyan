import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ReskureApi } from "@/legacy/api";
import { CheckCircle2, ShieldCheck, FileText, UploadCloud, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const [controls, posture] = await Promise.all([
    ReskureApi.getControls(),
    ReskureApi.getCompliancePosture(),
  ]);

  // Group controls by function/domain
  const domains = Array.from(new Set(controls.map((c) => c.domain)));

  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Compliance & Framework Controls"
          subtitle="NIST Cybersecurity Framework 2.0 (Continuous Assessment & Evidence Vault)"
        />

        <main className="p-8 space-y-8 flex-1 overflow-y-auto">
          {/* Top Posture Strip */}
          <div className="glass-panel p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-bold text-white">NIST CSF 2.0 System Baseline</div>
                <div className="text-xs text-slate-400">
                  {posture.implemented} of {posture.total_controls} controls operational across 6 core functions
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl font-extrabold text-emerald-400">
                  {posture.compliance_posture_percentage}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Audit Posture</div>
              </div>
              <button className="px-4 py-2 rounded-xl bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors">
                <UploadCloud className="w-4 h-4" />
                <span>Upload Evidence</span>
              </button>
            </div>
          </div>

          {/* Grouped Controls List */}
          <div className="space-y-6">
            {domains.map((domain) => {
              const domainControls = controls.filter((c) => c.domain === domain);
              return (
                <div key={domain} className="glass-panel p-6">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      {domain}
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {domainControls.length} Control{domainControls.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {domainControls.map((ctrl) => {
                      const isDone = ctrl.status === "IMPLEMENTED";
                      return (
                        <div
                          key={ctrl.id}
                          className="p-4 rounded-xl bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 transition-all flex items-start justify-between gap-4"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                isDone
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-cyan-400">{ctrl.code}</span>
                                <span className="text-xs font-semibold text-slate-200">{ctrl.title}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">{ctrl.description}</p>
                              {ctrl.implementation_guidance && (
                                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-950/60 p-2 rounded-md border border-white/5">
                                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span>Guidance: {ctrl.implementation_guidance}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-3">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                                isDone
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                              }`}
                            >
                              {ctrl.status.replace("_", " ")}
                            </span>
                            <button className="text-slate-400 hover:text-white p-1">
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
