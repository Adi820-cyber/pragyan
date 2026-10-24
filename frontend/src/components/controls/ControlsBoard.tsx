"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, canReview, dateTime } from "@/lib/format";
import type { ControlAssessment, ControlPack } from "@/lib/types";

export function ControlsBoard({ assessments, packs, role }: { assessments: ControlAssessment[]; packs: ControlPack[]; role: string }) {
  const used = packs.filter((p) => assessments.some((a) => a.pack_id === p.pack_id));
  return (
    <div className="space-y-8">
      {used.map((pack) => {
        const rows = assessments.filter((a) => a.pack_id === pack.pack_id);
        const open = rows.filter((a) => a.applicable && a.state !== "reviewed").length;
        return (
          <section key={pack.pack_id} aria-labelledby={`pack-${pack.pack_id}`} className="space-y-3">
            <div>
              <h2 id={`pack-${pack.pack_id}`} className="text-base font-bold text-white">{pack.title} <span className="text-xs font-normal text-slate-500">v{pack.version}</span></h2>
              <p className="text-xs text-slate-400">{open} of {rows.filter((a) => a.applicable).length} applicable items still need evidence or review.</p>
              <div role="note" className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-1">
                <p>{pack.legal_review_status}</p>
                <p>{pack.effective_status_note}</p>
                <p>
                  Sources:{" "}
                  {pack.sources.map((s, i) => (
                    <span key={s.url}>
                      {i > 0 && ", "}
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a>
                    </span>
                  ))}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {rows.map((a) => <ControlCard key={a.id} a={a} role={role} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ControlCard({ a, role }: { a: ControlAssessment; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState(a.applicability_rationale);
  const c = a.control;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setComment("");
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("title", title);
    await run(async () => {
      await call("POST", `ai/control-assessments/${a.id}/evidence/`, form);
      setTitle("");
      (event.target as HTMLFormElement).reset();
    });
  }

  return (
    <li className="rounded-lg border border-white/10 bg-slate-900/40">
      <details>
        <summary className="flex flex-wrap items-center gap-3 p-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg">
          <span className="text-xs font-mono text-slate-500 w-20">{a.control_id}</span>
          <span className="text-sm font-semibold text-slate-100 flex-1 min-w-48">{c?.title ?? a.control_id}</span>
          <span className="text-xs text-slate-500">{c?.source}</span>
          <StateBadge state={a.state} />
        </summary>
        <div className="p-4 pt-1 space-y-4 text-sm">
          {c && (
            <div className="space-y-2">
              <p className="text-slate-200"><span className="text-xs text-slate-500">Question: </span>{c.question}</p>
              <p className="text-slate-300"><span className="text-xs text-slate-500">What it asks for: </span>{c.requirement}</p>
              <div>
                <span className="text-xs text-slate-500">Evidence to supply:</span>
                <ul className="list-disc ml-5 text-slate-300">{c.required_evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
              <p className="text-xs text-slate-400">{c.guidance}</p>
            </div>
          )}

          {a.evidence_files.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Evidence on file</h3>
              <ul className="space-y-1">
                {a.evidence_files.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <span className="font-medium text-slate-100">{e.title}</span>
                    <span>{e.uploaded_by_name ?? "unknown"} · {dateTime(e.created_at)}</span>
                    <span className="font-mono text-slate-500" title={e.sha256}>sha256 {e.sha256.slice(0, 12)}</span>
                    <a href={`/api/proxy/ai/control-evidence/${e.id}/download/`} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 underline">
                      <Download className="w-3 h-3" aria-hidden="true" /> Download
                    </a>
                    {canEdit(role) && a.state !== "reviewed" && (
                      <button type="button" disabled={busy} onClick={() => run(() => call("DELETE", `ai/control-evidence/${e.id}/`))} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 underline">
                        <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.reviewed_at && (
            <p className="text-xs text-slate-300">
              Reviewed by {a.reviewer_name ?? "a reviewer"} on {dateTime(a.reviewed_at)}: &quot;{a.review_comment}&quot;
            </p>
          )}

          {a.applicable && canEdit(role) && (
            <form onSubmit={upload} className="grid md:grid-cols-3 gap-3 items-end">
              <Field label="Evidence title" htmlFor={`t-${a.id}`}>
                <input id={`t-${a.id}`} value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
              </Field>
              <Field label="File (up to 10 MB)" htmlFor={`f-${a.id}`}>
                <input id={`f-${a.id}`} name="file" type="file" required className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white`} />
              </Field>
              <button type="submit" disabled={busy} className={ghostButtonClass}>Upload evidence</button>
            </form>
          )}

          {a.applicable && canReview(role) && (a.state === "evidence_supplied" || a.state === "needs_evidence" || a.state === "gap_identified") && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <Field label="Review comment" htmlFor={`r-${a.id}`} hint="Required. The person who uploaded the evidence cannot review it.">
                <textarea id={`r-${a.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !comment.trim()} onClick={() => run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "reviewed", comment }))} className={buttonClass}>Evidence is adequate</button>
                <button type="button" disabled={busy || !comment.trim()} onClick={() => run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "gap_identified", comment }))} className={ghostButtonClass}>Record a gap</button>
              </div>
            </div>
          )}

          {canEdit(role) && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={!a.applicable}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.checked && !rationale.trim()) { setError("Say why this control does not apply, then tick the box."); return; }
                    run(() => call("PATCH", `ai/control-assessments/${a.id}/`, { applicable: !e.target.checked, applicability_rationale: rationale }));
                  }}
                  className="accent-cyan-500"
                />
                This control does not apply to this system
              </label>
              <Field label="Why it does or does not apply" htmlFor={`a-${a.id}`}>
                <input id={`a-${a.id}`} value={rationale} onChange={(e) => setRationale(e.target.value)} className={inputClass} />
              </Field>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        </div>
      </details>
    </li>
  );
}
