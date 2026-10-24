"use client";

import { StateBadge } from "@/components/ui/StateBadge";
import { ResultCard, formatValue } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

const ROWS: { key: string; label: string }[] = [
  { key: "groundedness", label: "Average share of an answer found in its source" },
  { key: "unsupported_numbers", label: "Answers with a figure not in the source" },
  { key: "citations", label: "Answers that cite a source" },
];

export function GroundingView({ results }: { results: CheckResult[] }) {
  if (results.length === 0) return <p className="text-sm text-zinc-500">Groundedness was not part of this run.</p>;
  const order = ["reference", "current"];
  const periods = Array.from(new Set(results.map((r) => r.subject).filter(Boolean))).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const lowest = results.find((r) => r.check_key === "groundedness" && Array.isArray(r.detail.lowest_rows));
  const notAssessed = results.filter((r) => r.state === "not_applicable" && r.check_key === "groundedness");

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400 leading-relaxed">
        Groundedness here is lexical: it measures how much of an answer&apos;s content also appears in the source it was given, and whether it states figures that appear nowhere in the source or prompt.
        It identifies which answers require manual review. It does not prove an answer is factually correct or incorrect.
      </p>
      {notAssessed.map((r) => <ResultCard key={r.id} r={r} />)}

      {periods.length > 0 && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Groundedness measures for each period</caption>
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-800 bg-zinc-900/60">
                <th scope="col" className="p-3 font-medium">Measure</th>
                {periods.map((p) => <th key={p} scope="col" className="p-3 font-medium capitalize">{p}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {ROWS.map((row) => (
                <tr key={row.key} className="align-top hover:bg-zinc-800/20 transition-colors">
                  <th scope="row" className="p-3 text-left font-medium text-zinc-200">{row.label}</th>
                  {periods.map((p) => {
                    const r = results.find((x) => x.check_key === row.key && x.subject === p);
                    return (
                      <td key={p} className="p-3">
                        {r && r.value !== null ? (
                          <>
                            <div className="text-zinc-100 text-sm font-medium tabular-nums">{formatValue(r)}</div>
                            {r.ci_low !== null && r.ci_high !== null && (
                              <div className="text-zinc-500 tabular-nums mt-0.5">95% interval {formatValue({ ...r, value: r.ci_low })} to {formatValue({ ...r, value: r.ci_high })}</div>
                            )}
                            <div className="mt-1.5"><StateBadge state={r.state} /></div>
                          </>
                        ) : r ? (
                          <StateBadge state={r.state} />
                        ) : (
                          <span className="text-zinc-500">n/a</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {results.filter((r) => r.state !== "no_alert" || r.check_key === "unsupported_numbers").map((r) => <ResultCard key={r.id} r={r} />)}
      </div>

      {lowest && (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-300">
          <h3 className="font-semibold text-zinc-100 mb-1">Target Inspection Points</h3>
          <p className="leading-relaxed">
            The lowest-overlap answers in the {lowest.subject} data are rows <span className="font-mono text-zinc-200">{(lowest.detail.lowest_rows as number[]).slice(0, 10).map((n) => n + 1).join(", ")}</span> of your file (counting from 1).
            Their text is not stored in Reskure: inspect them directly in your telemetry log.
          </p>
        </div>
      )}
    </div>
  );
}

