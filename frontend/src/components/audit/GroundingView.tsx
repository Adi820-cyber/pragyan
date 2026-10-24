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
  if (results.length === 0) return <p className="text-sm text-slate-400">Groundedness was not part of this run.</p>;
  const order = ["reference", "current"];
  const periods = Array.from(new Set(results.map((r) => r.subject).filter(Boolean))).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const lowest = results.find((r) => r.check_key === "groundedness" && Array.isArray(r.detail.lowest_rows));
  const notAssessed = results.filter((r) => r.state === "not_applicable" && r.check_key === "groundedness");

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Groundedness here is lexical: it measures how much of an answer&apos;s content also appears in the source it was given, and whether it states figures that appear nowhere in the source or prompt.
        It tells you which answers to read. It does not prove an answer is true or false, and an answer can be wrong while using the source&apos;s words.
      </p>
      {notAssessed.map((r) => <ResultCard key={r.id} r={r} />)}

      {periods.length > 0 && (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Groundedness measures for each period</caption>
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th scope="col" className="p-2 font-medium">Measure</th>
                {periods.map((p) => <th key={p} scope="col" className="p-2 font-medium capitalize">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key} className="border-b border-white/5 align-top">
                  <th scope="row" className="p-2 text-left font-medium text-slate-100">{row.label}</th>
                  {periods.map((p) => {
                    const r = results.find((x) => x.check_key === row.key && x.subject === p);
                    return (
                      <td key={p} className="p-2">
                        {r && r.value !== null ? (
                          <>
                            <div className="text-slate-100 text-sm">{formatValue(r)}</div>
                            {r.ci_low !== null && r.ci_high !== null && (
                              <div className="text-slate-500">95% interval {formatValue({ ...r, value: r.ci_low })} to {formatValue({ ...r, value: r.ci_high })}</div>
                            )}
                            <div className="mt-1"><StateBadge state={r.state} /></div>
                          </>
                        ) : r ? (
                          <StateBadge state={r.state} />
                        ) : (
                          <span className="text-slate-500">n/a</span>
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
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 text-xs text-slate-300">
          <h3 className="font-semibold text-slate-100 mb-1">Where to look first</h3>
          <p>
            The lowest-overlap answers in the {lowest.subject} data are rows {(lowest.detail.lowest_rows as number[]).slice(0, 10).map((n) => n + 1).join(", ")} of your file (counting from 1).
            Their text is not stored in Reskure: open them in your own log.
          </p>
        </div>
      )}
    </div>
  );
}
