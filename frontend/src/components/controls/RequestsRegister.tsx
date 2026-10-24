"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, Panel, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, dateOnly } from "@/lib/format";
import type { AISystem, DataSubjectRequest, Person } from "@/lib/types";

const KIND: Record<string, string> = {
  access: "Access to data",
  correction: "Correction of data",
  erasure: "Erasure of data",
  withdraw_consent: "Withdrawal of consent",
  grievance: "Grievance redressal",
  human_review: "Human review of an automated decision",
  consent: "Consent query or record",
};
const STATUS: Record<string, string> = { received: "Received", in_progress: "In progress", completed: "Completed", rejected: "Rejected with reasons" };

export function RequestsRegister({ requests, systems, people, role }: { requests: DataSubjectRequest[]; systems: AISystem[]; people: Person[]; role: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(role);

  const open = requests.filter((r) => r.status === "received" || r.status === "in_progress");
  const overdue = open.filter((r) => r.overdue);
  const shown = requests.filter((r) => (!status || r.status === status) && (!kind || r.kind === kind) && (!overdueOnly || (r.overdue && (r.status === "received" || r.status === "in_progress"))));

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    await act(async () => {
      await call("POST", "ai/subject-requests/", {
        system: f.get("system"),
        reference: f.get("reference"),
        kind: f.get("kind"),
        received_on: f.get("received_on"),
        due_on: f.get("due_on") || undefined,
        assignee: f.get("assignee") || null,
        notes: f.get("notes") || "",
      });
      setAdding(false);
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        <strong className="text-slate-300">What this shows:</strong> each request from a person exercising a data right (access, correction, erasure, grievance, consent), with its due date.
        Due dates default to the system&apos;s declared response period, or 30 days if none is declared (90 days for DPDP-only grievances). Confirm periods against current law. Use a ticket
        reference, never a name or email.
      </p>
      <div className="flex flex-wrap gap-4 text-xs text-slate-300">
        <span>{requests.length} total</span>
        <span>{open.length} open</span>
        <span className={overdue.length ? "text-rose-300 font-semibold" : ""}>{overdue.length} overdue</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status" htmlFor="r-status">
          <select id="r-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Type" htmlFor="r-kind">
          <select id="r-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-200 pb-2">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="accent-cyan-500" /> Overdue only
        </label>
        {editable && <button type="button" className={buttonClass} onClick={() => setAdding(true)}>Log request</button>}
      </div>

      {adding && (
        <Panel title="Log a request">
          <form onSubmit={create} className="grid md:grid-cols-3 gap-3">
            <Field label="AI system" htmlFor="rf-system">
              <select id="rf-system" name="system" required className={inputClass}>{systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
            <Field label="Reference" htmlFor="rf-ref" hint="Ticket or pseudonymous ID. No names or emails."><input id="rf-ref" name="reference" required maxLength={60} className={inputClass} /></Field>
            <Field label="Type" htmlFor="rf-kind">
              <select id="rf-kind" name="kind" required className={inputClass}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </Field>
            <Field label="Received on" htmlFor="rf-recv"><input id="rf-recv" name="received_on" type="date" defaultValue={today} max={today} required className={inputClass} /></Field>
            <Field label="Due on" htmlFor="rf-due" hint="Leave empty to use the default response period."><input id="rf-due" name="due_on" type="date" className={inputClass} /></Field>
            <Field label="Assigned to" htmlFor="rf-asg">
              <select id="rf-asg" name="assignee" className={inputClass}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </Field>
            <div className="md:col-span-3"><Field label="Notes" htmlFor="rf-notes"><input id="rf-notes" name="notes" className={inputClass} /></Field></div>
            <div className="md:col-span-3 flex gap-2">
              <button type="submit" disabled={busy} className={buttonClass}>Save request</button>
              <button type="button" onClick={() => { setAdding(false); setError(null); }} className={ghostButtonClass}>Cancel</button>
            </div>
          </form>
        </Panel>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

      {shown.length === 0 ? (
        <p className="text-xs text-slate-400">{requests.length === 0 ? "No requests are logged yet." : "No requests match the filters."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <caption className="sr-only">Data-subject request register</caption>
            <thead className="text-slate-500">
              <tr>{["Reference", "Type", "AI system", "Received", "Due", "Assigned to", "Status", "SLA"].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="text-slate-200">
              {shown.map((r) => {
                const isOpen = r.status === "received" || r.status === "in_progress";
                return (
                  <tr key={r.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-3"><div className="font-mono">{r.reference}</div>{r.is_demo && <div className="text-[10px] text-amber-300">Demo data</div>}{r.notes && <div className="text-slate-500 max-w-xs">{r.notes}</div>}</td>
                    <td className="py-2 pr-3">{r.kind_label}</td>
                    <td className="py-2 pr-3">{r.system_name}</td>
                    <td className="py-2 pr-3">{dateOnly(r.received_on)}</td>
                    <td className="py-2 pr-3">{dateOnly(r.due_on)}</td>
                    <td className="py-2 pr-3">
                      {editable ? (
                        <select aria-label={`Assignee for ${r.reference}`} value={r.assignee ?? ""} disabled={busy} onChange={(e) => act(() => call("PATCH", `ai/subject-requests/${r.id}/`, { assignee: e.target.value || null }))} className={inputClass}>
                          <option value="">Unassigned</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : (r.assignee_name ?? "Unassigned")}
                    </td>
                    <td className="py-2 pr-3">
                      {editable ? (
                        <select aria-label={`Status for ${r.reference}`} value={r.status} disabled={busy} onChange={(e) => act(() => call("PATCH", `ai/subject-requests/${r.id}/`, { status: e.target.value }))} className={inputClass}>
                          {Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      ) : STATUS[r.status]}
                    </td>
                    <td className="py-2 pr-3">
                      {isOpen ? (
                        r.overdue ? <span className="font-semibold text-rose-300">Overdue by {Math.abs(r.days_left ?? 0)} day(s)</span> : <span>{r.days_left} day(s) left</span>
                      ) : r.overdue ? (
                        <span className="text-amber-300">Closed late ({dateOnly(r.closed_on)})</span>
                      ) : (
                        <span className="text-emerald-300">Closed on time ({dateOnly(r.closed_on)})</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
