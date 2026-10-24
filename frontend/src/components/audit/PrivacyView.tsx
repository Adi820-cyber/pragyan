"use client";

import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

export function PrivacyView({ results, systemId }: { results: CheckResult[]; systemId: string }) {
  if (results.length === 0) return <p className="text-sm text-zinc-500">Privacy checks were not part of this run.</p>;
  const indicators = results.filter((r) => r.metric === "pii_column");
  const rest = results.filter((r) => r.metric !== "pii_column");
  const text = results.filter((r) => r.metric === "pii_text_rows" && r.state === "review_required");

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400 leading-relaxed">
        Detectors inspect data for patterns that indicate personally identifiable information (PII). Treat each flagged column as a prompt for compliance review. Matched values are strictly masked.
      </p>

      {indicators.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Columns that may hold personal data</caption>
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-800 bg-zinc-900/60">
                <th scope="col" className="p-3 font-medium">Dataset: column</th>
                <th scope="col" className="p-3 font-medium">Inferred Type</th>
                <th scope="col" className="p-3 font-medium">Detection Basis</th>
                <th scope="col" className="p-3 font-medium">Masked Samples</th>
                <th scope="col" className="p-3 font-medium">Model Input?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {indicators.map((r) => (
                <tr key={r.id} className="align-top hover:bg-zinc-800/20 transition-colors">
                  <th scope="row" className="p-3 text-left font-medium text-zinc-200 font-mono text-[11px]">{r.subject.replace(":", ": ")}</th>
                  <td className="p-3 text-zinc-200">{r.detail.label}</td>
                  <td className="p-3">
                    <StateBadge state={r.detail.confidence === "detected" ? "review_required" : "insufficient_evidence"} label={r.detail.confidence === "detected" ? "Pattern match" : "Name only: confirm"} />
                    {r.detail.match_count > 0 && (
                      <div className="text-zinc-500 tabular-nums text-[11px] mt-1">
                        {Number(r.detail.match_count).toLocaleString()} of {Number(r.detail.scanned_values).toLocaleString()} values
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-zinc-300 font-mono text-[11px]">{(r.detail.masked_samples as string[])?.join(", ") || "none"}</td>
                  <td className="p-3 text-zinc-300">{r.detail.used_as_model_input ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {text.length > 0 && (
        <div className="text-xs text-amber-200 rounded-md border border-amber-900/50 bg-amber-950/25 p-3.5 leading-relaxed">
          <strong className="font-semibold text-amber-100">Personal Data Detected in Telemetry Text:</strong> Personal data patterns were identified inside prompts, model outputs, or source documents. When an answer surfaces sensitive data not present in the input prompt, review immediately. Samples are masked.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">{rest.map((r) => <ResultCard key={r.id} r={r} />)}</div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span>
          Automated scanning is one part of readiness. Notice, lawful basis, security measures, breach response, and rights handling require operational evidence.
        </span>
        <Link
          href={`/controls?system=${systemId}`}
          className="inline-flex items-center text-zinc-100 font-medium hover:text-white underline underline-offset-4 decoration-zinc-600 hover:decoration-zinc-300 shrink-0 text-xs transition-colors"
        >
          Open Governance Controls Checklist &rarr;
        </Link>
      </div>
    </div>
  );
}

