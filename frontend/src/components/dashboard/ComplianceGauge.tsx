"use client";

import { CheckCircle2, ShieldCheck, ArrowUpRight } from "lucide-react";
import Link from "next/link";

interface ComplianceStats {
  total_controls: number;
  implemented: number;
  in_progress: number;
  not_started: number;
  compliance_posture_percentage: number;
}

export function ComplianceGauge({ stats }: { stats: ComplianceStats }) {
  const pct = stats.compliance_posture_percentage || 0;
  const strokeDashoffset = 283 - (283 * pct) / 100;

  return (
    <div className="glass-panel p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Compliance Posture
          </h2>
          <p className="text-xs text-slate-400">NIST CSF 2.0 Continuous Audit</p>
        </div>
        <Link
          href="/compliance"
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
        >
          View Controls <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* SVG Radial Gauge */}
      <div className="flex items-center justify-center my-4 relative">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="45"
              className="stroke-slate-800"
              strokeWidth="8"
              fill="transparent"
            />
            {/* Progress Arc */}
            <circle
              cx="50"
              cy="50"
              r="45"
              className="stroke-emerald-400 transition-all duration-1000 ease-out"
              strokeWidth="8"
              strokeDasharray="283"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-extrabold text-white tracking-tight">{pct}%</span>
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Assessed
            </span>
          </div>
        </div>
      </div>

      {/* Control Breakdown Pills */}
      <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/10">
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-sm font-bold text-emerald-300">{stats.implemented}</div>
          <div className="text-[10px] text-slate-400 font-medium">Operating</div>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="text-sm font-bold text-amber-300">{stats.in_progress}</div>
          <div className="text-[10px] text-slate-400 font-medium">In Progress</div>
        </div>
        <div className="p-2 rounded-lg bg-slate-800/60 border border-white/5">
          <div className="text-sm font-bold text-slate-300">{stats.not_started}</div>
          <div className="text-[10px] text-slate-400 font-medium">Not Started</div>
        </div>
      </div>
    </div>
  );
}
