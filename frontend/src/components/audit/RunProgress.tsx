"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { ghostButtonClass } from "@/components/ui/Panel";
import type { AuditRun } from "@/lib/types";

export function RunProgress({ run: initial }: { run: AuditRun }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (run.status !== "queued" && run.status !== "running") return;
    const timer = setInterval(async () => {
      try {
        const next = await call<AuditRun>("GET", `ai/runs/${run.id}/`);
        setRun(next);
        if (next.status !== "queued" && next.status !== "running" && !settled.current) {
          settled.current = true;
          router.refresh();
        }
      } catch (e) {
        setError(errText(e));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [run.id, run.status, router]);

  async function cancel() {
    try {
      setRun(await call<AuditRun>("POST", `ai/runs/${run.id}/cancel/`));
    } catch (e) {
      setError(errText(e));
    }
  }

  const active = run.status === "queued" || run.status === "running";

  return (
    <div className="glass-panel p-6 space-y-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StateBadge state={run.status} />
          <span className="text-sm text-slate-200">{run.progress_message || "Waiting"}</span>
        </div>
        {active && (
          <button type="button" onClick={cancel} className={ghostButtonClass}>
            Cancel
          </button>
        )}
      </div>
      <div
        className="h-2 rounded-full bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={run.progress}
        aria-label="Audit progress"
      >
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${run.progress}%` }} />
      </div>
      {run.status === "queued" && (
        <p className="text-xs text-slate-400">
          Waiting for the audit worker. If this stays queued, start it with <code className="text-cyan-300">uv run python manage.py run_audit_worker</code> in the backend folder.
        </p>
      )}
      {run.status === "failed" && (
        <p role="alert" className="text-sm text-rose-300">
          The audit did not finish. {run.error}
        </p>
      )}
      {run.status === "cancelled" && <p className="text-sm text-slate-300">This audit was cancelled. No results were saved.</p>}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
