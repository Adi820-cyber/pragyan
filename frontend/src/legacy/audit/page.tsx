import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FileText, ShieldCheck, ShieldAlert, Lock, Search, Filter } from "lucide-react";

const DEMO_DECISIONS = [
  {
    id: "dec-001",
    actor_email: "ciso@acme.com",
    permission: "risk.approve",
    resource: "Risk: RSK-001",
    decision: "ALLOW",
    reason: "Access permitted by TENANT_ADMIN coarse role and org unit scope.",
    timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
  {
    id: "dec-002",
    actor_email: "lead.dev@acme.com",
    permission: "risk.approve",
    resource: "Risk: RSK-002",
    decision: "DENY",
    reason: "Segregation of Duties: Requester/Creator is strictly prohibited from approving their own request.",
    timestamp: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
  },
  {
    id: "dec-003",
    actor_email: "external.user@unauthorized.io",
    permission: "risk.read",
    resource: "Risk: RSK-001",
    decision: "DENY",
    reason: "Hard Tenant Isolation violation: Actor and resource belong to different tenants.",
    timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
  },
  {
    id: "dec-004",
    actor_email: "compliance.lead@acme.com",
    permission: "evidence.verify",
    resource: "Evidence: EV-004",
    decision: "ALLOW",
    reason: "Access permitted by COMPLIANCE_OFFICER role; verified actor != uploader.",
    timestamp: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
  },
];

export default function AuditPage() {
  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Immutable Decision & Audit Trail"
          subtitle="Continuous access decision logging from Reskure central PolicyEngine"
        />

        <main className="p-8 space-y-6 flex-1 overflow-y-auto">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 max-w-md bg-slate-900/80 border border-white/10 px-3 py-2 rounded-xl text-xs text-slate-300">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit decisions by actor, permission, or reason..."
                className="bg-transparent focus:outline-none w-full placeholder:text-slate-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter Decisions</span>
              </button>
            </div>
          </div>

          {/* Audit Decision Table */}
          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3.5 px-4">Evaluation Timestamp</th>
                    <th className="py-3.5 px-4">Actor Email</th>
                    <th className="py-3.5 px-4">Permission Token</th>
                    <th className="py-3.5 px-4">Target Resource</th>
                    <th className="py-3.5 px-4">Engine Decision</th>
                    <th className="py-3.5 px-4">Policy Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {DEMO_DECISIONS.map((dec) => {
                    const isAllowed = dec.decision === "ALLOW";
                    return (
                      <tr key={dec.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-4 font-mono text-[11px] text-slate-400">
                          {new Date(dec.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-200">{dec.actor_email}</td>
                        <td className="py-4 px-4">
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-white/5">
                            {dec.permission}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-300">{dec.resource}</td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isAllowed
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {isAllowed ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                            {dec.decision}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400 text-[11px] max-w-md">
                          {dec.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
