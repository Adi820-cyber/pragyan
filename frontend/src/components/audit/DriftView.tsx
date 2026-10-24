"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StateBadge } from "@/components/ui/StateBadge";
import { pct } from "@/lib/format";
import { METRIC_LABEL, ResultCard, formatThreshold, formatValue } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

function chartData(r: CheckResult) {
  const d = r.detail;
  if (d.histogram) {
    const edges: number[] = d.histogram.edges;
    return (d.histogram.reference as number[]).map((ref, i) => ({
      bin: `${edges[i].toFixed(1)}`,
      Reference: ref,
      Current: d.histogram.current[i],
    }));
  }
  if (d.categories) {
    return (d.categories as { value: string; reference: number; current: number }[]).map((c) => ({
      bin: String(c.value),
      Reference: c.reference,
      Current: c.current,
    }));
  }
  return [];
}

export function DriftView({ results }: { results: CheckResult[] }) {
  const features = results
    .filter((r) => r.check_key === "feature_distribution")
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const predictions = results.filter((r) => r.check_key === "prediction_distribution" || r.check_key === "prediction_rate");
  const other = results.filter((r) => !["feature_distribution", "prediction_distribution", "prediction_rate"].includes(r.check_key));
  const selectable = [...predictions.filter((r) => r.check_key === "prediction_distribution"), ...features];
  const [selectedId, setSelectedId] = useState<string | null>(selectable[0]?.id ?? null);
  const selected = selectable.find((r) => r.id === selectedId);

  if (results.length === 0) return <p className="text-sm text-slate-400">Drift checks were not part of this run.</p>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        This shows how the data and predictions changed between the reference and current datasets. A change is a warning signal. It does not by itself show the model got worse.
      </p>
      <div className="grid lg:grid-cols-2 gap-4">{other.map((r) => <ResultCard key={r.id} r={r} />)}{predictions.filter((r) => r.check_key === "prediction_rate").map((r) => <ResultCard key={r.id} r={r} />)}</div>

      {selectable.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Change by feature, largest first</caption>
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th scope="col" className="p-2 font-medium">Column</th>
                  <th scope="col" className="p-2 font-medium">Measure</th>
                  <th scope="col" className="p-2 font-medium">Change</th>
                  <th scope="col" className="p-2 font-medium">Rows (ref / cur)</th>
                  <th scope="col" className="p-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {selectable.map((r) => (
                  <tr key={r.id} className={`border-b border-white/5 ${r.id === selectedId ? "bg-cyan-500/10" : ""}`}>
                    <th scope="row" className="p-2 text-left font-medium">
                      <button type="button" onClick={() => setSelectedId(r.id)} aria-pressed={r.id === selectedId} className="text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded">
                        {r.subject}
                      </button>
                    </th>
                    <td className="p-2 text-slate-300">{METRIC_LABEL[r.metric] ?? r.metric}</td>
                    <td className="p-2 text-slate-100">{formatValue(r)}{r.threshold !== null && <span className="text-slate-500"> (limit {formatThreshold(r)})</span>}</td>
                    <td className="p-2 text-slate-400">{r.detail.reference_n?.toLocaleString() ?? "?"} / {r.detail.current_n?.toLocaleString() ?? "?"}</td>
                    <td className="p-2"><StateBadge state={r.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-panel p-4">
            {selected ? (
              <>
                <h3 className="text-sm font-semibold text-slate-100">{selected.subject}</h3>
                <p className="text-xs text-slate-300 mt-1 mb-3">{selected.summary}</p>
                {chartData(selected).length > 0 ? (
                  <div style={{ height: 260 }} role="img" aria-label={`Distribution of ${selected.subject} in the reference and current data.`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData(selected)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="bin" stroke="#94a3b8" fontSize={11} interval="preserveStartEnd" />
                        <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => pct(v, 0)} />
                        <Tooltip formatter={(v) => pct(Number(v))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
                        <Legend />
                        <Bar dataKey="Reference" fill="#64748b" />
                        <Bar dataKey="Current" fill="#0ea5e9" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No distribution chart is available for this result.</p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">Select a column to see how it changed.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
