import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  variant?: "cyan" | "emerald" | "amber" | "rose" | "purple";
  badge?: string;
}

export function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  variant = "cyan",
  badge,
}: MetricCardProps) {
  const variantStyles = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  };

  return (
    <div className="glass-panel p-5 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</div>
          <div className="text-2xl font-extrabold text-white mt-1 tracking-tight">{value}</div>
          {subValue && <div className="text-xs text-slate-400 mt-1">{subValue}</div>}
        </div>
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${variantStyles[variant]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {badge && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Target threshold</span>
          <span className="font-semibold text-slate-300">{badge}</span>
        </div>
      )}
    </div>
  );
}
