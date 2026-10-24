"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { buttonClass } from "@/components/ui/Panel";

export function LoadSampleButton({ scenario = "finsum", label }: { scenario?: "finsum" | "compas"; label?: string }) {
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

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <button type="button" onClick={load} disabled={busy} className={buttonClass}>
        <FlaskConical className="w-4 h-4" aria-hidden="true" />
        {busy ? "Loading..." : (label ?? (scenario === "compas" ? "Load a real-data example (COMPAS)" : "Load the LLM sample (FinSum)"))}
      </button>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
