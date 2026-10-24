"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CoverageStrip } from "./CoverageStrip";
import { BiasView } from "./BiasView";
import { DriftView } from "./DriftView";
import { ExplainView } from "./ExplainView";
import { PrivacyView } from "./PrivacyView";
import { StateBadge } from "@/components/ui/StateBadge";
import { CATEGORY_LABEL } from "@/lib/format";
import type { Category, CheckResult, CoverageStatus, Finding, ResultState } from "@/lib/types";

type Coverage = Record<Category, { status: CoverageStatus; counts: Partial<Record<ResultState, number>> }>;

const TABS = ["summary", "bias", "drift", "explainability", "privacy"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { summary: "Summary", ...CATEGORY_LABEL } as Record<Tab, string>;

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

  const notAssessed = results.filter((r) => r.state === "not_applicable" || r.state === "insufficient_evidence" || r.state === "error");
  const headline = results.filter(
    (r) => r.state === "review_required" && ["demographic_parity", "selection_rate_ratio", "equalized_odds", "proxy_screen", "schema", "prediction_distribution", "performance", "minimisation"].includes(r.check_key),
  );

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Audit results" className="flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t, i) => {
          const status = t === "summary" ? null : coverage[t as Category]?.status;
          return (
            <button
              key={t}
              ref={(el) => { refs.current[t] = el; }}
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => onKey(e, i)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-t ${tab === t ? "border-cyan-400 text-cyan-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}
            >
              {TAB_LABEL[t]}
              {status === "review_required" && <span className="ml-2 text-amber-300" aria-label="needs review">●</span>}
              {status === "error" && <span className="ml-2 text-rose-300" aria-label="error">●</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="focus:outline-none">
        {tab === "summary" && (
          <div className="space-y-6">
            <CoverageStrip coverage={coverage} />

            <section aria-labelledby="head-h" className="space-y-2">
              <h2 id="head-h" className="text-sm font-bold text-white">What needs a look</h2>
              {headline.length === 0 ? (
                <p className="text-sm text-slate-300">No headline result crossed the review thresholds you set. That is a statement about the checks that ran, not about the ones listed under &quot;Not assessed&quot; below.</p>
              ) : (
                <ul className="space-y-2">
                  {headline.map((r) => (
                    <li key={r.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-slate-100">
                      <span className="text-[11px] uppercase tracking-wide text-amber-300 mr-2">{CATEGORY_LABEL[r.category]}</span>
                      {r.summary}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="find-h" className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 id="find-h" className="text-sm font-bold text-white">Findings raised by this run</h2>
                <Link href="/findings" className="text-xs text-cyan-300 hover:text-cyan-200 underline">Open findings board</Link>
              </div>
              {findings.length === 0 ? (
                <p className="text-sm text-slate-300">This run raised no findings.</p>
              ) : (
                <ul className="space-y-2">
                  {findings.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3">
                      <StateBadge state={f.severity} />
                      <span className="text-sm text-slate-100 flex-1 min-w-48">{f.title}</span>
                      <span className="text-xs text-slate-400">{f.owner_name ?? "No owner"}</span>
                      <StateBadge state={f.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="na-h" className="space-y-2">
              <h2 id="na-h" className="text-sm font-bold text-white">Not assessed or inconclusive</h2>
              {notAssessed.length === 0 ? (
                <p className="text-sm text-slate-300">Every check in this run produced a result.</p>
              ) : (
                <ul className="space-y-1.5">
                  {notAssessed.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                      <StateBadge state={r.state} />
                      <span className="text-slate-500">{CATEGORY_LABEL[r.category]}{r.subject ? `: ${r.subject}` : ""}</span>
                      <span>{r.summary}</span>
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
        {tab === "privacy" && <PrivacyView results={by("privacy")} systemId={systemId} />}
      </div>
    </div>
  );
}
