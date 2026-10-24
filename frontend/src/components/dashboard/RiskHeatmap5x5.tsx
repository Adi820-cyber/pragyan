"use client";

import { useState } from "react";
import { AlertCircle, Flame, ShieldAlert, Sparkles } from "lucide-react";
import { Risk } from "@/lib/types";

const LIKELIHOOD_LABELS = ["Rare (1)", "Unlikely (2)", "Moderate (3)", "Likely (4)", "Almost Certain (5)"];
const IMPACT_LABELS = ["Negligible (1)", "Minor (2)", "Moderate (3)", "Major (4)", "Severe (5)"];

export function RiskHeatmap5x5({ risks }: { risks: Risk[] }) {
  const [selectedCell, setSelectedCell] = useState<{ l: number; i: number } | null>(null);

  // Build 5x5 matrix of risks [likelihood-1][impact-1]
  const matrix: Risk[][][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => [])
  );

  risks.forEach((r) => {
    const lIdx = Math.max(0, Math.min(4, r.inherent_likelihood - 1));
    const iIdx = Math.max(0, Math.min(4, r.inherent_impact - 1));
    matrix[lIdx][iIdx].push(r);
  });

  const getCellSeverityClass = (score: number) => {
    if (score >= 20) return "severity-critical";
    if (score >= 13) return "severity-high";
    if (score >= 6) return "severity-medium";
    return "severity-low";
  };

  const selectedRisks = selectedCell ? matrix[selectedCell.l][selectedCell.i] : [];

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-400" />
            Cybersecurity Risk Matrix (5×5 Likelihood × Impact)
          </h2>
          <p className="text-xs text-slate-400">
            Standard GRC 1–25 scoring matrix. Hover/click cell to inspect risks.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Critical (20–25)
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span> High (13–19)
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Medium (6–12)
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Low (1–5)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* 5x5 Matrix Grid */}
        <div className="lg:col-span-7">
          <div className="relative pl-8 pb-8">
            {/* Y-Axis Label: Likelihood */}
            <div className="absolute -left-6 top-1/2 -rotate-90 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Likelihood ↑
            </div>

            <div className="space-y-2">
              {[4, 3, 2, 1, 0].map((lIdx) => (
                <div key={lIdx} className="flex items-center gap-2">
                  <div className="w-20 text-[11px] font-semibold text-slate-400 text-right pr-2 truncate">
                    {LIKELIHOOD_LABELS[lIdx].split(" ")[0]} ({lIdx + 1})
                  </div>
                  <div className="grid grid-cols-5 gap-2 flex-1">
                    {[0, 1, 2, 3, 4].map((iIdx) => {
                      const score = (lIdx + 1) * (iIdx + 1);
                      const count = matrix[lIdx][iIdx].length;
                      const isSelected = selectedCell?.l === lIdx && selectedCell?.i === iIdx;
                      const severityClass = getCellSeverityClass(score);

                      return (
                        <button
                          key={iIdx}
                          onClick={() => setSelectedCell({ l: lIdx, i: iIdx })}
                          className={`heatmap-cell ${severityClass} ${
                            isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : ""
                          }`}
                        >
                          <span className="text-xs font-bold">{score}</span>
                          {count > 0 && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-white text-slate-950 mt-0.5 shadow-sm">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* X-Axis Label: Impact */}
            <div className="flex pl-20 pt-2 gap-2">
              {[0, 1, 2, 3, 4].map((iIdx) => (
                <div key={iIdx} className="flex-1 text-center text-[10px] font-semibold text-slate-400 truncate">
                  {IMPACT_LABELS[iIdx].split(" ")[0]} ({iIdx + 1})
                </div>
              ))}
            </div>
            <div className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 pl-20">
              Impact →
            </div>
          </div>
        </div>

        {/* Selected Cell Risk Inspector */}
        <div className="lg:col-span-5 bg-slate-950/60 rounded-xl border border-white/10 p-4 h-[320px] flex flex-col justify-between overflow-hidden">
          {selectedCell ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  Cell ({selectedCell.l + 1}×{selectedCell.i + 1}) • Score: {(selectedCell.l + 1) * (selectedCell.i + 1)}
                </div>
                <span className="text-[10px] font-medium text-slate-400">
                  {selectedRisks.length} Risk{selectedRisks.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto mt-2 space-y-2 pr-1">
                {selectedRisks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                    <Sparkles className="w-6 h-6 text-slate-400 mb-1" />
                    No active risks positioned in this coordinate.
                  </div>
                ) : (
                  selectedRisks.map((r) => (
                    <div
                      key={r.id}
                      className="p-2.5 rounded-lg bg-slate-900/80 border border-white/5 hover:border-cyan-500/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-cyan-300">{r.identifier}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                          {r.inherent_severity}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-200 mt-1 line-clamp-1">{r.title}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                        <span>Owner: {r.owner_name || "Unassigned"}</span>
                        <span>Residual: {r.residual_score}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <AlertCircle className="w-8 h-8 text-cyan-400/60 mb-2" />
              <div className="text-xs font-bold text-slate-200">Interactive Risk Inspector</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Click any cell in the 5×5 grid to view the risks, owners, and mitigating controls.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
