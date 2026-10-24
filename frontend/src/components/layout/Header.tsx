import { LogOut, User } from "lucide-react";
import { logout, switchTenant } from "@/app/login/actions";
import type { Me } from "@/lib/types";

export function Header({ title, subtitle, me }: { title: string; subtitle?: string; me: Me }) {
  const name = me.full_name || me.username;
  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm px-6 md:px-8 flex items-center justify-between sticky top-0 z-20 shrink-0">
      <div className="min-w-0 pr-4">
        <h1 className="text-sm font-semibold text-zinc-100 tracking-tight truncate leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-400 truncate mt-0.5 leading-tight">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {me.memberships.length > 1 && (
          <form action={switchTenant} className="flex items-center gap-2">
            <label htmlFor="tenant-switch" className="text-xs text-zinc-400 font-medium">
              Org
            </label>
            <select
              id="tenant-switch"
              name="tenant"
              defaultValue={me.active_membership?.tenant_id}
              className="rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              {me.memberships.map((m) => (
                <option key={m.tenant_id} value={m.tenant_id}>
                  {m.tenant_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 font-medium"
            >
              Switch
            </button>
          </form>
        )}

        <div className="flex items-center gap-1.5 text-xs text-zinc-300 px-2 py-1 rounded-md bg-zinc-900/60 border border-zinc-800">
          <User className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          <span className="font-medium max-w-[140px] truncate">{name}</span>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Sign out of your account"
          >
            <LogOut className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
