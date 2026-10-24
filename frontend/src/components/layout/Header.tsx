import { LogOut, UserRound } from "lucide-react";
import { logout, switchTenant } from "@/app/login/actions";
import type { Me } from "@/lib/types";

export function Header({ title, subtitle, me }: { title: string; subtitle?: string; me: Me }) {
  const name = me.full_name || me.username;
  return (
    <header className="h-16 border-b border-white/10 bg-[#070b14]/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-white tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {me.memberships.length > 1 && (
          <form action={switchTenant} className="flex items-center gap-2">
            <label htmlFor="tenant-switch" className="text-xs text-slate-400">
              Organisation
            </label>
            <select
              id="tenant-switch"
              name="tenant"
              defaultValue={me.active_membership?.tenant_id}
              className="rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-100 px-2 py-1.5"
            >
              {me.memberships.map((m) => (
                <option key={m.tenant_id} value={m.tenant_id}>
                  {m.tenant_name}
                </option>
              ))}
            </select>
            <button type="submit" className="text-xs text-cyan-300 hover:text-cyan-200 px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400">
              Switch
            </button>
          </form>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <UserRound className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span>{name}</span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
