import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-zinc-100 tracking-tight leading-tight">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5 leading-tight">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 p-8 md:p-12 text-center">
      <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
        <Inbox className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {description && <p className="text-xs text-zinc-400 mt-1.5 max-w-md mx-auto">{description}</p>}
      {children && <div className="text-xs text-zinc-400 mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Failed to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-200 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="text-xs font-semibold text-red-200">{title}</h3>
          <p className="text-xs text-red-200/80 mt-0.5">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-200 hover:text-white bg-red-500/20 hover:bg-red-500/30 px-2.5 py-1.5 rounded-md transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-300">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-zinc-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-800/60 rounded-md ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
      <div className="border-b border-zinc-800 p-3 bg-zinc-900/60 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-zinc-800/60 p-2 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 py-2 px-2">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:border-transparent";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 shadow-xs cursor-pointer";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-200 text-xs font-medium px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer";

export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer";
