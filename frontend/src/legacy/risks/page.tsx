import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ReskureApi } from "@/legacy/api";
import { AlertTriangle, Filter, Plus, Shield, Search, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RisksPage() {
  const risks = await ReskureApi.getRisks();

  return (
    <div className="flex min-h-screen bg-[#060913] text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Enterprise Risk Register & 5×5 Matrix"
          subtitle="System of record for cyber risks, threat models, and treatment workflows"
        />

        <main className="p-8 space-y-6 flex-1 overflow-y-auto">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 max-w-md bg-slate-900/80 border border-white/10 px-3 py-2 rounded-xl text-xs text-slate-300">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search risks by ID, title, threat, or owner..."
                className="bg-transparent focus:outline-none w-full placeholder:text-slate-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
              </button>
              <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all">
                <Plus className="w-4 h-4" />
                <span>New Risk Item</span>
              </button>
            </div>
          </div>

          {/* Risk Table */}
          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-3.5 px-4">Identifier</th>
                    <th className="py-3.5 px-4">Risk Title & Details</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4 text-center">Inherent (L×I)</th>
                    <th className="py-3.5 px-4 text-center">Residual (L×I)</th>
                    <th className="py-3.5 px-4">Treatment</th>
                    <th className="py-3.5 px-4">Owner</th>
                    <th className="py-3.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {risks.map((risk) => {
                    const isCrit = risk.inherent_severity === "CRITICAL";
                    const isHigh = risk.inherent_severity === "HIGH";

                    return (
                      <tr key={risk.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-4 font-bold text-cyan-400">{risk.identifier}</td>
                        <td className="py-4 px-4 max-w-sm">
                          <div className="font-semibold text-slate-200">{risk.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {risk.description}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-white/5 text-[10px] font-semibold text-slate-300">
                            {risk.category}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`inline-flex items-center justify-center font-bold px-2.5 py-1 rounded-md text-xs ${
                              isCrit
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : isHigh
                                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {risk.inherent_score}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                            {risk.residual_score}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-[11px] font-medium text-slate-300">
                            {risk.treatment_strategy}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-xs text-slate-200 font-medium">{risk.owner_name}</div>
                          <div className="text-[10px] text-slate-400">{risk.org_unit_name}</div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-semibold">
                            {risk.status.replace("_", " ")}
                          </span>
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
