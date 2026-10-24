import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ReskureApi } from "@/legacy/api";
import { GitPullRequest, CheckCircle2, XCircle, ShieldCheck, Clock, UserCheck, AlertOctagon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const approvals = await ReskureApi.getApprovals();

  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Approvals & Governance Chains"
          subtitle="Multi-step sequential, parallel, and quorum sign-offs with Segregation of Duties enforcement"
        />

        <main className="p-8 space-y-6 flex-1 overflow-y-auto">
          {/* SoD Architecture Banner */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-purple-200">Segregation of Duties (SoD) Active: </span>
              <span className="text-purple-300/80">
                Reskure enforces strict toxic-combination rules at the authorization layer. Requesters cannot approve their own containment or risk acceptance sign-offs, and evidence uploaders cannot attest to their own evidence.
              </span>
            </div>
          </div>

          {/* Approvals List */}
          <div className="space-y-4">
            {approvals.map((req) => {
              const isPending = req.status === "PENDING";
              return (
                <div
                  key={req.id}
                  className="glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isPending
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {isPending ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{req.title}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPending
                              ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                        <span>Requester: <strong className="text-slate-300">{req.requester_name || "System"}</strong></span>
                        <span>•</span>
                        <span>Scope: {req.entity_type}</span>
                        <span>•</span>
                        <span>Created: {new Date(req.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors">
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                      <button className="px-4 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm shadow-emerald-500/20">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Sign Off</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
