"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { CATEGORY_LABEL, ROLE_LABEL, canReview, dateOnly, dateTime } from "@/lib/format";
import type { Finding, FindingStatus, Person } from "@/lib/types";

type View = "all" | "mine" | "review" | "unassigned" | "overdue";

const STATUS_FILTERS: { value: "" | FindingStatus; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "open", label: "Open" },
  { value: "in_remediation", label: "In remediation" },
  { value: "submitted", label: "Ready for review" },
  { value: "accepted", label: "Risk accepted" },
  { value: "resolved", label: "Resolved" },
];

const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const isClosed = (f: Finding) => f.status === "accepted" || f.status === "resolved";
const ACTION_LABEL: Record<string, string> = {
  created: "Raised by audit",
  assign: "Assigned",
  reassign: "Reassigned",
  start: "Started work",
  comment: "Comment",
  evidence_added: "Evidence added",
  submit: "Marked ready for review",
  send_back: "Rejected back with reason",
  resolve: "Approved and closed",
  accept: "Risk accepted",
};

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
  const [view, setView] = useState<View>("all");
  const [status, setStatus] = useState<"" | FindingStatus>("");
  const [severity, setSeverity] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const open = findings.filter((f) => !isClosed(f));
  const counts: Record<View, number> = {
    all: findings.length,
    mine: open.filter((f) => f.owner === myMembershipId).length,
    review: findings.filter((f) => f.status === "submitted" && f.owner !== myMembershipId && f.submitted_by !== myMembershipId).length,
    unassigned: open.filter((f) => !f.owner).length,
    overdue: open.filter((f) => f.is_overdue).length,
  };
  const visible = findings.filter((f) => {
    if (view === "mine" && !(f.owner === myMembershipId && !isClosed(f))) return false;
    if (view === "review" && !(f.status === "submitted" && f.owner !== myMembershipId && f.submitted_by !== myMembershipId)) return false;
    if (view === "unassigned" && !(!f.owner && !isClosed(f))) return false;
    if (view === "overdue" && !f.is_overdue) return false;
    if (status && f.status !== status) return false;
    if (severity && f.severity !== severity) return false;
    return true;
  });
  const selected = findings.find((f) => f.id === openId) ?? null;
  const VIEWS: { value: View; label: string }[] = [
    { value: "all", label: "All findings" },
    { value: "mine", label: "My assigned actions" },
    ...(canReview(role) ? [{ value: "review" as View, label: "Needs my review" }] : []),
    { value: "unassigned", label: "Unassigned" },
    { value: "overdue", label: "Overdue" },
  ];

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Quick views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => setView(v.value)}
            className={`rounded-full px-3 py-1 text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${view === v.value ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
          >
            {v.label}
            <span className="ml-1 text-slate-400">{counts[v.value]}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <label className="sr-only" htmlFor="flt_status">Status</label>
          <select id="flt_status" value={status} onChange={(e) => setStatus(e.target.value as "" | FindingStatus)} className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1 text-xs text-white">
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="flt_sev">Severity</label>
          <select id="flt_sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1 text-xs text-white">
            <option value="">Any severity</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Findings</caption>
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-white/10">
              <th scope="col" className="p-3 font-medium">Finding</th>
              <th scope="col" className="p-3 font-medium">Severity</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Assigned to</th>
              <th scope="col" className="p-3 font-medium">Priority</th>
              <th scope="col" className="p-3 font-medium">Due</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id} className="border-b border-white/5">
                <td className="p-3">
                  <button type="button" onClick={() => setOpenId(f.id)} className="text-left font-semibold text-cyan-300 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded">
                    {f.title}
                  </button>
                  <div className="text-xs text-slate-500">{f.system_name} - {CATEGORY_LABEL[f.category]}</div>
                </td>
                <td className="p-3"><StateBadge state={f.severity} /></td>
                <td className="p-3"><StateBadge state={f.status} /></td>
                <td className="p-3 text-slate-300">
                  {f.owner_name ?? <span className="text-slate-500">Unassigned</span>}
                  {f.owner === myMembershipId && <span className="ml-1 text-[11px] text-cyan-300">(you)</span>}
                </td>
                <td className="p-3 text-xs text-slate-300">{f.priority ? PRIORITY_LABEL[f.priority] : <span className="text-slate-500">-</span>}</td>
                <td className="p-3 text-xs">
                  {f.due_date ? (
                    <span className={f.is_overdue ? "text-rose-300 font-semibold" : "text-slate-300"}>
                      {dateOnly(f.due_date)}
                      {f.is_overdue ? " (overdue)" : ""}
                    </span>
                  ) : (
                    <span className="text-slate-500">Not set</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-slate-400">
                {view === "mine" ? "Nothing is assigned to you right now." : "No findings match these filters."}
              </td></tr>
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
  const [text, setText] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(finding.due_date ?? "");
  const [priority, setPriority] = useState(finding.priority || "medium");
  const [assignNote, setAssignNote] = useState("");
  const [evTitle, setEvTitle] = useState("");
  const [evUrl, setEvUrl] = useState("");
  const [evFile, setEvFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function run(fn: () => Promise<unknown>, done: string, close = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      onChanged();
      if (close) onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  const post = (action: string, body: unknown) => call("POST", `ai/findings/${finding.id}/${action}/`, body);

  const closed = isClosed(finding);
  const workable = finding.status === "open" || finding.status === "in_remediation";
  const isOwner = finding.owner === myMembershipId;
  const canAssign = (role === "TENANT_ADMIN" || role === "COMPLIANCE_OFFICER") && workable;
  const isReviewer = canReview(role) && finding.status === "submitted";
  const iFixedIt = isOwner || finding.submitted_by === myMembershipId;
  const assignable = people.filter((p) => p.role !== "AUDITOR" && p.role !== "CONTRIBUTOR");

  function assign() {
    if (!owner) return setError("Choose who will fix this.");
    if (!due) return setError("Choose a due date.");
    return run(() => post("assign", { owner, due_date: due, priority, comment: assignNote }), "Assigned. It now shows in their My assigned actions.");
  }
  function addEvidence() {
    if (!evTitle.trim()) return setError("Give the evidence a short title.");
    if (!evUrl.trim() && !evFile) return setError("Add a link or choose a file.");
    const form = new FormData();
    form.set("title", evTitle);
    if (evFile) form.set("file", evFile);
    else form.set("url", evUrl);
    return run(async () => {
      await call("POST", `ai/findings/${finding.id}/evidence/`, form);
      setEvTitle("");
      setEvUrl("");
      setEvFile(null);
    }, "Evidence attached.");
  }

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
          <p className="text-xs text-slate-400">{finding.system_name} - {CATEGORY_LABEL[finding.category]}</p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded p-1 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <StateBadge state={finding.severity} />
        <StateBadge state={finding.status} />
        {finding.is_overdue && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">Overdue</span>}
      </div>

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

      <section className="mt-6 text-sm" aria-labelledby="own-h">
        <h3 id="own-h" className="text-sm font-bold text-white mb-2">Ownership</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate-400">Assigned to</dt>
          <dd>{finding.owner_name ?? "Unassigned"}{isOwner ? " (you)" : ""}</dd>
          <dt className="text-slate-400">Assigned by</dt>
          <dd>{finding.assigned_by_name ?? "-"}{finding.assigned_at ? `, ${dateTime(finding.assigned_at)}` : ""}</dd>
          <dt className="text-slate-400">Priority</dt>
          <dd>{finding.priority ? PRIORITY_LABEL[finding.priority] : "-"}</dd>
          <dt className="text-slate-400">Due</dt>
          <dd className={finding.is_overdue ? "text-rose-300 font-semibold" : ""}>{finding.due_date ? dateOnly(finding.due_date) : "Not set"}</dd>
          {finding.submitted_by_name && (
            <>
              <dt className="text-slate-400">Fixed by</dt>
              <dd>{finding.submitted_by_name}</dd>
            </>
          )}
        </dl>
        {finding.remediation_note && (
          <div className="mt-3">
            <h4 className="text-xs font-semibold text-slate-400">Remediation note</h4>
            <p className="text-slate-200 text-sm">{finding.remediation_note}</p>
          </div>
        )}
      </section>

      {canAssign && (
        <section className="mt-6 space-y-3" aria-labelledby="assign-h">
          <h3 id="assign-h" className="text-sm font-bold text-white">{finding.owner ? "Reassign" : "Assign to an owner"}</h3>
          <Field label="Owner" htmlFor="f_owner">
            <select id="f_owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
              <option value="">Choose a person</option>
              {assignable.map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role] ?? p.role})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="f_due">
              <input id="f_due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Priority" htmlFor="f_prio">
              <select id="f_prio" value={priority} onChange={(e) => setPriority(e.target.value as Exclude<Finding["priority"], "">)} className={inputClass}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Note for the owner (optional)" htmlFor="f_anote">
            <textarea id="f_anote" rows={2} value={assignNote} onChange={(e) => setAssignNote(e.target.value)} className={inputClass} />
          </Field>
          <button type="button" disabled={busy} onClick={assign} className={buttonClass}>{finding.owner ? "Reassign" : "Assign"}</button>
        </section>
      )}

      {workable && isOwner && (
        <section className="mt-6 space-y-3" aria-labelledby="work-h">
          <h3 id="work-h" className="text-sm font-bold text-white">Your work</h3>
          {finding.status === "open" && (
            <button type="button" disabled={busy} onClick={() => run(() => post("start", {}), "Marked as in remediation.")} className={ghostButtonClass}>Start remediation</button>
          )}
          <fieldset className="space-y-2 rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-300">Attach evidence</legend>
            <Field label="Title" htmlFor="ev_title">
              <input id="ev_title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className={inputClass} placeholder="e.g. Pull request, screenshot, policy" />
            </Field>
            <Field label="Link" htmlFor="ev_url">
              <input id="ev_url" type="url" value={evUrl} onChange={(e) => setEvUrl(e.target.value)} disabled={!!evFile} className={inputClass} placeholder="https://" />
            </Field>
            <Field label="Or upload a file (max 10 MB)" htmlFor="ev_file">
              <input id="ev_file" type="file" onChange={(e) => setEvFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-slate-300" />
            </Field>
            <button type="button" disabled={busy} onClick={addEvidence} className={ghostButtonClass}>Attach</button>
          </fieldset>
          <Field label="Remediation note" htmlFor="f_submit" hint="Say what was changed. A different person reviews it and cannot be you.">
            <textarea id="f_submit" rows={3} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
          </Field>
          <button
            type="button"
            disabled={busy}
            onClick={() => (text.trim() ? run(() => post("submit", { comment: text }), "Marked ready for review.", true) : setError("Write a remediation note first."))}
            className={buttonClass}
          >
            Mark ready for review
          </button>
        </section>
      )}
      {workable && !isOwner && finding.owner && (
        <p className="mt-6 text-xs text-slate-400">{finding.owner_name} is working on this. Only they can start it, add evidence or mark it ready.</p>
      )}
      {!finding.owner && workable && !canAssign && (
        <p className="mt-6 text-xs text-slate-400">Nobody owns this yet. A compliance officer assigns it.</p>
      )}

      {finding.attachments.length > 0 && (
        <section className="mt-6" aria-labelledby="ev-h">
          <h3 id="ev-h" className="text-sm font-bold text-white mb-2">Evidence</h3>
          <ul className="space-y-1 text-xs">
            {finding.attachments.map((a) => (
              <li key={a.id} className="text-slate-300">
                {a.kind === "link" && a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">{a.title}</a>
                ) : (
                  <a href={`/api/proxy/ai/findings/${finding.id}/evidence/${a.id}/download/`} className="text-cyan-300 underline">{a.title} ({a.filename})</a>
                )}
                <span className="text-slate-500"> - {a.by ?? "unknown"}, {dateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {finding.status === "submitted" && (
        <section className="mt-6 space-y-3" aria-labelledby="rev-h">
          <h3 id="rev-h" className="text-sm font-bold text-white">Review</h3>
          {!isReviewer && <p className="text-xs text-slate-400">Waiting for a compliance officer to review. Reviewers hold the Reviewer or Administrator role.</p>}
          {isReviewer && iFixedIt && (
            <p className="text-xs text-amber-200">You fixed or own this finding, so you cannot approve it. Another reviewer must.</p>
          )}
          {isReviewer && !iFixedIt && (
            <>
              <Field label="Decision comment" htmlFor="f_review" hint="Required. A rejection reason goes back to the owner.">
                <textarea id="f_review" rows={2} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {(["resolve", "send-back", "accept"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    onClick={() => (reviewComment.trim() ? run(() => post(a, { comment: reviewComment }), "Decision recorded.", true) : setError("Add a comment explaining your decision."))}
                    className={a === "resolve" ? buttonClass : ghostButtonClass}
                  >
                    {a === "resolve" ? "Approve and close" : a === "send-back" ? "Reject back" : "Accept the risk"}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {closed && (
        <p className="mt-6 text-xs text-slate-300">
          {finding.status === "accepted" ? "Risk accepted" : "Approved and closed"} by {finding.reviewed_by_name ?? "a reviewer"} on {dateTime(finding.reviewed_at)}
          {finding.review_comment && <>: &quot;{finding.review_comment}&quot;</>}
        </p>
      )}

      <section className="mt-6 space-y-2" aria-labelledby="disc-h">
        <h3 id="disc-h" className="text-sm font-bold text-white">Add a comment</h3>
        <label htmlFor="f_comment" className="sr-only">Comment</label>
        <textarea id="f_comment" rows={2} value={discussion} onChange={(e) => setDiscussion(e.target.value)} className={inputClass} />
        <button
          type="button"
          disabled={busy}
          onClick={() => (discussion.trim() ? run(async () => { await post("comment", { comment: discussion }); setDiscussion(""); }, "Comment added.") : setError("Write a comment first."))}
          className={ghostButtonClass}
        >
          Post comment
        </button>
      </section>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`mt-3 text-xs ${error ? "text-rose-300" : "text-emerald-300"}`}>{error ?? notice}</p>
      )}

      <section className="mt-6" aria-labelledby="hist-h">
        <h3 id="hist-h" className="text-sm font-bold text-white mb-2">Activity timeline</h3>
        <ol className="space-y-2">
          {finding.history.map((h, i) => (
            <li key={i} className="text-xs text-slate-300 border-l-2 border-white/10 pl-3">
              <span className="font-semibold text-slate-100">{ACTION_LABEL[h.action] ?? h.action.replace("_", " ")}</span> - {h.actor}, {dateTime(h.at)}
              {h.comment && <div className="text-slate-400">&quot;{h.comment}&quot;</div>}
            </li>
          ))}
        </ol>
      </section>
    </dialog>
  );
}
