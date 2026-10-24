"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StateBadge } from "@/components/ui/StateBadge";
import { pct } from "@/lib/format";
import { METRIC_LABEL, ResultCard, formatValue } from "./ResultCard";
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
  const predictions = results.filter(
    (r) => r.check_key === "prediction_distribution" || r.check_key === "prediction_rate"
  );
  const other = results.filter(
    (r) => !["feature_distribution", "prediction_distribution", "prediction_rate"].includes(r.check_key)
  );
  const selectable = [...predictions.filter((r) => r.check_key === "prediction_distribution"), ...features];
  const [selectedId, setSelectedId] = useState<string | null>(selectable[0]?.id ?? null);
  const selected = selectable.find((r) => r.id === selectedId);

  if (results.length === 0) {
    return <p className="text-xs text-zinc-400">Distribution drift checks were not configured for this run.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400">
        Evaluates population covariate drift between baseline reference and current production data using Kolmogorov-Smirnov (numeric) and Jensen-Shannon distance (categorical) metrics.
      </p>

      <div className="grid lg:grid-cols-2 gap-3">
        {other.map((r) => (
          <ResultCard key={r.id} r={r} />
        ))}
        {predictions
          .filter((r) => r.check_key === "prediction_rate")
          .map((r) => (
            <ResultCard key={r.id} r={r} />
          ))}
      </div>

      {selectable.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <caption className="sr-only">Feature drift rankings, largest deviations first</caption>
                <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="p-2.5">Feature Column</th>
                    <th scope="col" className="p-2.5">Test Metric</th>
                    <th scope="col" className="p-2.5 text-right">Drift Distance</th>
                    <th scope="col" className="p-2.5 text-right">Sample (Ref / Cur)</th>
                    <th scope="col" className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {selectable.map((r) => {
                    const isSelected = r.id === selectedId;
                    return (
                      <tr
                        key={r.id}
                        className={`transition-colors ${
                          isSelected ? "bg-zinc-800/80" : "hover:bg-zinc-800/30"
                        }`}
                      >
                        <th scope="row" className="p-2.5 text-left font-sans font-medium text-zinc-200">
                          <button
                            type="button"
                            onClick={() => setSelectedId(r.id)}
                            aria-pressed={isSelected}
                            className="text-left font-medium text-zinc-100 hover:text-white underline underline-offset-2 decoration-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-xs cursor-pointer"
                          >
                            {r.subject}
                          </button>
                        </th>
                        <td className="p-2.5 text-zinc-300 font-sans">{METRIC_LABEL[r.metric] ?? r.metric}</td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-100 font-semibold">
                          {formatValue(r)}
                          {r.threshold !== null && (
                            <span className="text-zinc-500 font-normal"> / {r.threshold}</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-zinc-400">
                          {r.detail.reference_n?.toLocaleString() ?? "—"} / {r.detail.current_n?.toLocaleString() ?? "—"}
                        </td>
                        <td className="p-2.5 font-sans">
                          <StateBadge state={r.state} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            {selected ? (
              <>
                <div className="border-b border-zinc-800 pb-2">
                  <h3 className="text-xs font-semibold text-zinc-100">{selected.subject} Distribution Comparison</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{selected.summary}</p>
                </div>
                {chartData(selected).length > 0 ? (
                  <div
                    style={{ height: 260 }}
                    role="img"
                    aria-label={`Distribution of ${selected.subject} in the reference and current data.`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData(selected)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="bin" stroke="#a1a1aa" fontSize={11} interval="preserveStartEnd" />
                        <YAxis stroke="#a1a1aa" fontSize={11} tickFormatter={(v) => pct(v, 0)} />
                        <Tooltip
                          formatter={(v) => pct(Number(v))}
                          contentStyle={{
                            background: "#18181b",
                            border: "1px solid #3f3f46",
                            fontSize: 12,
                            borderRadius: "6px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                        <Bar dataKey="Reference" fill="#71717a" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Current" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 py-8 text-center">
                    Histogram distribution data not available for this feature.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-500 py-8 text-center">
                Select a feature from the table to compare its baseline vs current histogram.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
