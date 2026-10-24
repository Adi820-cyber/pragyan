"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StateBadge } from "@/components/ui/StateBadge";
import { inputClass } from "@/components/ui/Panel";
import { dateTime } from "@/lib/format";
import type { AuditRun, RunStatus } from "@/lib/types";

const PAGE_SIZE = 15;
const STATUSES: RunStatus[] = ["queued", "running", "completed", "failed", "cancelled"];

function Outcome({ run }: { run: AuditRun }) {
  if (run.status === "failed") return <span className="text-xs text-rose-300">Did not finish</span>;
  if (run.status !== "completed") return <span className="text-xs text-slate-500">Not available yet</span>;
  const counts = Object.values(run.state_counts);
  const total = (key: "review_required" | "error" | "not_applicable" | "insufficient_evidence") => counts.reduce((n, c) => n + (c?.[key] ?? 0), 0);
  const review = total("review_required");
  const errors = total("error");
  const unassessed = total("not_applicable") + total("insufficient_evidence");
  return (
    <span className="text-xs text-slate-300">
      {review === 0 ? "Nothing flagged" : `${review} to review`}
      {unassessed > 0 ? `, ${unassessed} not assessed` : ""}
      {errors > 0 ? `, ${errors} errors` : ""}
    </span>
  );
}

export function AuditsTable({ runs }: { runs: AuditRun[] }) {
  const [status, setStatus] = useState("");
  const [system, setSystem] = useState("");
  const [page, setPage] = useState(0);

  const systems = useMemo(() => Array.from(new Map(runs.map((r) => [r.system, r.system_name])).entries()), [runs]);
  const filtered = runs.filter((r) => (!status || r.status === status) && (!system || r.system === system));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="f_system" className="block text-xs text-slate-300 mb-1">AI system</label>
          <select id="f_system" value={system} onChange={(e) => { setSystem(e.target.value); setPage(0); }} className={inputClass}>
            <option value="">All systems</option>
            {systems.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f_status" className="block text-xs text-slate-300 mb-1">Status</label>
          <select id="f_status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className={inputClass}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-400 pb-2" aria-live="polite">
          {filtered.length === runs.length ? `${runs.length} audit${runs.length === 1 ? "" : "s"}` : `${filtered.length} of ${runs.length} audits`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel p-8 text-center text-sm text-slate-300">No audits match these filters. Clear a filter to see more.</div>
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit runs, newest first</caption>
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                <th scope="col" className="p-3 font-medium">System</th>
                <th scope="col" className="p-3 font-medium">Model</th>
                <th scope="col" className="p-3 font-medium">Status</th>
                <th scope="col" className="p-3 font-medium">Outcome</th>
                <th scope="col" className="p-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="p-3">
                    <Link href={`/audits/${r.id}`} className="font-semibold text-cyan-300 hover:text-cyan-200">
                      {r.system_name}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-300">{r.model_version_label}</td>
                  <td className="p-3"><StateBadge state={r.status} /></td>
                  <td className="p-3"><Outcome run={r} /></td>
                  <td className="p-3 text-xs text-slate-400">{dateTime(r.started_at ?? r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Audit pages" className="flex items-center justify-between text-xs text-slate-300">
          <span>Page {current + 1} of {pages}</span>
          <span className="flex gap-2">
            <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg border border-white/15 px-3 py-1.5 disabled:opacity-40 hover:bg-white/5">Previous</button>
            <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg border border-white/15 px-3 py-1.5 disabled:opacity-40 hover:bg-white/5">Next</button>
          </span>
        </nav>
      )}
    </div>
  );
}
