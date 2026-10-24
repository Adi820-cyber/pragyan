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
  if (results.length === 0) return <p className="text-sm text-slate-400">Explainability was not part of this run.</p>;

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
      <p className="text-xs text-slate-400">
        Contributions show what the model associates with an output. They are not causes, and they do not tell a person how to change a decision.
      </p>
      {notAssessed.map((r) => <ResultCard key={r.id} r={r} />)}

      {data.length > 0 && (
        <div className="glass-panel p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Which inputs influence the model most (average absolute contribution, {unit})</h3>
          <div style={{ height: Math.max(180, data.length * 34) }} role="img" aria-label="Horizontal bar chart of average influence per model input. The same numbers are listed below.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="feature" stroke="#94a3b8" fontSize={12} width={120} />
                <Tooltip formatter={(v) => Number(v).toFixed(3)} contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }} />
                <Bar dataKey="value" name="Influence" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ol className="sr-only">{data.map((d) => <li key={d.feature}>{d.feature}: {d.value.toFixed(3)}</li>)}</ol>
        </div>
      )}

      {proxies.length > 0 && (
        <section aria-labelledby="proxy-h" className="space-y-3">
          <h2 id="proxy-h" className="text-sm font-bold text-white">Possible proxies for a group</h2>
          <div className="grid lg:grid-cols-2 gap-4">{proxies.map((r) => <ResultCard key={r.id} r={r} />)}</div>
        </section>
      )}

      {groupDetail && (
        <div className="glass-panel p-4 overflow-x-auto">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">How the top input pushes the output differently by group</h3>
          {Object.entries(groupDetail.detail.mean_signed_contribution_by_group as Record<string, Record<string, number>>).map(([gcol, byGroup]) => (
            <table key={gcol} className="text-xs w-full">
              <caption className="text-left text-slate-400 mb-1">Average signed contribution of &quot;{groupDetail.subject}&quot; by {gcol} ({unit}). Negative lowers the output.</caption>
              <tbody>
                {Object.entries(byGroup).map(([g, v]) => (
                  <tr key={g} className="border-b border-white/5 text-slate-200">
                    <th scope="row" className="p-2 text-left font-medium">{g}</th>
                    <td className="p-2">{v >= 0 ? "+" : ""}{v.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}

      {examples.length > 0 && (
        <section aria-labelledby="ex-h" className="space-y-3">
          <h2 id="ex-h" className="text-sm font-bold text-white">Example decisions</h2>
          <div className="grid lg:grid-cols-2 gap-4">
            {examples.map((ex) => {
              const top = Object.entries(ex.contributions).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
              const max = Math.max(...top.map(([, v]) => Math.abs(v)), 1e-9);
              return (
                <div key={ex.row_index} className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
                  <div className="text-xs text-slate-400">Row {ex.row_index}</div>
                  <div className="text-sm text-slate-100 mb-2">Model output {ex.output.toFixed(2)} {unit} from a base of {ex.base_value.toFixed(2)}</div>
                  <ul className="space-y-1.5">
                    {top.map(([f, v]) => (
                      <li key={f} className="text-xs">
                        <div className="flex justify-between text-slate-300">
                          <span>{f} = {String(ex.feature_values[f] ?? "")}</span>
                          <span>{v >= 0 ? "+" : ""}{v.toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded">
                          <div className={`h-full rounded ${v >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${(Math.abs(v) / max) * 100}%` }} />
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

      <div className="grid lg:grid-cols-2 gap-4">{meta.map((r) => <ResultCard key={r.id} r={r} />)}</div>
    </div>
  );
}
