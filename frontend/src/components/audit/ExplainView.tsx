"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

type Example = {
  row_index: number;
  output: number;
  base_value: number;
  feature_values: Record<string, unknown>;
  contributions: Record<string, number>;
};

export function ExplainView({ results }: { results: CheckResult[] }) {
  if (results.length === 0) {
    return <p className="text-xs text-zinc-400">Feature importance and SHAP explainability were not configured for this run.</p>;
  }

  const importance = results.filter((r) => r.check_key === "global_importance" && r.value !== null);
  const notAssessed = results.filter((r) => r.check_key === "global_importance" && r.value === null);
  const proxies = results.filter((r) => r.check_key === "proxy_screen");
  const meta = results.filter((r) => ["additivity", "provenance"].includes(r.check_key));
  const examples = (results.find((r) => r.check_key === "local_explanations")?.detail.examples ?? []) as Example[];
  const unit = results.find((r) => r.check_key === "local_explanations")?.detail.output_unit ?? importance[0]?.unit ?? "";
  const data = importance.map((r) => ({ feature: r.subject, value: r.value as number }));
  const groupDetail = importance.find((r) => r.detail.mean_signed_contribution_by_group);

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400">
        Feature contribution values (SHAP) identify which input signals most heavily drive model predictions across the evaluated dataset.
      </p>

      {notAssessed.map((r) => (
        <ResultCard key={r.id} r={r} />
      ))}

      {data.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-100">
            Global Feature Importance (Mean |SHAP Value|, {unit})
          </h3>
          <div
            style={{ height: Math.max(180, data.length * 32) }}
            role="img"
            aria-label="Horizontal bar chart of average influence per model input."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" stroke="#a1a1aa" fontSize={11} />
                <YAxis type="category" dataKey="feature" stroke="#a1a1aa" fontSize={11} width={120} />
                <Tooltip
                  formatter={(v) => Number(v).toFixed(3)}
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    fontSize: 12,
                    borderRadius: "6px",
                  }}
                />
                <Bar dataKey="value" name="Influence" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="sr-only">
            {data.map((d) => (
              <li key={d.feature}>
                {d.feature}: {d.value.toFixed(3)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {proxies.length > 0 && (
        <section aria-labelledby="proxy-h" className="space-y-3">
          <h2 id="proxy-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Proxy Attribute Correlation Screen
          </h2>
          <div className="grid lg:grid-cols-2 gap-3">
            {proxies.map((r) => (
              <ResultCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {groupDetail && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 overflow-x-auto space-y-2">
          <h3 className="text-xs font-semibold text-zinc-100">
            Top Input Contribution Direction by Group: <span className="font-mono">{groupDetail.subject}</span>
          </h3>
          {Object.entries(
            groupDetail.detail.mean_signed_contribution_by_group as Record<string, Record<string, number>>
          ).map(([gcol, byGroup]) => (
            <table key={gcol} className="w-full text-xs text-left">
              <caption className="text-left text-zinc-400 mb-1 text-[11px]">
                Average signed influence of &quot;{groupDetail.subject}&quot; across {gcol} subgroups ({unit}). Negative
                reduces predicted outcome.
              </caption>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {Object.entries(byGroup).map(([g, v]) => (
                  <tr key={g} className="hover:bg-zinc-800/20">
                    <th scope="row" className="py-2 px-3 font-sans font-medium text-zinc-200">
                      {g}
                    </th>
                    <td className="py-2 px-3 tabular-nums text-zinc-100 font-semibold">
                      {v >= 0 ? "+" : ""}
                      {v.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}

      {examples.length > 0 && (
        <section aria-labelledby="ex-h" className="space-y-3">
          <h2 id="ex-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Local Decision Explanations (Sample Instances)
          </h2>
          <div className="grid lg:grid-cols-2 gap-3">
            {examples.map((ex) => {
              const top = Object.entries(ex.contributions)
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .slice(0, 6);
              const max = Math.max(...top.map(([, v]) => Math.abs(v)), 1e-9);
              return (
                <div key={ex.row_index} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-mono">Row #{ex.row_index}</span>
                    <span className="tabular-nums">
                      Model Output: <strong className="text-zinc-100">{ex.output.toFixed(2)}</strong> (Base:{" "}
                      {ex.base_value.toFixed(2)} {unit})
                    </span>
                  </div>
                  <ul className="space-y-1.5 pt-1">
                    {top.map(([f, v]) => (
                      <li key={f} className="text-xs">
                        <div className="flex justify-between text-zinc-300 text-[11px] mb-0.5">
                          <span className="truncate pr-2">
                            {f} = <strong className="font-mono text-zinc-100">{String(ex.feature_values[f] ?? "")}</strong>
                          </span>
                          <span className="font-mono tabular-nums text-zinc-200">
                            {v >= 0 ? "+" : ""}
                            {v.toFixed(3)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${v >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                            style={{ width: `${(Math.abs(v) / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {meta.map((r) => (
          <ResultCard key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}
