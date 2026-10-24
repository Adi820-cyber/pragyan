import type { ReactNode } from "react";
import { AlertOctagon, Inbox } from "lucide-react";

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass-panel p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="text-sm font-bold text-white">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="glass-panel p-10 text-center">
      <Inbox className="w-8 h-8 text-slate-500 mx-auto mb-3" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {children && <div className="text-xs text-slate-400 mt-2 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 flex gap-3">
      <AlertOctagon className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold text-rose-200">This page could not load its data</h2>
        <p className="text-xs text-rose-200/80 mt-1">{message}</p>
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300";
export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-medium px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300";
