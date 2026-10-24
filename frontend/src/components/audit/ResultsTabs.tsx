"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CoverageStrip } from "./CoverageStrip";
import { BiasView } from "./BiasView";
import { DriftView } from "./DriftView";
import { ExplainView } from "./ExplainView";
import { PrivacyView } from "./PrivacyView";
import { GroundingView } from "./GroundingView";
import { GovernanceView } from "./GovernanceView";
import { StateBadge } from "@/components/ui/StateBadge";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/format";
import type { Category, CheckResult, CoverageStatus, Finding, ResultState } from "@/lib/types";

type Coverage = Partial<Record<Category, { status: CoverageStatus; counts: Partial<Record<ResultState, number>> }>>;

type Tab = "summary" | Category;
const TAB_LABEL: Record<string, string> = { summary: "Overview & Summary", ...CATEGORY_LABEL };

export function ResultsTabs({
  systemId,
  results,
  findings,
  coverage,
}: {
  systemId: string;
  results: CheckResult[];
  findings: Finding[];
  coverage: Coverage;
}) {
  const TABS: Tab[] = ["summary", ...CATEGORY_ORDER.filter((k) => coverage[k])];
  const [tab, setTab] = useState<Tab>("summary");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const by = (c: Category) => results.filter((r) => r.category === c);

  function onKey(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else return;
    event.preventDefault();
    setTab(TABS[next]);
    refs.current[TABS[next]]?.focus();
  }

  const notAssessed = results.filter(
    (r) => r.state === "not_applicable" || r.state === "insufficient_evidence" || r.state === "error"
  );
  const headline = results.filter(
    (r) =>
      r.state === "review_required" &&
      ([
        "demographic_parity",
        "selection_rate_ratio",
        "equalized_odds",
        "proxy_screen",
        "schema",
        "prediction_distribution",
        "performance",
        "minimisation",
        "refusal_gap",
        "response_length_gap",
        "score_gap",
        "groundedness",
        "unsupported_numbers",
        "citations",
        "personal_data_in_text",
        "vendor_dependency",
        "vendor_register",
        "vendor_concentration",
        "human_oversight",
      ].includes(r.check_key) ||
        (r.check_key === "data_rights" && r.metric === "rights_procedure"))
  );

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Audit category tabs"
        className="flex flex-wrap gap-1 border-b border-zinc-800"
      >
        {TABS.map((t, i) => {
          const status = t === "summary" ? null : coverage[t]?.status;
          const isActive = tab === t;
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[t] = el;
              }}
              role="tab"
              id={`tab-${t}`}
              aria-selected={isActive}
              aria-controls={`panel-${t}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => onKey(e, i)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-t-md cursor-pointer ${
                isActive
                  ? "border-zinc-100 text-zinc-100 font-semibold"
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              <span>{TAB_LABEL[t]}</span>
              {status === "review_required" && (
                <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-amber-400 align-middle" aria-label="Review required" />
              )}
              {status === "error" && (
                <span className="ml-1.5 w-1.5 h-1.5 inline-block rounded-full bg-red-400 align-middle" aria-label="Error state" />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-md"
      >
        {tab === "summary" && (
          <div className="space-y-6">
            <CoverageStrip coverage={coverage} />

            <section aria-labelledby="head-h" className="space-y-2.5">
              <h2 id="head-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Items Requiring Review
              </h2>
              {headline.length === 0 ? (
                <div className="p-4 rounded-md border border-zinc-800 bg-zinc-900/30 text-xs text-zinc-300">
                  No evaluation result crossed configured review thresholds. (Evaluates solely checks that ran against defined reference criteria).
                </div>
              ) : (
                <ul className="space-y-2">
                  {headline.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 flex items-start gap-3"
                    >
                      <span className="font-semibold text-amber-100 uppercase tracking-wider text-[10px] shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/80">
                        {CATEGORY_LABEL[r.category]}
                      </span>
                      <span className="leading-relaxed">{r.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="find-h" className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 id="find-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Findings Raised in this Run ({findings.length})
                </h2>
                <Link
                  href="/findings"
                  className="text-xs font-medium text-zinc-300 hover:text-white underline underline-offset-4 decoration-zinc-600 hover:decoration-zinc-300"
                >
                  Manage all findings →
                </Link>
              </div>
              {findings.length === 0 ? (
                <div className="p-4 rounded-md border border-zinc-800 bg-zinc-900/30 text-xs text-zinc-400">
                  No automated findings or governance gaps flagged in this audit execution.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
                  {findings.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-zinc-800/30 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <StateBadge state={f.severity} />
                        <span className="text-xs font-medium text-zinc-100 truncate">{f.title}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-zinc-400">{f.owner_name ?? "Unassigned"}</span>
                        <StateBadge state={f.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="na-h" className="space-y-2">
              <h2 id="na-h" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Inconclusive or Not Applicable Checks
              </h2>
              {notAssessed.length === 0 ? (
                <p className="text-xs text-zinc-400">Every check in this run produced a definitive evaluation result.</p>
              ) : (
                <ul className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-md bg-zinc-900/20">
                  {notAssessed.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 p-2.5 text-xs text-zinc-300">
                      <StateBadge state={r.state} />
                      <span className="text-zinc-500 font-medium">
                        {CATEGORY_LABEL[r.category]}
                        {r.subject ? `: ${r.subject}` : ""}
                      </span>
                      <span className="truncate">{r.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        {tab === "bias" && <BiasView results={by("bias")} />}
        {tab === "drift" && <DriftView results={by("drift")} />}
        {tab === "explainability" && <ExplainView results={by("explainability")} />}
        {tab === "grounding" && <GroundingView results={by("grounding")} />}
        {tab === "governance" && <GovernanceView results={by("governance")} systemId={systemId} />}
        {tab === "privacy" && <PrivacyView results={by("privacy")} systemId={systemId} />}
      </div>
    </div>
  );
}
