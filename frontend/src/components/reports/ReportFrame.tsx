"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { callText, errText } from "@/lib/client/api";
import { ghostButtonClass } from "@/components/ui/Panel";

export function ReportFrame({ reportId, version }: { reportId: string; version: number }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    callText(`ai/reports/${reportId}/html/`)
      .then((text) => !cancelled && setHtml(text))
      .catch((e) => !cancelled && setError(errText(e)));
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const base = `/api/proxy/ai/reports/${reportId}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className={ghostButtonClass} disabled={!html} onClick={() => frame.current?.contentWindow?.print()}>
          <Printer className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
        </button>
        <a className={ghostButtonClass} href={`${base}/html/?download=1`} download={`audit-report-v${version}.html`}>
          <Download className="w-4 h-4" aria-hidden="true" /> Download HTML
        </a>
        <a className={ghostButtonClass} href={`${base}/markdown/`} download={`audit-report-v${version}.md`}>
          <Download className="w-4 h-4" aria-hidden="true" /> Download Markdown
        </a>
        <a className={ghostButtonClass} href={`${base}/html/`} target="_blank" rel="noopener noreferrer">
          Open print view
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