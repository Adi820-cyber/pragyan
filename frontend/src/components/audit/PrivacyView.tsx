"use client";

import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

export function PrivacyView({ results, systemId }: { results: CheckResult[]; systemId: string }) {
  if (results.length === 0) return <p className="text-sm text-slate-400">Privacy checks were not part of this run.</p>;
  const indicators = results.filter((r) => r.metric === "pii_column");
  const rest = results.filter((r) => r.metric !== "pii_column");

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Detectors look for patterns that suggest personal data. They can miss data and can flag things that are not personal data, so treat each row as a prompt to check. Matched values are always masked.
      </p>

      {indicators.length > 0 && (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Columns that may hold personal data</caption>
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th scope="col" className="p-2 font-medium">Dataset: column</th>
                <th scope="col" className="p-2 font-medium">Looks like</th>
                <th scope="col" className="p-2 font-medium">Basis</th>
                <th scope="col" className="p-2 font-medium">Masked examples</th>
                <th scope="col" className="p-2 font-medium">Model input?</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top">
                  <th scope="row" className="p-2 text-left font-medium text-slate-100">{r.subject.replace(":", ": ")}</th>
                  <td className="p-2 text-slate-200">{r.detail.label}</td>
                  <td className="p-2">
                    <StateBadge state={r.detail.confidence === "detected" ? "review_required" : "insufficient_evidence"} label={r.detail.confidence === "detected" ? "Pattern match" : "Name only: confirm"} />
                    {r.detail.match_count > 0 && <div className="text-slate-400 mt-1">{Number(r.detail.match_count).toLocaleString()} of {Number(r.detail.scanned_values).toLocaleString()} values</div>}
                  </td>
                  <td className="p-2 text-slate-300 font-mono">{(r.detail.masked_samples as string[])?.join(", ") || "none"}</td>
                  <td className="p-2 text-slate-300">{r.detail.used_as_model_input ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">{rest.map((r) => <ResultCard key={r.id} r={r} />)}</div>

      <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-200">
        Data scanning is one part of readiness. Notice, lawful basis, security measures, breach response and rights handling need evidence and a reviewer.{" "}
        <Link href={`/controls?system=${systemId}`} className="text-cyan-300 hover:text-cyan-200 underline">
          Open the DPDP / GDPR checklist
        </Link>
      </div>
    </div>
  );
}
