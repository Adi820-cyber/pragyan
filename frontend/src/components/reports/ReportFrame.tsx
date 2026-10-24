"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { callText, errText } from "@/lib/client/api";
import { ghostButtonClass } from "@/components/ui/Panel";

export function ReportFrame({ runId }: { runId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    callText(`ai/runs/${runId}/report.html/`)
      .then((text) => !cancelled && setHtml(text))
      .catch((e) => !cancelled && setError(errText(e)));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className={ghostButtonClass} disabled={!html} onClick={() => frame.current?.contentWindow?.print()}>
          <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
        </button>
        <a className={ghostButtonClass} href={`/api/proxy/ai/runs/${runId}/report.json/`} download={`audit-report-${runId}.json`}>
          <Download className="w-4 h-4" aria-hidden="true" /> Download JSON
        </a>
        <a className={ghostButtonClass} href={`/api/proxy/ai/runs/${runId}/report.html/`} download={`audit-report-${runId}.html`}>
          <Download className="w-4 h-4" aria-hidden="true" /> Download HTML
        </a>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {!error && !html && <p className="text-sm text-slate-400" role="status">Loading report...</p>}
      {html && (
        <iframe
          ref={frame}
          title="Audit report"
          srcDoc={html}
          // No scripts can run in the report. allow-same-origin only lets the page call print().
          sandbox="allow-same-origin allow-modals"
          className="w-full h-[80vh] rounded-xl border border-white/10 bg-white"
        />
      )}
    </div>
  );
}
