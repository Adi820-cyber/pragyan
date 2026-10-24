"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Download, FileText, Link2, Trash2, UserCheck } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, Panel, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, canReview, dateTime } from "@/lib/format";
import type { ControlAssessment, ControlPack, Person } from "@/lib/types";

const FILTERS: { key: string; label: string; test: (a: ControlAssessment) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "needs_evidence", label: "Needs evidence", test: (a) => a.state === "needs_evidence" },
  { key: "evidence_supplied", label: "Awaiting review", test: (a) => a.state === "evidence_supplied" },
  { key: "gap_identified", label: "Gap identified", test: (a) => a.state === "gap_identified" },
  { key: "reviewed", label: "Evidence reviewed", test: (a) => a.state === "reviewed" },
  { key: "not_applicable", label: "Not applicable", test: (a) => a.state === "not_applicable" },
];

const EVENT_LABEL: Record<string, string> = {
  evidence_added: "Evidence file added",
  evidence_removed: "Evidence file removed",
  link_added: "Evidence link added",
  link_removed: "Evidence link removed",
  reviewed: "Reviewed: evidence supports the requirement",
  gap_identified: "Reviewer recorded a gap",
  edited: "Applicability or notes edited",
  owner_changed: "Owner changed",
};

const BASIS_LABEL: Record<ControlAssessment["basis"], string> = {
  none: "No evidence yet",
  manual: "Manual attestation",
  automated: "Automated audit evidence",
  both: "Automated + manual",
};

function pct(n: number, d: number) {
  return d === 0 ? null : Math.round((100 * n) / d);
}

export function ControlsBoard({ assessments, packs, role, people }: { assessments: ControlAssessment[]; packs: ControlPack[]; role: string; people: Person[] }) {
  const [filter, setFilter] = useState("all");
  const used = packs.filter((p) => assessments.some((a) => a.pack_id === p.pack_id));
  const test = FILTERS.find((f) => f.key === filter)?.test ?? (() => true);
  const applicable = assessments.filter((a) => a.applicable);
  const reviewed = applicable.filter((a) => a.state === "reviewed").length;
  const withEvidence = applicable.filter((a) => a.state !== "needs_evidence").length;
  const reviewedPct = pct(reviewed, applicable.length);
  return (
    <div className="space-y-6">
      <Panel title="Coverage for this system">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-3xl font-bold text-white">{reviewedPct === null ? "n/a" : `${reviewedPct}%`}</div>
            <div className="text-xs text-slate-400">{reviewed} of {applicable.length} applicable items where a reviewer judged the evidence adequate</div>
          </div>
          <div>
            <div className="text-xl font-semibold text-slate-200">{pct(withEvidence, applicable.length) ?? "n/a"}{applicable.length ? "%" : ""}</div>
            <div className="text-xs text-slate-400">{withEvidence} of {applicable.length} have some evidence on file</div>
          </div>
          <div className="text-xs text-slate-400">
            {assessments.length - applicable.length} marked not applicable
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Share of applicable controls with reviewed evidence"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={reviewedPct ?? 0}
          className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"
        >
          <div className="h-full bg-emerald-500/70" style={{ width: `${reviewedPct ?? 0}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          <strong className="text-slate-300">What this shows:</strong> a count of checklist items by what a person or an audit has actually recorded. It measures evidence on file and
          review, not legal compliance. Two kinds of evidence are kept apart: automated results from audit runs, and manual attestation (files or links a person supplied).
        </p>
      </Panel>

      <div role="group" aria-label="Filter controls by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = assessments.filter(f.test).length;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${filter === f.key ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}
            >
              {f.label} ({n})
            </button>
          );
        })}
      </div>

      {used.map((pack) => {
        const all = assessments.filter((a) => a.pack_id === pack.pack_id);
        const rows = all.filter(test);
        const app = all.filter((a) => a.applicable);
        const done = app.filter((a) => a.state === "reviewed").length;
        return (
          <section key={pack.pack_id} aria-labelledby={`pack-${pack.pack_id}`} className="space-y-3">
            <div>
              <h2 id={`pack-${pack.pack_id}`} className="text-base font-bold text-white">{pack.title} <span className="text-xs font-normal text-slate-500">v{pack.version}</span></h2>
              <p className="text-xs text-slate-400">{done} of {app.length} applicable items have reviewed evidence ({pct(done, app.length) ?? "n/a"}{app.length ? "%" : ""}).</p>
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
            {rows.length === 0 ? (
              <p className="text-xs text-slate-500">No items in this pack match the filter.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((a) => <ControlCard key={a.id} a={a} role={role} people={people} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ControlCard({ a, role, people }: { a: ControlAssessment; role: string; people: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [title, setTitle] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [rationale, setRationale] = useState(a.applicability_rationale);
  const [note, setNote] = useState(a.owner_note);
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
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    form.set("title", title);
    await run(async () => {
      await call("POST", `ai/control-assessments/${a.id}/evidence/`, form);
      setTitle("");
      formEl.reset();
    });
  }

  async function addLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await call("POST", `ai/control-assessments/${a.id}/links/`, { title: linkTitle, url: linkUrl });
      setLinkTitle("");
      setLinkUrl("");
    });
  }

  const stateLabel = a.state === "reviewed" ? "Evidence reviewed" : undefined;
  const editable = canEdit(role);

  return (
    <li className="rounded-lg border border-white/10 bg-slate-900/40">
      <details>
        <summary className="flex flex-wrap items-center gap-3 p-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg">
          <span className="text-xs font-mono text-slate-500 w-20">{a.control_id}</span>
          <span className="text-sm font-semibold text-slate-100 flex-1 min-w-48">{c?.title ?? a.control_id}</span>
          <span className="text-xs text-slate-400">{c?.source}</span>
          <span className="text-xs text-slate-500">{a.owner_name ? `Owner: ${a.owner_name}` : "No owner"}</span>
          <StateBadge state={a.state} label={stateLabel} />
        </summary>
        <div className="p-4 pt-1 space-y-4 text-sm">
          {c && (
            <div className="space-y-2">
              <p className="text-slate-200"><span className="text-xs text-slate-500">Requirement ({c.source}): </span>{c.requirement}</p>
              <p className="text-slate-300"><span className="text-xs text-slate-500">Question: </span>{c.question}</p>
              <div>
                <span className="text-xs text-slate-500">Evidence to supply:</span>
                <ul className="list-disc ml-5 text-slate-300">{c.required_evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
              <p className="text-xs text-slate-400">{c.guidance}</p>
            </div>
          )}

          <dl className="grid sm:grid-cols-4 gap-3 text-xs">
            <div><dt className="text-slate-500">Evidence basis</dt><dd className="text-slate-200">{BASIS_LABEL[a.basis]}</dd></div>
            <div><dt className="text-slate-500">Owner</dt><dd className="text-slate-200">{a.owner_name ?? "Not assigned"}</dd></div>
            <div><dt className="text-slate-500">Last assessed</dt><dd className="text-slate-200">{a.last_assessed ? dateTime(a.last_assessed) : "Never"}</dd></div>
            <div><dt className="text-slate-500">Reviewer</dt><dd className="text-slate-200">{a.reviewer_name ?? "Not reviewed"}</dd></div>
          </dl>

          {a.applicable && a.gaps.length > 0 && (
            <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <h3 className="text-xs font-semibold text-amber-200 mb-1">Gaps</h3>
              <ul className="list-disc ml-5 text-xs text-amber-100 space-y-0.5">{a.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}

          {a.applicable && a.automated && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 space-y-1">
              <h3 className="text-xs font-semibold text-sky-200 flex items-center gap-1"><Bot className="w-3 h-3" aria-hidden="true" /> Automated audit evidence</h3>
              <p className="text-xs text-sky-100">
                From the latest completed audit{a.automated.finished_at ? ` (${dateTime(a.automated.finished_at)})` : ""}:{" "}
                {Object.entries(a.automated.counts).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")}.{" "}
                <a href={`/audits/${a.automated.run_id}`} className="underline">Open the audit</a>
              </p>
              <p className="text-[11px] text-sky-200/80">Automated results are measurements on the data audited. They support, but do not replace, a person&apos;s review.</p>
            </div>
          )}

          {(a.evidence_files.length > 0 || a.links.length > 0) && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Manual evidence on file (attested by a person, not verified by the tool)</h3>
              <ul className="space-y-1">
                {a.evidence_files.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <FileText className="w-3 h-3 text-slate-500" aria-hidden="true" />
                    <span className="font-medium text-slate-100">{e.title}</span>
                    <span>{e.uploaded_by_name ?? "unknown"} · {dateTime(e.created_at)}</span>
                    <span className="font-mono text-slate-500" title={e.sha256}>sha256 {e.sha256.slice(0, 12)}</span>
                    <a href={`/api/proxy/ai/control-evidence/${e.id}/download/`} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 underline">
                      <Download className="w-3 h-3" aria-hidden="true" /> Download
                    </a>
                    {editable && a.state !== "reviewed" && (
                      <button type="button" disabled={busy} onClick={() => run(() => call("DELETE", `ai/control-evidence/${e.id}/`))} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 underline">
                        <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </li>
                ))}
                {a.links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <Link2 className="w-3 h-3 text-slate-500" aria-hidden="true" />
                    <span className="font-medium text-slate-100">{l.title}</span>
                    <span>{l.added_by_name ?? "unknown"} · {dateTime(l.created_at)}</span>
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-cyan-300 hover:text-cyan-200 underline break-all">{l.url}</a>
                    {editable && a.state !== "reviewed" && (
                      <button type="button" disabled={busy} onClick={() => run(() => call("DELETE", `ai/control-links/${l.id}/`))} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 underline">
                        <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.reviewed_at && (
            <p className="text-xs text-slate-300 flex items-start gap-1">
              <UserCheck className="w-3 h-3 mt-0.5" aria-hidden="true" />
              <span>Reviewed by {a.reviewer_name ?? "a reviewer"} on {dateTime(a.reviewed_at)}: &quot;{a.review_comment}&quot;</span>
            </p>
          )}

          {a.applicable && editable && (
            <div className="grid md:grid-cols-2 gap-4">
              <form onSubmit={upload} className="space-y-2">
                <Field label="Evidence title" htmlFor={`t-${a.id}`}>
                  <input id={`t-${a.id}`} value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
                </Field>
                <Field label="File (up to 10 MB)" htmlFor={`f-${a.id}`}>
                  <input id={`f-${a.id}`} name="file" type="file" required className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white`} />
                </Field>
                <button type="submit" disabled={busy} className={ghostButtonClass}>Upload evidence</button>
              </form>
              <form onSubmit={addLink} className="space-y-2">
                <Field label="Link title" htmlFor={`lt-${a.id}`}>
                  <input id={`lt-${a.id}`} value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} required className={inputClass} />
                </Field>
                <Field label="Link (https://...)" htmlFor={`lu-${a.id}`} hint="For evidence that lives elsewhere, such as a policy page or ticket.">
                  <input id={`lu-${a.id}`} type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} required className={inputClass} />
                </Field>
                <button type="submit" disabled={busy} className={ghostButtonClass}>Add link</button>
              </form>
            </div>
          )}

          {a.applicable && canReview(role) && (a.state === "evidence_supplied" || a.state === "needs_evidence" || a.state === "gap_identified") && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <Field label="Review comment" htmlFor={`r-${a.id}`} hint="Required. The person who uploaded the evidence cannot review it.">
                <textarea id={`r-${a.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !comment.trim()} onClick={() => run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "reviewed", comment }))} className={buttonClass}>Evidence supports this requirement</button>
                <button type="button" disabled={busy || !comment.trim()} onClick={() => run(() => call("POST", `ai/control-assessments/${a.id}/review/`, { decision: "gap_identified", comment }))} className={ghostButtonClass}>Record a gap</button>
              </div>
            </div>
          )}

          {editable && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Owner" htmlFor={`o-${a.id}`}>
                  <select
                    id={`o-${a.id}`}
                    value={a.owner ?? ""}
                    disabled={busy}
                    onChange={(e) => run(() => call("PATCH", `ai/control-assessments/${a.id}/`, { owner: e.target.value || null }))}
                    className={inputClass}
                  >
                    <option value="">Not assigned</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Owner note" htmlFor={`n-${a.id}`} hint="Saving a note on a reviewed item clears the earlier sign-off.">
                  <div className="flex gap-2">
                    <input id={`n-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
                    <button type="button" disabled={busy || note === a.owner_note} onClick={() => run(() => call("PATCH", `ai/control-assessments/${a.id}/`, { owner_note: note }))} className={ghostButtonClass}>Save</button>
                  </div>
                </Field>
              </div>
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

          <div className="border-t border-white/10 pt-3">
            <h3 className="text-xs font-semibold text-slate-400 mb-1">Assessment history</h3>
            {a.history.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing recorded yet.</p>
            ) : (
              <ol className="space-y-1">
                {a.history.map((h) => (
                  <li key={h.id} className="text-xs text-slate-300">
                    <span className="text-slate-500">{dateTime(h.created_at)}</span> · {h.actor_name ?? "system"} · {EVENT_LABEL[h.kind] ?? h.kind}
                    {h.note ? <span className="text-slate-400">: {h.note}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        </div>
      </details>
    </li>
  );
}
