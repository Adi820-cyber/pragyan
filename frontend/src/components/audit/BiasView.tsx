"use client";

import { Bar, BarChart, CartesianGrid, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "@/lib/format";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

const AGGREGATE_KEYS = ["demographic_parity", "selection_rate_ratio", "equalized_odds", "refusal_gap", "response_length_gap", "score_gap"];

export function BiasView({ results }: { results: CheckResult[] }) {
  const isLlm = results.some((r) => r.check_key === "group_refusal_rate");
  const rateKey = isLlm ? "group_refusal_rate" : "group_selection_rate";
  const rateLabel = isLlm ? "Refusal rate" : "Favourable-outcome rate";
  const groupCols = Array.from(new Set(results.map((r) => r.detail.group_column as string | undefined).filter(Boolean))) as string[];
  const orphan = results.filter((r) => !r.detail.group_column && !AGGREGATE_KEYS.includes(r.check_key));
  const general = results.filter((r) => !r.detail.group_column && r.subject === "" && r.state === "not_applicable");

  if (results.length === 0) {
    return <p className="text-xs text-zinc-400">Fairness and bias evaluations were not configured for this run.</p>;
  }

  return (
    <div className="space-y-8">
      {general.map((r) => (
        <ResultCard key={r.id} r={r} />
      ))}
      {groupCols.map((gcol) => {
        const mine = results.filter((r) => r.detail.group_column === gcol);
        const rows = mine.filter((r) => r.check_key === rateKey);
        const tpr = mine.filter((r) => r.check_key === "group_true_positive_rate");
        const fpr = mine.filter((r) => r.check_key === "group_false_positive_rate");
        const aggregates = results.filter((r) => AGGREGATE_KEYS.includes(r.check_key) && r.subject === gcol);
        const name = (r: CheckResult) => r.subject.split("=").slice(1).join("=");

        const chart = rows.map((r) => ({
          group: name(r),
          rate: r.value ?? 0,
          err: r.ci_low !== null && r.ci_high !== null && r.value !== null ? [r.value - r.ci_low, r.ci_high - r.value] : [0, 0],
          n: r.support_n,
          small: r.state === "insufficient_evidence",
        }));

        return (
          <section key={gcol} aria-labelledby={`bias-${gcol}`} className="space-y-4">
            <h2 id={`bias-${gcol}`} className="text-sm font-semibold text-zinc-100">
              Disparity Screening by Group: <span className="font-mono text-zinc-300">{gcol}</span>
            </h2>
            <div className="grid lg:grid-cols-3 gap-3">
              {aggregates.map((r) => (
                <ResultCard key={r.id} r={r} />
              ))}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
              <h3 className="text-xs font-medium text-zinc-300">
                {rateLabel} by Group (Error bars denote 95% Confidence Intervals)
              </h3>
              <div style={{ height: 240 }} role="img" aria-label={`Bar chart of ${rateLabel.toLowerCase()} by ${gcol} group.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="group" stroke="#a1a1aa" fontSize={11} />
                    <YAxis stroke="#a1a1aa" fontSize={11} tickFormatter={(v) => pct(v, 0)} domain={[0, "auto"]} />
                    <Tooltip
                      formatter={(v) => pct(Number(v))}
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12, borderRadius: "6px" }}
                    />
                    <Bar dataKey="rate" name={rateLabel} fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      <ErrorBar dataKey="err" stroke="#e4e4e7" width={4} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {!isLlm && (tpr.length > 0 || fpr.length > 0) && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
                <h3 className="text-xs font-medium text-zinc-300">Error Disparities by Group (TPR & FPR)</h3>
                <div style={{ height: 220 }} role="img" aria-label={`Bar chart of true and false positive rates by ${gcol} group.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tpr.map((r) => ({
                        group: name(r),
                        tpr: r.value ?? 0,
                        fpr: fpr.find((f) => f.subject === r.subject)?.value ?? 0,
                      }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="group" stroke="#a1a1aa" fontSize={11} />
                      <YAxis stroke="#a1a1aa" fontSize={11} tickFormatter={(v) => pct(v, 0)} />
                      <Tooltip
                        formatter={(v) => pct(Number(v))}
                        contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12, borderRadius: "6px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                      <Bar dataKey="tpr" name="True positive rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="fpr" name="False positive rate" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <table className="w-full text-xs text-left">
                <caption className="sr-only">Observed subgroup outcome rates by {gcol}</caption>
                <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="p-2.5">Demographic Group</th>
                    <th scope="col" className="p-2.5 text-right">Sample Rows (n)</th>
                    <th scope="col" className="p-2.5 text-right">{isLlm ? "Refusal Rate" : "Favourable Rate"}</th>
                    {!isLlm && <th scope="col" className="p-2.5 text-right">True Positive Rate</th>}
                    {!isLlm && <th scope="col" className="p-2.5 text-right">False Positive Rate</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {rows.map((r) => {
                    const t = tpr.find((x) => x.subject === r.subject);
                    const f = fpr.find((x) => x.subject === r.subject);
                    return (
                      <tr key={r.id} className="hover:bg-zinc-800/20">
                        <th scope="row" className="p-2.5 text-left font-sans font-medium text-zinc-200">
                          {name(r)}
                        </th>
                        <td className="p-2.5 text-right tabular-nums text-zinc-300">
                          {r.support_n?.toLocaleString()}
                          {r.state === "insufficient_evidence" && (
                            <span className="text-amber-300 ml-1 font-sans text-[11px]">(Insufficient)</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-100 font-semibold">{pct(r.value)}</td>
                        {!isLlm && (
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">
                            {t?.value != null ? `${pct(t.value)} (n=${t.support_n})` : "—"}
                          </td>
                        )}
                        {!isLlm && (
                          <td className="p-2.5 text-right tabular-nums text-zinc-300">
                            {f?.value != null ? `${pct(f.value)} (n=${f.support_n})` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {orphan.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-3">
          {orphan.map((r) => (
            <ResultCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
