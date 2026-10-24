"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, canReview } from "@/lib/format";
import type { AuditReportRow } from "@/lib/types";

export function ReportActions({ report, role, myMembershipId }: { report: AuditReportRow; role: string; myMembershipId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "submit" | "approve" | "request-changes") {
    setBusy(true);
    setError(null);
    try {
      await call("POST", `ai/reports/${report.id}/${action}/`, { comment });
      setComment("");
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (report.status === "approved") {
    return <p className="text-sm text-emerald-300">Approved by {report.approved_by_name}. This version is signed off and cannot be edited. Generate a new version from a new audit if anything changes.</p>;
  }

  const involved = myMembershipId === report.generated_by || myMembershipId === report.submitted_by;
  const mayReview = canReview(role) && !involved;

  return (
    <div className="space-y-3">
      {report.status === "draft" && (
        canEdit(role) ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Submitting sends this frozen version to a reviewer. You cannot approve a report you generated or submitted.</p>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => act("submit")}>Submit for review</button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Your role is read-only, so you cannot submit this report.</p>
        )
      )}
      {report.status === "in_review" && (
        <div className="space-y-3">
          {!canReview(role) && <p className="text-xs text-slate-400">Waiting for a reviewer or administrator to approve. Your role cannot approve reports.</p>}
          {canReview(role) && involved && (
            <p className="text-xs text-amber-300">Segregation of duties: you generated or submitted this report, so a different reviewer must approve it. Sign in as another reviewer to continue.</p>
          )}
          {mayReview && (
            <>
              <Field label="Reviewer comment" htmlFor="review-comment" hint="Required when requesting changes. Shown in the timeline.">
                <textarea id="review-comment" className={inputClass} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} disabled={busy} onClick={() => act("approve")}>Approve and sign off</button>
                <button type="button" className={ghostButtonClass} disabled={busy || !comment.trim()} onClick={() => act("request-changes")}>Request changes</button>
              </div>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}