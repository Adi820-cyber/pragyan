"use client";

import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import { RIGHT_LABEL } from "@/lib/format";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

export function GovernanceView({ results, systemId }: { results: CheckResult[]; systemId: string }) {
  if (results.length === 0) {
    return <p className="text-xs text-zinc-400">Vendor, rights and oversight checks were not configured for this run.</p>;
  }
  const vendors = results.filter(
    (r) => r.check_key === "vendor_dependency" || r.check_key === "vendor_register" || r.check_key === "vendor_concentration"
  );
  const rights = results.filter((r) => r.check_key === "data_rights");
  const oversight = results.filter((r) => r.check_key === "human_oversight");
  const rightsRows = Array.from(new Set(rights.map((r) => r.subject)));

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-400">
        Assesses statutory data processing compliance, third-party vendor concentration, and data subject rights enforcement against declarations registered in your system profile.
      </p>

      <section aria-labelledby="gv-vendors" className="space-y-3">
        <h2 id="gv-vendors" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Vendors & Supply Chain Dependencies
        </h2>
        <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
          {vendors.map((r) => (
            <li key={r.id} className="p-4 space-y-2 hover:bg-zinc-800/20 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {r.check_key === "vendor_concentration"
                    ? `Concentration Risk: ${r.subject}`
                    : r.check_key === "vendor_register"
                    ? "Sub-processor Register"
                    : r.subject}
                </h3>
                <div className="flex items-center gap-2">
                  {r.detail.criticality && (
                    <span className="text-[10px] font-mono uppercase bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300">
                      {String(r.detail.criticality)} criticality
                    </span>
                  )}
                  <StateBadge state={r.state} />
                </div>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{r.summary}</p>
              {Array.isArray(r.detail.gaps) && r.detail.gaps.length > 0 && (
                <ul className="list-disc ml-4 text-xs text-amber-200/90 space-y-0.5 pt-1">
                  {(r.detail.gaps as string[]).map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gv-rights" className="space-y-3">
        <h2 id="gv-rights" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Data Subject Statutory Rights Redressal
        </h2>
        {rights.length === 1 && rights[0].state === "not_applicable" ? (
          <ResultCard r={rights[0]} />
        ) : (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <caption className="sr-only">Data subject rights evaluation</caption>
                <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800">
                  <tr>
                    <th scope="col" className="p-2.5">Statutory Right</th>
                    <th scope="col" className="p-2.5">Operating Procedure</th>
                    <th scope="col" className="p-2.5">SLA Response Times</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-sans">
                  {rightsRows.map((right) => {
                    const proc = rights.find((r) => r.subject === right && r.metric === "rights_procedure");
                    const time = rights.find((r) => r.subject === right && r.metric === "requests_on_time");
                    return (
                      <tr key={right} className="hover:bg-zinc-800/20 align-top">
                        <th scope="row" className="p-2.5 text-left font-medium text-zinc-200">
                          {RIGHT_LABEL[right] ?? right}
                        </th>
                        <td className="p-2.5 space-y-1">
                          {proc && <StateBadge state={proc.state} />}
                          {proc && <p className="text-zinc-300 text-[11px] leading-relaxed">{proc.summary}</p>}
                        </td>
                        <td className="p-2.5 space-y-1">
                          {time ? (
                            <>
                              <StateBadge state={time.state} />
                              <p className="text-zinc-300 text-[11px] leading-relaxed">{time.summary}</p>
                            </>
                          ) : (
                            <span className="text-zinc-500 font-mono text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {oversight.length > 0 && (
        <section aria-labelledby="gv-over" className="space-y-3">
          <h2 id="gv-over" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Human-in-the-Loop Oversight
          </h2>
          <div className="grid lg:grid-cols-2 gap-3">
            {oversight.map((r) => (
              <ResultCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
