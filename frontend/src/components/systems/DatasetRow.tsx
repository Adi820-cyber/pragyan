"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { dateOnly } from "@/lib/format";
import type { Dataset } from "@/lib/types";

type Preview = { columns: string[]; rows: unknown[][]; masked_columns: string[] };

export function DatasetRow({ dataset }: { dataset: Dataset }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pii = dataset.pii_scan.findings ?? [];

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !preview) {
      try {
        setPreview(await call<Preview>("GET", `ai/datasets/${dataset.id}/preview/`));
      } catch (e) {
        setError(errText(e));
      }
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${dataset.name}"? The file is removed from storage.`)) return;
    try {
      await call("DELETE", `ai/datasets/${dataset.id}/`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <li className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {dataset.name}{" "}
            {dataset.is_real_data ? (
              <span className="ml-1 text-[10px] uppercase text-sky-300">real public data</span>
            ) : dataset.is_sample ? (
              <span className="ml-1 text-[10px] uppercase text-amber-300">synthetic sample</span>
            ) : null}
          </div>
          <div className="text-xs text-slate-400">
            {dataset.role} · {dataset.row_count.toLocaleString()} rows · {dataset.column_schema.length} columns · {dateOnly(dataset.period_start)} to{" "}
            {dateOnly(dataset.period_end)}
          </div>
          <div className="text-[11px] text-slate-600 font-mono break-all">sha256 {dataset.sha256}</div>
        </div>
        <div className="flex items-center gap-3">
          {pii.length > 0 ? <StateBadge state="review_required" label={`${pii.length} personal-data indicator${pii.length > 1 ? "s" : ""}`} /> : <StateBadge state="no_alert" label="No indicators found" />}
          <button type="button" onClick={toggle} aria-expanded={open} className="text-xs text-cyan-300 hover:text-cyan-200 underline">
            {open ? "Hide" : "Preview"}
          </button>
          <button type="button" onClick={remove} className="text-xs text-rose-300 hover:text-rose-200 underline">
            Delete
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-300 mt-2">
          {error}
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-3">
          {pii.length > 0 && (
            <ul className="text-xs text-amber-100 space-y-1">
              {pii.map((f) => (
                <li key={`${f.column}-${f.kind}`}>
                  <strong>{f.column}</strong>: {f.confidence === "detected" ? "matches the pattern for" : "looks like"} {f.label}
                  {f.masked_samples.length > 0 && <> (for example {f.masked_samples.join(", ")})</>}. {f.basis}.
                </li>
              ))}
            </ul>
          )}
          {preview ? (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <caption className="sr-only">First rows of {dataset.name}. Personal-data columns are masked.</caption>
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} scope="col" className="text-left p-1.5 text-slate-400 font-medium whitespace-nowrap">
                        {c}
                        {preview.masked_columns.includes(c) ? " (masked)" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-white/5">
                      {row.map((cell, j) => (
                        <td key={j} className="p-1.5 text-slate-300 whitespace-nowrap">
                          {String(cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !error && <p className="text-xs text-slate-400">Loading preview...</p>
          )}
        </div>
      )}
    </li>
  );
}
