"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { RIGHT_LABEL, canEdit, dateOnly } from "@/lib/format";
import type { Person, RightKey, RightsProcess } from "@/lib/types";

const ALL_RIGHTS: RightKey[] = ["access", "correction", "erasure", "withdraw_consent", "grievance", "human_review"];

export function RightsPanel({
  systemId,
  processes,
  people,
  jurisdictions,
  automatedDecision,
  role,
}: {
  systemId: string;
  processes: RightsProcess[];
  people: Person[];
  jurisdictions: string[];
  automatedDecision: boolean;
  role: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RightKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(role);
  const byRight = new Map(processes.map((p) => [p.right, p]));
  const tracked = jurisdictions.length > 0;
  const required = (r: RightKey) => tracked && (r !== "human_review" || automatedDecision);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const f = new FormData(event.currentTarget);
    const existing = byRight.get(editing);
    const body = {
      system: systemId,
      right: editing,
      procedure_exists: f.get("procedure_exists") === "on",
      owner: f.get("owner") || null,
      channel: f.get("channel") || "",
      sla_days: f.get("sla_days") ? Number(f.get("sla_days")) : null,
      last_tested: f.get("last_tested") || null,
      requests_12m: Number(f.get("requests_12m") || 0),
      closed_on_time_12m: Number(f.get("closed_on_time_12m") || 0),
      evidence_note: f.get("evidence_note") || "",
    };
    setBusy(true);
    setError(null);
    try {
      if (existing) await call("PATCH", `ai/rights-processes/${existing.id}/`, body);
      else await call("POST", "ai/rights-processes/", body);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const current = editing ? byRight.get(editing) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">
        Traceability for statutory data-subject requests (access, correction, erasure, grievance, and human review under DPDP/GDPR). Audits evaluate missing procedures, untested SLA channels, and response lag.
      </p>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <table className="w-full text-xs text-left">
          <caption className="sr-only">Data subject rights procedures</caption>
          <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800">
            <tr>
              <th scope="col" className="py-2.5 px-3">Statutory Right</th>
              <th scope="col" className="py-2.5 px-3">Procedure Status</th>
              <th scope="col" className="py-2.5 px-3">Owner</th>
              <th scope="col" className="py-2.5 px-3">Last Tested</th>
              <th scope="col" className="py-2.5 px-3">Requests (Closed On Time)</th>
              <th scope="col" className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {ALL_RIGHTS.map((r) => {
              const p = byRight.get(r);
              const need = required(r);
              return (
                <tr key={r} className="hover:bg-zinc-800/20 transition-colors">
                  <th scope="row" className="py-2.5 px-3 text-left font-medium text-zinc-100">
                    <div>{RIGHT_LABEL[r]}</div>
                    {!need && tracked && (
                      <span className="text-[10px] text-zinc-500 font-normal block">
                        Exempt: System does not conduct automated profiling
                      </span>
                    )}
                  </th>
                  <td className="py-2.5 px-3">
                    {p?.procedure_exists ? (
                      <StateBadge state="no_alert" label="Procedure on record" />
                    ) : need ? (
                      <StateBadge state="review_required" label="Missing procedure" />
                    ) : (
                      <span className="text-zinc-500 font-mono text-[11px]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-zinc-300">{p?.owner_name ?? <span className="text-zinc-500">None</span>}</td>
                  <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{dateOnly(p?.last_tested)}</td>
                  <td className="py-2.5 px-3 text-zinc-300 tabular-nums">
                    {p ? `${p.requests_12m} (${p.closed_on_time_12m} on time)` : <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {editable && (
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="text-xs font-medium text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer"
                      >
                        {p ? "Edit" : "Record"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <form
          key={editing}
          onSubmit={save}
          className="rounded-md border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-semibold text-zinc-100">
              Configure Procedure: {RIGHT_LABEL[editing]}
            </h4>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              name="procedure_exists"
              defaultChecked={current?.procedure_exists ?? true}
              className="rounded border-zinc-700 bg-zinc-900 text-zinc-100"
            />
            <span>Documented & operational procedure exists in organization</span>
          </label>

          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Procedure Owner" htmlFor="r_owner">
              <select id="r_owner" name="owner" defaultValue={current?.owner ?? ""} className={inputClass}>
                <option value="">None</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Intake Channel / Endpoint" htmlFor="r_channel">
              <input
                id="r_channel"
                name="channel"
                defaultValue={current?.channel}
                placeholder="e.g. privacy@reskure.net or /privacy/portal"
                className={inputClass}
              />
            </Field>
            <Field label="Statutory SLA Target (Days)" htmlFor="r_sla">
              <input
                id="r_sla"
                name="sla_days"
                type="number"
                min={1}
                defaultValue={current?.sla_days ?? ""}
                placeholder="e.g. 30"
                className={inputClass}
              />
            </Field>
            <Field label="Last Drill / Simulation Date" htmlFor="r_tested" hint="Date last synthetic request tested channel.">
              <input
                id="r_tested"
                name="last_tested"
                type="date"
                defaultValue={current?.last_tested ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Total Requests (Last 12 Mos)" htmlFor="r_n">
              <input
                id="r_n"
                name="requests_12m"
                type="number"
                min={0}
                defaultValue={current?.requests_12m ?? 0}
                className={inputClass}
              />
            </Field>
            <Field label="Requests Closed Within SLA" htmlFor="r_ok">
              <input
                id="r_ok"
                name="closed_on_time_12m"
                type="number"
                min={0}
                defaultValue={current?.closed_on_time_12m ?? 0}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Procedure Documentation Reference" htmlFor="r_note">
            <input
              id="r_note"
              name="evidence_note"
              defaultValue={current?.evidence_note}
              placeholder="e.g. SOP-DSR-04 in corporate policy repository"
              className={inputClass}
            />
          </Field>

          {error && (
            <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{busy ? "Saving procedure..." : "Save Procedure"}</span>
            </button>
            <button type="button" onClick={() => setEditing(null)} className={ghostButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
