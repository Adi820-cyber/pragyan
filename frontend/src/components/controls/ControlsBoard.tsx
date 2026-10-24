"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Loader2, ExternalLink } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, canReview, dateTime } from "@/lib/format";
import type { ControlAssessment, ControlPack } from "@/lib/types";

export function ControlsBoard({
  assessments,
  packs,
  role,
}: {
  assessments: ControlAssessment[];
  packs: ControlPack[];
  role: string;
}) {
  const used = packs.filter((p) => assessments.some((a) => a.pack_id === p.pack_id));
  return (
    <div className="space-y-8">
      {used.map((pack) => {
        const rows = assessments.filter((a) => a.pack_id === pack.pack_id);
        const applicableRows = rows.filter((a) => a.applicable);
        const open = applicableRows.filter((a) => a.state !== "reviewed").length;
        return (
          <section key={pack.pack_id} aria-labelledby={`pack-${pack.pack_id}`} className="space-y-4">
            <div className="border-b border-zinc-800 pb-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`pack-${pack.pack_id}`} className="text-sm font-semibold text-zinc-100">
                  {pack.title} <span className="text-xs font-mono text-zinc-500 font-normal">v{pack.version}</span>
                </h2>
                <span className="text-xs text-zinc-400 tabular-nums">
                  <strong className="text-zinc-200">{open}</strong> of {applicableRows.length} applicable items pending evidence/review
                </span>
              </div>

              <div
                role="note"
                className="mt-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300 space-y-1"
              >
                <p className="font-medium text-zinc-200">{pack.legal_review_status}</p>
                <p className="text-zinc-400">{pack.effective_status_note}</p>
                <div className="text-[11px] text-zinc-400 pt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <span>Sources:</span>
                  {pack.sources.map((s, i) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-zinc-300 hover:text-white underline underline-offset-2"
                    >
                      <span>{s.label}</span>
                      <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-900/40 overflow-hidden">
              {rows.map((a) => (
                <ControlCard key={a.id} a={a} role={role} />
              ))}
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
    <li className="transition-colors hover:bg-zinc-800/20">
      <details className="group">
        <summary className="flex flex-wrap items-center gap-3 p-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 select-none">
          <span className="text-xs font-mono text-zinc-500 w-24 shrink-0 font-medium">{a.control_id}</span>
          <span className="text-xs font-medium text-zinc-100 flex-1 min-w-48 leading-relaxed">
            {c?.title ?? a.control_id}
          </span>
          <span className="text-xs text-zinc-500 hidden sm:inline">{c?.source}</span>
          <div className="shrink-0">
            <StateBadge state={a.state} />
          </div>
        </summary>

        <div className="px-4 pb-4 pt-1 space-y-4 text-xs border-t border-zinc-800/60 bg-zinc-950/40">
          {c && (
            <div className="space-y-2 pt-2">
              <div className="text-zinc-200">
                <span className="font-semibold text-zinc-400">Assessment Question: </span>
                {c.question}
              </div>
              <div className="text-zinc-300">
                <span className="font-semibold text-zinc-400">Requirement Specification: </span>
                {c.requirement}
              </div>
              {c.required_evidence.length > 0 && (
                <div>
                  <span className="font-semibold text-zinc-400 block mb-1">Required Evidence Artifacts:</span>
                  <ul className="list-disc ml-4 space-y-0.5 text-zinc-300">
                    {c.required_evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {c.guidance && <p className="text-zinc-400 italic pt-1">{c.guidance}</p>}
            </div>
          )}

          {a.evidence_files.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/80">
              <h4 className="font-semibold text-zinc-300 mb-2">Verified Evidence Artifacts on File</h4>
              <ul className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-md bg-zinc-900/60">
                {a.evidence_files.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-2.5">
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-medium text-zinc-100 truncate">{e.title}</div>
                      <div className="text-[11px] text-zinc-400">
                        Uploaded by {e.uploaded_by_name ?? "System User"} on {dateTime(e.created_at)}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500 truncate" title={e.sha256}>
                        SHA-256: {e.sha256}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/proxy/ai/control-evidence/${e.id}/download/`}
                        className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                      >
                        <Download className="w-3 h-3" aria-hidden="true" />
                        <span>Download</span>
                      </a>
                      {canEdit(role) && a.state !== "reviewed" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => call("DELETE", `ai/control-evidence/${e.id}/`))}
                          className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-100 px-2 py-1.5 rounded hover:bg-red-950/60 transition-colors"
                          aria-label={`Remove evidence ${e.title}`}
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.reviewed_at && (
            <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/40 text-zinc-300">
              <span className="font-medium text-zinc-200">
                Reviewed by {a.reviewer_name ?? "Reviewer"} on {dateTime(a.reviewed_at)}:
              </span>{" "}
              &ldquo;{a.review_comment}&rdquo;
            </div>
          )}

          {a.applicable && canEdit(role) && (
            <form onSubmit={upload} className="grid md:grid-cols-3 gap-3 items-end pt-3 border-t border-zinc-800">
              <Field label="Evidence Document Title" htmlFor={`t-${a.id}`}>
                <input
                  id={`t-${a.id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Consent Architecture Specs v1.2"
                  className={inputClass}
                />
              </Field>
              <Field label="File Attachment (Max 10 MB)" htmlFor={`f-${a.id}`}>
                <input
                  id={`f-${a.id}`}
                  name="file"
                  type="file"
                  required
                  className={`${inputClass} file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200`}
                />
              </Field>
              <button type="submit" disabled={busy} className={ghostButtonClass}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{busy ? "Uploading..." : "Attach Evidence"}</span>
              </button>
            </form>
          )}

          {a.applicable &&
            canReview(role) &&
            (a.state === "evidence_supplied" || a.state === "needs_evidence" || a.state === "gap_identified") && (
              <div className="space-y-3 border-t border-zinc-800 pt-3">
                <Field
                  label="Formal Review Sign-off Note"
                  htmlFor={`r-${a.id}`}
                  hint="Required audit sign-off. Note: Self-review by the evidence author is blocked."
                >
                  <textarea
                    id={`r-${a.id}`}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Enter review decision notes and evaluation rationale..."
                    className={inputClass}
                  />
                </Field>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy || !comment.trim()}
                    onClick={() =>
                      run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "reviewed", comment }))
                    }
                    className={buttonClass}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Accept Evidence (Pass)</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy || !comment.trim()}
                    onClick={() =>
                      run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "gap_identified", comment }))
                    }
                    className={ghostButtonClass}
                  >
                    <span>Record Governance Gap</span>
                  </button>
                </div>
              </div>
            )}

          {canEdit(role) && (
            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!a.applicable}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.checked && !rationale.trim()) {
                      setError("Document the legal or architectural rationale before marking as non-applicable.");
                      return;
                    }
                    run(() =>
                      call("PATCH", `ai/control-assessments/${a.id}/`, {
                        applicable: !e.target.checked,
                        applicability_rationale: rationale,
                      })
                    );
                  }}
                  className="rounded border-zinc-700 bg-zinc-900 text-zinc-100"
                />
                <span>Exempt / Control does not apply to this architecture</span>
              </label>
              <Field label="Exemption Rationale" htmlFor={`a-${a.id}`}>
                <input
                  id={`a-${a.id}`}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Legal rationale for non-applicability..."
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {error && (
            <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
