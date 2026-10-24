import { StateBadge } from "@/components/ui/StateBadge";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/format";
import type { Category, CoverageStatus, ResultState } from "@/lib/types";

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
  coverage: Partial<Record<Category, { status: CoverageStatus; counts: Partial<Record<ResultState, number>> }>> | null;
}) {
  if (!coverage) {
    return (
      <div className="rounded-md border border-zinc-800/80 bg-zinc-900/20 px-3.5 py-2.5 text-xs text-zinc-400">
        No completed audit yet. Run an audit to verify compliance across fairness, drift, explainability, and privacy.
      </div>
    );
  }

  const activeCategories = CATEGORY_ORDER.filter((key) => coverage[key]);

  if (activeCategories.length === 0) {
    return (
      <p className="text-xs text-zinc-400">No category evaluation recorded for this system.</p>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5" aria-label="Coverage by audit category">
      {activeCategories.map((key) => {
        const item = coverage[key]!;
        return (
          <li key={key} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-200 mb-2 tracking-tight">{CATEGORY_LABEL[key]}</div>
              <StateBadge
                state={item.status}
                label={
                  item.status === "assessed"
                    ? "Assessed (No alert)"
                    : item.status === "review_required"
                    ? "Review required"
                    : undefined
                }
              />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2.5 tabular-nums">
              {Object.entries(item.counts)
                .map(([state, n]) => `${n} ${COUNT_LABEL[state] ?? state}`)
                .join(" · ") || "No metrics recorded"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
