"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer, Loader2 } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          className={ghostButtonClass}
          disabled={!html}
          onClick={() => frame.current?.contentWindow?.print()}
          aria-label="Print report or save to PDF"
        >
          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Print / PDF Export</span>
        </button>
        <a
          className={ghostButtonClass}
          href={`/api/proxy/ai/runs/${runId}/report.json/`}
          download={`audit-report-${runId}.json`}
          aria-label="Download machine-readable JSON report"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Download JSON</span>
        </a>
        <a
          className={ghostButtonClass}
          href={`/api/proxy/ai/runs/${runId}/report.html/`}
          download={`audit-report-${runId}.html`}
          aria-label="Download standalone HTML report"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Download HTML</span>
        </a>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {error}
        </div>
      )}

      {!error && !html && (
        <div className="flex items-center justify-center gap-2 p-12 rounded-md border border-zinc-800 bg-zinc-900/30 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-hidden="true" />
          <span>Rendering sandboxed audit attestation report...</span>
        </div>
      )}

      {html && (
        <iframe
          ref={frame}
          title="Formal Audit Report"
          srcDoc={html}
          sandbox="allow-same-origin allow-modals"
          className="w-full h-[80vh] rounded-md border border-zinc-700 bg-white shadow-xs"
        />
      )}
    </div>
  );
}
