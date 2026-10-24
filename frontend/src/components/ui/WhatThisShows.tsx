import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** One or two plain-English sentences at the top of a page or tab: what the reader is looking at and why it matters. */
export function WhatThisShows({ children }: { children: ReactNode }) {
  return (
    <aside role="note" aria-label="What this shows" className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
      <Info className="w-4 h-4 text-cyan-300 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-xs text-slate-200">
        <strong className="text-cyan-200">What this shows. </strong>
        {children}
      </p>
    </aside>
  );
}
