"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Building2,
  Network,
  Shield,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "AI Systems", href: "/systems", icon: Boxes },
  { label: "Audits", href: "/audits", icon: Activity },
  { label: "Packet Traversal", href: "/packet-traversal", icon: Network },
  { label: "Findings & Actions", href: "/findings", icon: ListChecks },
  { label: "Privacy & Controls", href: "/controls", icon: ClipboardCheck },
  { label: "Reports", href: "/reports", icon: FileText },
];

export function Sidebar({ tenantName, roleLabel }: { tenantName: string; roleLabel: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between h-dvh sticky top-0 z-30 select-none shrink-0">
      <div className="flex flex-col">
        {/* Brand header */}
        <div className="h-14 px-4 flex items-center gap-3 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-md bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-zinc-200" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-tight text-zinc-100 leading-none">Reskure</div>
            <div className="text-[11px] text-zinc-400 mt-1 leading-none truncate">Assurance & Audit</div>
          </div>
        </div>

        {/* Navigation list */}
        <nav aria-label="Main Navigation" className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-zinc-100" : "text-zinc-400"}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Tenant Context Footer */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/60">
          <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-zinc-200 truncate">{tenantName}</div>
            <div className="text-[10px] text-zinc-400 truncate">{roleLabel || "Member"}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
