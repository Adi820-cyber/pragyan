"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { ghostButtonClass } from "@/components/ui/Panel";

export function LoadSampleButton({
  scenario = "finsum",
  label,
}: {
  scenario?: "finsum" | "compas";
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      await call("POST", "ai/demo/seed/", { scenario });
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const defaultLabel =
    scenario === "compas" ? "Load COMPAS Example (Classifier)" : "Load FinSum Sample (LLM)";

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className={ghostButtonClass}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <FlaskConical className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
        )}
        <span>{busy ? "Seeding dataset..." : label ?? defaultLabel}</span>
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
