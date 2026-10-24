"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { dateOnly } from "@/lib/format";
import type { Dataset } from "@/lib/types";

type Preview = { columns: string[]; rows: unknown[][]; masked_columns: string[] };

export function DatasetRow({ dataset }: { dataset: Dataset }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pii = dataset.pii_scan.findings ?? [];

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !preview) {
      setLoading(true);
      setError(null);
      try {
        setPreview(await call<Preview>("GET", `ai/datasets/${dataset.id}/preview/`));
      } catch (e) {
        setError(errText(e));
      } finally {
        setLoading(false);
      }
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${dataset.name}"? The file will be removed permanently from storage.`)) return;
    try {
      await call("DELETE", `ai/datasets/${dataset.id}/`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <li className="p-3.5 text-xs hover:bg-zinc-800/20 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="font-semibold text-zinc-100 flex items-center gap-2">
            <span className="truncate">{dataset.name}</span>
            {dataset.is_sample && (
              <span className="text-[10px] font-mono uppercase bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800 text-amber-300">
                Sample
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-400 capitalize bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
              {dataset.role}
            </span>
          </div>
          <div className="text-zinc-400 tabular-nums">
            {dataset.row_count.toLocaleString()} rows · {dataset.column_schema.length} columns · {dateOnly(dataset.period_start)} to {dateOnly(dataset.period_end)}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono truncate" title={dataset.sha256}>
            SHA-256: {dataset.sha256}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {pii.length > 0 ? (
            <StateBadge
              state="review_required"
              label={`${pii.length} PII flag${pii.length > 1 ? "s" : ""}`}
            />
          ) : (
            <StateBadge state="no_alert" label="No PII detected" />
          )}

          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="text-xs font-medium text-zinc-300 hover:text-white px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {open ? "Hide Preview" : "Preview Rows"}
          </button>
          <button
            type="button"
            onClick={remove}
            className="text-xs font-medium text-red-300 hover:text-red-100 px-2 py-1.5 rounded hover:bg-red-950/50 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200 mt-2.5">
          {error}
        </div>
      )}

      {open && (
        <div className="mt-3.5 space-y-3 pt-3 border-t border-zinc-800/60">
          {pii.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
              <span className="font-semibold block text-amber-100">Detected Personal Data Attributes:</span>
              <ul className="space-y-0.5">
                {pii.map((f) => (
                  <li key={`${f.column}-${f.kind}`}>
                    <strong className="font-mono text-amber-100">{f.column}</strong>: {f.label} ({f.confidence === "detected" ? "Pattern match" : "Header heuristic"}). {f.basis}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-3 text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Loading dataset sample preview...</span>
            </div>
          )}

          {preview && (
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 overflow-x-auto max-h-64">
              <table className="w-full text-[11px] text-left">
                <caption className="sr-only">First rows of dataset {dataset.name}</caption>
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} scope="col" className="py-2 px-3 font-medium whitespace-nowrap">
                        {c}
                        {preview.masked_columns.includes(c) ? " [Masked]" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 font-mono">
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-800/20">
                      {row.map((cell, j) => (
                        <td key={j} className="py-1.5 px-3 text-zinc-300 whitespace-nowrap">
                          {String(cell ?? "null")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
