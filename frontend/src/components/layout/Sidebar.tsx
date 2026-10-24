"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, ClipboardCheck, FileText, LayoutDashboard, ListChecks, ShieldCheck, Building2, Network, SlidersHorizontal, Cloud } from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "CISO Assistant", href: "/ciso-assistant", icon: SlidersHorizontal },
  { label: "AI Systems", href: "/systems", icon: Boxes },
  { label: "Cloud Security", href: "/cloud-security", icon: Cloud },
  { label: "Audits", href: "/audits", icon: Activity },
  { label: "Packet Traversal", href: "/packet-traversal", icon: Network },
  { label: "Findings & Actions", href: "/findings", icon: ListChecks },
  { label: "Privacy & Controls", href: "/controls", icon: ClipboardCheck },
  { label: "Reports", href: "/reports", icon: FileText },
];

export function Sidebar({ tenantName, roleLabel }: { tenantName: string; roleLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-white/10 bg-[#080d1a]/95 flex flex-col justify-between h-screen sticky top-0 z-30 select-none">
      <div>
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <div className="font-bold text-base tracking-wide text-white">Reskure</div>
            <div className="text-[11px] text-slate-400">Responsible AI audit</div>
          </div>
        </div>

        <nav aria-label="Main" className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-200 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/10 bg-slate-900/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200 truncate">{tenantName}</div>
            <div className="text-[11px] text-slate-400">{roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
