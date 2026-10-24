"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { CATEGORY_LABEL, canEdit, canReview, dateOnly, dateTime } from "@/lib/format";
import type { Finding, FindingStatus, Person } from "@/lib/types";

const STATUS_FILTERS: { value: "" | FindingStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_remediation", label: "In remediation" },
  { value: "submitted", label: "Awaiting review" },
  { value: "accepted", label: "Risk accepted" },
  { value: "resolved", label: "Resolved" },
];

export function FindingsBoard({
  findings,
  people,
  role,
  myMembershipId,
}: {
  findings: Finding[];
  people: Person[];
  role: string;
  myMembershipId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"" | FindingStatus>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = findings.filter((f) => !filter || f.status === filter);
  const selected = findings.find((f) => f.id === openId) ?? null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={filter === s.value}
            onClick={() => setFilter(s.value)}
            className={`rounded-full px-3 py-1 text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${filter === s.value ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
          >
            {s.label}
            {s.value && <span className="ml-1 text-slate-500">{findings.filter((f) => f.status === s.value).length}</span>}
          </button>
        ))}
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Findings</caption>
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-white/10">
              <th scope="col" className="p-3 font-medium">Finding</th>
              <th scope="col" className="p-3 font-medium">Severity</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Owner</th>
              <th scope="col" className="p-3 font-medium">Due</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const overdue = f.due_date && f.due_date < today && f.status !== "accepted" && f.status !== "resolved";
              return (
                <tr key={f.id} className="border-b border-white/5">
                  <td className="p-3">
                    <button type="button" onClick={() => setOpenId(f.id)} className="text-left font-semibold text-cyan-300 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded">
                      {f.title}
                    </button>
                    <div className="text-xs text-slate-500">{f.system_name} · {CATEGORY_LABEL[f.category]}</div>
                  </td>
                  <td className="p-3"><StateBadge state={f.severity} /></td>
                  <td className="p-3"><StateBadge state={f.status} /></td>
                  <td className="p-3 text-slate-300">{f.owner_name ?? "Unassigned"}</td>
                  <td className="p-3 text-xs">
                    {f.due_date ? <span className={overdue ? "text-rose-300 font-semibold" : "text-slate-300"}>{dateOnly(f.due_date)}{overdue ? " (overdue)" : ""}</span> : <span className="text-slate-500">Not set</span>}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-xs text-slate-400">No findings with this status.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <FindingDrawer
          key={selected.id}
          finding={selected}
          people={people}
          role={role}
          myMembershipId={myMembershipId}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

function FindingDrawer({
  finding,
  people,
  role,
  myMembershipId,
  onClose,
  onChanged,
}: {
  finding: Finding;
  people: Person[];
  role: string;
  myMembershipId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [comment, setComment] = useState("");
  const [owner, setOwner] = useState(finding.owner ?? "");
  const [due, setDue] = useState(finding.due_date ?? "");
  const [note, setNote] = useState(finding.remediation_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function act(action: string, requireComment: boolean) {
    if (requireComment && !comment.trim()) {
      setError("Add a comment explaining your decision.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call("POST", `ai/findings/${finding.id}/${action}/`, { comment });
      setComment("");
      onChanged();
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await call("PATCH", `ai/findings/${finding.id}/`, { owner: owner || null, due_date: due || null, remediation_note: note });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const editable = canEdit(role) && finding.status !== "accepted" && finding.status !== "resolved";
  const isOwner = finding.owner === myMembershipId;
  const reviewer = canReview(role) && finding.status === "submitted";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="finding-title"
      className="m-0 ml-auto h-screen max-h-screen w-full max-w-xl overflow-y-auto bg-[#0a1020] text-slate-100 border-l border-white/10 p-6 backdrop:bg-black/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="finding-title" className="text-base font-bold text-white">{finding.title}</h2>
          <p className="text-xs text-slate-400">{finding.system_name} · {CATEGORY_LABEL[finding.category]}</p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex gap-2 mt-3"><StateBadge state={finding.severity} /><StateBadge state={finding.status} /></div>

      <section className="mt-5 space-y-3 text-sm">
        <div>
          <h3 className="text-xs font-semibold text-slate-400">What was found</h3>
          <p className="text-slate-200">{finding.plain_language}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-400">Suggested next step</h3>
          <p className="text-slate-200">{finding.next_step}</p>
        </div>
      </section>

      <section className="mt-6 space-y-3" aria-labelledby="plan-h">
        <h3 id="plan-h" className="text-sm font-bold text-white">Plan</h3>
        <Field label="Owner" htmlFor="f_owner">
          <select id="f_owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!editable} className={inputClass}>
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Due date" htmlFor="f_due">
          <input id="f_due" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!editable} className={inputClass} />
        </Field>
        <Field label="What was done or will be done" htmlFor="f_note">
          <textarea id="f_note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={!editable} className={inputClass} />
        </Field>
        {editable && (
          <button type="button" disabled={busy} onClick={savePlan} className={ghostButtonClass}>Save plan</button>
        )}
        {saved && <span role="status" className="ml-3 text-xs text-emerald-300">Saved</span>}
      </section>

      <section className="mt-6 space-y-3" aria-labelledby="act-h">
        <h3 id="act-h" className="text-sm font-bold text-white">Decision</h3>
        {finding.status === "open" && editable && <button type="button" disabled={busy} onClick={() => act("start", false)} className={ghostButtonClass}>Start remediation</button>}
        {(finding.status === "open" || finding.status === "in_remediation") && editable && (
          <>
            <Field label="Summary for the reviewer" htmlFor="f_submit" hint="Say what was changed or why the risk is acceptable. A different person reviews it.">
              <textarea id="f_submit" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
            </Field>
            <button type="button" disabled={busy} onClick={() => act("submit", true)} className={buttonClass}>Submit for review</button>
          </>
        )}
        {finding.status === "submitted" && !reviewer && (
          <p className="text-xs text-slate-400">Waiting for a reviewer. Reviewers hold the Reviewer or Administrator role.</p>
        )}
        {reviewer && (
          <>
            {isOwner && <p className="text-xs text-amber-200">You own this finding, so you cannot review it. Another reviewer must.</p>}
            <Field label="Review comment" htmlFor="f_review" hint="Required. It is saved with the finding and appears in the report.">
              <textarea id="f_review" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => act("resolve", true)} className={buttonClass}>Mark resolved</button>
              <button type="button" disabled={busy} onClick={() => act("accept", true)} className={ghostButtonClass}>Accept the risk</button>
              <button type="button" disabled={busy} onClick={() => act("send-back", true)} className={ghostButtonClass}>Send back</button>
            </div>
            <p className="text-[11px] text-slate-500">Accepting a risk records your decision. It does not change the measurements that raised the finding.</p>
          </>
        )}
        {(finding.status === "accepted" || finding.status === "resolved") && (
          <p className="text-xs text-slate-300">
            {finding.status === "accepted" ? "Risk accepted" : "Resolved"} by {finding.reviewed_by_name ?? "a reviewer"} on {dateTime(finding.reviewed_at)}
            {finding.review_comment && <>: &quot;{finding.review_comment}&quot;</>}
          </p>
        )}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </section>

      <section className="mt-6" aria-labelledby="hist-h">
        <h3 id="hist-h" className="text-sm font-bold text-white mb-2">History</h3>
        <ol className="space-y-2">
          {finding.history.map((h, i) => (
            <li key={i} className="text-xs text-slate-300 border-l-2 border-white/10 pl-3">
              <span className="font-semibold text-slate-100">{h.action.replace("_", " ")}</span> by {h.actor} · {dateTime(h.at)}
              {h.comment && <div className="text-slate-400">&quot;{h.comment}&quot;</div>}
            </li>
          ))}
        </ol>
      </section>
    </dialog>
  );
}
