"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { ghostButtonClass } from "@/components/ui/Panel";
import { Loader2 } from "lucide-react";
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
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 space-y-5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StateBadge state={run.status} />
          {active && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-hidden="true" />}
          <span className="text-sm font-medium text-zinc-200">
            {run.progress_message || (run.status === "queued" ? "Queued for audit pipeline" : "Evaluating checks...")}
          </span>
        </div>
        {active && (
          <button type="button" onClick={cancel} className={ghostButtonClass}>
            Cancel run
          </button>
        )}
      </div>

      <div
        className="h-2 rounded-full bg-zinc-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={run.progress ?? 0}
      >
        <div
          className="h-full bg-zinc-100 transition-all duration-300"
          style={{ width: `${Math.max(5, run.progress ?? 0)}%` }}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <p className="text-xs text-zinc-400">
        Checks run in the background. Fairness gaps, drift metrics, and explanation metrics will appear here once complete.
      </p>
    </div>
  );
}
