"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { buttonClass } from "@/components/ui/Panel";

export function GenerateReportButton({ runId, label = "Generate report" }: { runId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const report = await call<{ id: string }>("POST", "ai/reports/", { run: runId });
      router.push(`/reports/${report.id}`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className={buttonClass} disabled={busy} onClick={generate}>
        <FilePlus2 className="w-4 h-4" aria-hidden="true" /> {busy ? "Generating..." : label}
      </button>
      {error && <p role="alert" className="text-xs text-rose-300 mt-2">{error}</p>}
    </div>
  );
}