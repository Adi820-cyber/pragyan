"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      <p className="text-xs text-slate-400">
        For each right, record how a person makes the request, who answers it, when you last tested it, and how many requests were closed on time. The audit flags missing procedures,
        untested ones and slow responses. {tracked ? "" : "Select a privacy checklist (DPDP or GDPR) in Settings for these to be assessed."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <caption className="sr-only">Data-subject rights handling</caption>
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/10">
              <th scope="col" className="p-2 font-medium">Right</th>
              <th scope="col" className="p-2 font-medium">Procedure</th>
              <th scope="col" className="p-2 font-medium">Owner</th>
              <th scope="col" className="p-2 font-medium">Last tested</th>
              <th scope="col" className="p-2 font-medium">Requests (on time)</th>
              <th scope="col" className="p-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {ALL_RIGHTS.map((r) => {
              const p = byRight.get(r);
              const need = required(r);
              return (
                <tr key={r} className="border-b border-white/5 text-slate-200">
                  <th scope="row" className="p-2 text-left font-medium">
                    {RIGHT_LABEL[r]}
                    {!need && tracked && <span className="block text-[11px] text-slate-500 font-normal">Not required: system does not make automated decisions</span>}
                  </th>
                  <td className="p-2">
                    {p?.procedure_exists ? <StateBadge state="no_alert" label="Recorded" /> : need ? <StateBadge state="review_required" label="Missing" /> : <span className="text-slate-500">n/a</span>}
                  </td>
                  <td className="p-2">{p?.owner_name ?? "None"}</td>
                  <td className="p-2">{dateOnly(p?.last_tested)}</td>
                  <td className="p-2">{p ? `${p.requests_12m} (${p.closed_on_time_12m})` : "n/a"}</td>
                  <td className="p-2">
                    {editable && (
                      <button type="button" onClick={() => setEditing(r)} className="text-cyan-300 hover:text-cyan-200 underline">
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
        <form key={editing} onSubmit={save} className="rounded-lg border border-white/10 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white">{RIGHT_LABEL[editing]}</h3>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="procedure_exists" defaultChecked={current?.procedure_exists ?? true} className="h-4 w-4 accent-cyan-500" />
            A working procedure exists
          </label>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Owner" htmlFor="r_owner">
              <select id="r_owner" name="owner" defaultValue={current?.owner ?? ""} className={inputClass}>
                <option value="">None</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Where people make the request" htmlFor="r_channel"><input id="r_channel" name="channel" defaultValue={current?.channel} className={inputClass} /></Field>
            <Field label="Promised response time (days)" htmlFor="r_sla"><input id="r_sla" name="sla_days" type="number" min={1} defaultValue={current?.sla_days ?? ""} className={inputClass} /></Field>
            <Field label="Last tested" htmlFor="r_tested" hint="Date you last ran a sample request through it."><input id="r_tested" name="last_tested" type="date" defaultValue={current?.last_tested ?? ""} className={inputClass} /></Field>
            <Field label="Requests in the last 12 months" htmlFor="r_n"><input id="r_n" name="requests_12m" type="number" min={0} defaultValue={current?.requests_12m ?? 0} className={inputClass} /></Field>
            <Field label="Closed on time" htmlFor="r_ok"><input id="r_ok" name="closed_on_time_12m" type="number" min={0} defaultValue={current?.closed_on_time_12m ?? 0} className={inputClass} /></Field>
          </div>
          <Field label="Notes on evidence" htmlFor="r_note"><input id="r_note" name="evidence_note" defaultValue={current?.evidence_note} className={inputClass} /></Field>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => setEditing(null)} className={ghostButtonClass}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
