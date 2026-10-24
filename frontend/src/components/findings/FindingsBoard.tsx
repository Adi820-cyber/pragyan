"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Check } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { CATEGORY_LABEL, canEdit, canReview, dateOnly, dateTime } from "@/lib/format";
import type { Finding, FindingStatus, Person } from "@/lib/types";

const STATUS_FILTERS: { value: "" | FindingStatus; label: string }[] = [
  { value: "", label: "All Findings" },
  { value: "open", label: "Open" },
  { value: "in_remediation", label: "In Remediation" },
  { value: "submitted", label: "Awaiting Review" },
  { value: "accepted", label: "Risk Accepted" },
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
      {/* Status Filter Bar */}
      <div role="group" aria-label="Filter findings by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const isSelected = filter === s.value;
          const count = s.value ? findings.filter((f) => f.status === s.value).length : findings.length;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setFilter(s.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 cursor-pointer ${
                isSelected
                  ? "border-zinc-500 bg-zinc-800 text-zinc-100 shadow-xs"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              <span>{s.label}</span>
              <span className="ml-1.5 text-zinc-500 tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Findings Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Identified audit findings</caption>
            <thead className="bg-zinc-900/80 text-xs font-medium text-zinc-400 border-b border-zinc-800">
              <tr>
                <th scope="col" className="py-3 px-4">Finding & System</th>
                <th scope="col" className="py-3 px-4">Severity</th>
                <th scope="col" className="py-3 px-4">Status</th>
                <th scope="col" className="py-3 px-4">Owner</th>
                <th scope="col" className="py-3 px-4 text-right">Target Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {visible.map((f) => {
                const overdue =
                  f.due_date && f.due_date < today && f.status !== "accepted" && f.status !== "resolved";
                return (
                  <tr key={f.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-4 min-w-[280px]">
                      <button
                        type="button"
                        onClick={() => setOpenId(f.id)}
                        className="text-left font-medium text-zinc-100 hover:text-white underline underline-offset-4 decoration-zinc-700 hover:decoration-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-xs cursor-pointer"
                      >
                        {f.title}
                      </button>
                      <div className="text-xs text-zinc-400 mt-0.5 truncate">
                        {f.system_name} · {CATEGORY_LABEL[f.category]}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StateBadge state={f.severity} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StateBadge state={f.status} />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-300">
                      {f.owner_name ?? <span className="text-zinc-500">Unassigned</span>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-right tabular-nums">
                      {f.due_date ? (
                        <span className={overdue ? "text-red-400 font-semibold" : "text-zinc-300"}>
                          {dateOnly(f.due_date)}
                          {overdue && " (Overdue)"}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-zinc-400">
                    No findings recorded matching the active filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
      setError("Document your evaluation rationale before recording this decision.");
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
      await call("PATCH", `ai/findings/${finding.id}/`, {
        owner: owner || null,
        due_date: due || null,
        remediation_note: note,
      });
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
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      aria-labelledby="finding-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto bg-zinc-950 text-zinc-100 border-l border-zinc-800 p-6 backdrop:bg-black/75 z-50 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="min-w-0 pr-2">
          <h2 id="finding-title" className="text-base font-semibold text-zinc-100 leading-snug">
            {finding.title}
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {finding.system_name} · {CATEGORY_LABEL[finding.category]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
          className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <StateBadge state={finding.severity} />
        <StateBadge state={finding.status} />
      </div>

      <section className="mt-5 space-y-3 text-xs leading-relaxed border-b border-zinc-800 pb-5">
        <div>
          <h3 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] mb-1">
            Audit Observation
          </h3>
          <p className="text-zinc-200 bg-zinc-900/50 p-3 rounded-md border border-zinc-800">
            {finding.plain_language}
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] mb-1">
            Remediation Guidance
          </h3>
          <p className="text-zinc-300">{finding.next_step}</p>
        </div>
      </section>

      {/* Remediation Plan Section */}
      <section className="mt-5 space-y-3.5 border-b border-zinc-800 pb-5" aria-labelledby="plan-h">
        <h3 id="plan-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Remediation Assignment & Target
        </h3>
        <Field label="Designated Owner" htmlFor="f_owner">
          <select
            id="f_owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            disabled={!editable}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remediation Target Due Date" htmlFor="f_due">
          <input
            id="f_due"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            disabled={!editable}
            className={inputClass}
          />
        </Field>
        <Field label="Remediation Actions Taken or Planned" htmlFor="f_note">
          <textarea
            id="f_note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!editable}
            placeholder="Document code modifications, dataset adjustments, or guardrails added..."
            className={inputClass}
          />
        </Field>
        {editable && (
          <div className="flex items-center gap-2.5 pt-1">
            <button type="button" disabled={busy} onClick={savePlan} className={ghostButtonClass}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Save Assignment & Plan</span>
            </button>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Saved successfully</span>
              </span>
            )}
          </div>
        )}
      </section>

      {/* Review & Formal Decision Section */}
      <section className="mt-5 space-y-3.5 border-b border-zinc-800 pb-5" aria-labelledby="act-h">
        <h3 id="act-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Governance Decision
        </h3>
        {finding.status === "open" && editable && (
          <button type="button" disabled={busy} onClick={() => act("start", false)} className={ghostButtonClass}>
            <span>Mark Remediation in Progress</span>
          </button>
        )}
        {(finding.status === "open" || finding.status === "in_remediation") && editable && (
          <div className="space-y-3 pt-2">
            <Field
              label="Remediation Summary for Auditor / Reviewer"
              htmlFor="f_submit"
              hint="Explain actions taken before sending to an independent reviewer for sign-off."
            >
              <textarea
                id="f_submit"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Detail changes submitted for review..."
                className={inputClass}
              />
            </Field>
            <button type="button" disabled={busy} onClick={() => act("submit", true)} className={buttonClass}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Submit for Independent Review</span>
            </button>
          </div>
        )}
        {finding.status === "submitted" && !reviewer && (
          <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400">
            Awaiting evaluation by an independent Reviewer or Administrator.
          </div>
        )}
        {reviewer && (
          <div className="space-y-3 pt-2">
            {isOwner && (
              <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                Segregation of duties: You are the assigned owner of this finding. An independent reviewer must sign off.
              </div>
            )}
            <Field
              label="Review Evaluation Sign-off Note"
              htmlFor="f_review"
              hint="Required. This audit statement is permanently recorded on the finding history."
            >
              <textarea
                id="f_review"
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Document verification of fix or accepted residual risk rationale..."
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => act("resolve", true)}
                className={buttonClass}
              >
                <span>Approve & Resolve Finding</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act("accept", true)}
                className={ghostButtonClass}
              >
                <span>Accept Residual Risk</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act("send-back", true)}
                className={ghostButtonClass}
              >
                <span>Request Additional Remediation</span>
              </button>
            </div>
          </div>
        )}
        {(finding.status === "accepted" || finding.status === "resolved") && (
          <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-300">
            <span className="font-semibold text-zinc-100">
              {finding.status === "accepted" ? "Risk Accepted" : "Resolved"}
            </span>{" "}
            by {finding.reviewed_by_name ?? "Reviewer"} on {dateTime(finding.reviewed_at)}
            {finding.review_comment && <>: &ldquo;{finding.review_comment}&rdquo;</>}
          </div>
        )}
        {error && (
          <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
            {error}
          </div>
        )}
      </section>

      {/* Audit Trail History */}
      <section className="mt-5 space-y-2.5" aria-labelledby="hist-h">
        <h3 id="hist-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Audit Trail History
        </h3>
        <ol className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-md bg-zinc-900/30">
          {finding.history.map((h, i) => (
            <li key={i} className="p-3 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-100 capitalize">
                  {h.action.replace("_", " ")}
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums">{dateTime(h.at)}</span>
              </div>
              <div className="text-zinc-400 text-[11px] mt-0.5">by {h.actor}</div>
              {h.comment && (
                <div className="text-zinc-300 bg-zinc-900/60 p-2 rounded mt-1.5 font-mono text-[11px]">
                  &ldquo;{h.comment}&rdquo;
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </dialog>
  );
}
