import { StateBadge } from "@/components/ui/StateBadge";
import { CATEGORY_LABEL } from "@/lib/format";
import type { Category, CoverageStatus, ResultState } from "@/lib/types";

const ORDER: Category[] = ["bias", "drift", "explainability", "privacy"];

const COUNT_LABEL: Record<string, string> = {
  review_required: "to review",
  no_alert: "no alert",
  insufficient_evidence: "insufficient evidence",
  not_applicable: "not assessed",
  error: "errors",
};

export function CoverageStrip({
  coverage,
}: {
  coverage: Record<Category, { status: CoverageStatus; counts: Partial<Record<ResultState, number>> }> | null;
}) {
  if (!coverage) {
    return <p className="text-xs text-slate-400">No completed audit yet. Nothing has been assessed.</p>;
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Coverage by audit category">
      {ORDER.map((key) => {
        const item = coverage[key];
        return (
          <li key={key} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
            <div className="text-xs font-semibold text-slate-200 mb-2">{CATEGORY_LABEL[key]}</div>
            <StateBadge state={item.status} label={item.status === "assessed" ? "Assessed: no alert" : item.status === "review_required" ? "Assessed: review required" : undefined} />
            <p className="text-[11px] text-slate-400 mt-2">
              {Object.entries(item.counts)
                .map(([state, n]) => `${n} ${COUNT_LABEL[state] ?? state}`)
                .join(" · ") || "No results"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
