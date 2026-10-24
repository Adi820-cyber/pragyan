"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { ghostButtonClass } from "@/components/ui/Panel";
import { dateTime } from "@/lib/format";
import type { ReportVerification } from "@/lib/types";

export function VerifyFingerprint({ reportId }: { reportId: string }) {
  const [result, setResult] = useState<ReportVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      setResult(await call<ReportVerification>("GET", `ai/reports/${reportId}/verify/`));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className={ghostButtonClass} disabled={busy} onClick={verify}>
        <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {busy ? "Checking..." : "Verify fingerprint"}
      </button>
      <div role="status" aria-live="polite">
        {result && result.valid && (
          <p className="text-xs text-emerald-300">Verified at {dateTime(result.checked_at)}. The stored report and the audit measurements both match the fingerprint.</p>
        )}
        {result && !result.valid && (
          <p className="text-xs text-rose-300">
            Mismatch. {!result.snapshot_matches && "The stored report content no longer matches its fingerprint. "}
            {!result.source_results_match && "The audit measurements changed after this report was frozen. "}
            Do not rely on this version.
          </p>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}