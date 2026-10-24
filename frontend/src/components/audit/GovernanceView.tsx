"use client";

import Link from "next/link";
import { StateBadge } from "@/components/ui/StateBadge";
import { RIGHT_LABEL } from "@/lib/format";
import { ResultCard } from "./ResultCard";
import type { CheckResult } from "@/lib/types";

export function GovernanceView({ results, systemId }: { results: CheckResult[]; systemId: string }) {
  if (results.length === 0) return <p className="text-sm text-slate-400">Vendor, rights and oversight checks were not part of this run.</p>;
  const vendors = results.filter((r) => r.check_key === "vendor_dependency" || r.check_key === "vendor_register" || r.check_key === "vendor_concentration");
  const rights = results.filter((r) => r.check_key === "data_rights");
  const oversight = results.filter((r) => r.check_key === "human_oversight");
  const rightsRows = Array.from(new Set(rights.map((r) => r.subject)));

  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-400">
        These results come from what your organisation has declared about its vendors and how it handles people&apos;s requests, plus review levels measured from your logs. Reskure cannot verify the declarations.
        Fix a gap by updating the record on the{" "}
        <Link href={`/systems/${systemId}`} className="text-cyan-300 underline">system page</Link>, then run the audit again.
      </p>

      <section aria-labelledby="gv-vendors" className="space-y-3">
        <h2 id="gv-vendors" className="text-sm font-bold text-white">Vendors and dependencies</h2>
        <ul className="space-y-2">
          {vendors.map((r) => (
            <li key={r.id} className="rounded-lg border border-white/10 bg-slate-900/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {r.check_key === "vendor_concentration" ? `Concentration risk: ${r.subject}` : r.check_key === "vendor_register" ? "Vendor register" : r.subject}
                </h3>
                <div className="flex items-center gap-2">
                  {r.detail.criticality && <span className="text-[11px] text-slate-400">{String(r.detail.criticality)} criticality</span>}
                  <StateBadge state={r.state} />
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-2">{r.summary}</p>
              {Array.isArray(r.detail.gaps) && r.detail.gaps.length > 0 && (
                <ul className="list-disc ml-5 mt-2 text-xs text-amber-100 space-y-0.5">
                  {(r.detail.gaps as string[]).map((g) => <li key={g}>{g}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gv-rights" className="space-y-3">
        <h2 id="gv-rights" className="text-sm font-bold text-white">Data-subject rights</h2>
        {rights.length === 1 && rights[0].state === "not_applicable" ? (
          <ResultCard r={rights[0]} />
        ) : (
          <div className="glass-panel overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Handling of each right</caption>
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th scope="col" className="p-2 font-medium">Right</th>
                  <th scope="col" className="p-2 font-medium">Procedure</th>
                  <th scope="col" className="p-2 font-medium">Response times</th>
                </tr>
              </thead>
              <tbody>
                {rightsRows.map((right) => {
                  const proc = rights.find((r) => r.subject === right && r.metric === "rights_procedure");
                  const time = rights.find((r) => r.subject === right && r.metric === "requests_on_time");
                  return (
                    <tr key={right} className="border-b border-white/5 align-top">
                      <th scope="row" className="p-2 text-left font-medium text-slate-100">{RIGHT_LABEL[right] ?? right}</th>
                      <td className="p-2">
                        {proc && <StateBadge state={proc.state} />}
                        {proc && <p className="text-slate-300 mt-1">{proc.summary}</p>}
                      </td>
                      <td className="p-2">
                        {time ? (<><StateBadge state={time.state} /><p className="text-slate-300 mt-1">{time.summary}</p></>) : <span className="text-slate-500">No requests recorded</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {oversight.length > 0 && (
        <section aria-labelledby="gv-over" className="space-y-3">
          <h2 id="gv-over" className="text-sm font-bold text-white">Human oversight</h2>
          <div className="grid lg:grid-cols-2 gap-4">{oversight.map((r) => <ResultCard key={r.id} r={r} />)}</div>
        </section>
      )}
    </div>
  );
}
