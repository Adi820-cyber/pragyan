"use client";

import { Bar, BarChart, CartesianGrid, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "@/lib/format";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

const AGGREGATE_KEYS = ["demographic_parity", "selection_rate_ratio", "equalized_odds"];

export function BiasView({ results }: { results: CheckResult[] }) {
  const groupCols = Array.from(new Set(results.map((r) => r.detail.group_column as string | undefined).filter(Boolean))) as string[];
  const orphan = results.filter((r) => !r.detail.group_column && !AGGREGATE_KEYS.includes(r.check_key));
  const general = results.filter((r) => !r.detail.group_column && r.subject === "" && r.state === "not_applicable");

  if (results.length === 0) return <p className="text-sm text-slate-400">Bias checks were not part of this run.</p>;

  return (
    <div className="space-y-8">
      {general.map((r) => <ResultCard key={r.id} r={r} />)}
      {groupCols.map((gcol) => {
        const mine = results.filter((r) => r.detail.group_column === gcol);
        const rows = mine.filter((r) => r.check_key === "group_selection_rate");
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
            <h2 id={`bias-${gcol}`} className="text-sm font-bold text-white">Groups by {gcol}</h2>
            <div className="grid lg:grid-cols-3 gap-4">{aggregates.map((r) => <ResultCard key={r.id} r={r} />)}</div>

            <div className="glass-panel p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Favourable-outcome rate by group (bars show 95% intervals)</h3>
              <div style={{ height: 240 }} role="img" aria-label={`Bar chart of favourable-outcome rate by ${gcol} group. The same numbers are in the table below.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="group" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => pct(v, 0)} domain={[0, "auto"]} />
                    <Tooltip formatter={(v) => pct(Number(v))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
                    <Bar dataKey="rate" name="Favourable-outcome rate" fill="#0ea5e9">
                      <ErrorBar dataKey="err" stroke="#e2e8f0" width={4} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {(tpr.length > 0 || fpr.length > 0) && (
              <div className="glass-panel p-4">
                <h3 className="text-xs font-semibold text-slate-300 mb-2">Error rates by group</h3>
                <div style={{ height: 220 }} role="img" aria-label={`Bar chart of true and false positive rates by ${gcol} group. The same numbers are in the table below.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={tpr.map((r) => ({ group: name(r), tpr: r.value ?? 0, fpr: fpr.find((f) => f.subject === r.subject)?.value ?? 0 }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="group" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => pct(v, 0)} />
                      <Tooltip formatter={(v) => pct(Number(v))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
                      <Legend />
                      <Bar dataKey="tpr" name="True positive rate" fill="#10b981" />
                      <Bar dataKey="fpr" name="False positive rate" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="glass-panel overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Rates by {gcol} group with the number of rows behind each</caption>
                <thead>
                  <tr className="text-left text-slate-400 border-b border-white/10">
                    <th scope="col" className="p-2 font-medium">Group</th>
                    <th scope="col" className="p-2 font-medium">Rows</th>
                    <th scope="col" className="p-2 font-medium">Favourable outcome</th>
                    <th scope="col" className="p-2 font-medium">True positive rate</th>
                    <th scope="col" className="p-2 font-medium">False positive rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const t = tpr.find((x) => x.subject === r.subject);
                    const f = fpr.find((x) => x.subject === r.subject);
                    return (
                      <tr key={r.id} className="border-b border-white/5 text-slate-200">
                        <th scope="row" className="p-2 text-left font-medium">{name(r)}</th>
                        <td className="p-2">{r.support_n?.toLocaleString()}{r.state === "insufficient_evidence" && <span className="text-amber-300"> (too small)</span>}</td>
                        <td className="p-2">{pct(r.value)}</td>
                        <td className="p-2">{t?.value != null ? `${pct(t.value)} (n=${t.support_n})` : "not assessed"}</td>
                        <td className="p-2">{f?.value != null ? `${pct(f.value)} (n=${f.support_n})` : "not assessed"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {orphan.length > 0 && <div className="grid lg:grid-cols-2 gap-4">{orphan.map((r) => <ResultCard key={r.id} r={r} />)}</div>}
    </div>
  );
}
