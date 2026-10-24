import type { ReactNode } from "react";
import { Database, FlaskConical } from "lucide-react";
import { Header } from "./Header";
import { getMe } from "@/lib/server/api";

export async function PageShell({
  title,
  subtitle,
  sample = false,
  realData,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  sample?: boolean;
  /** Set when the view includes real public data. `source` names where it came from. */
  realData?: { source: string } | false;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const me = await getMe();
  return (
    <>
      <Header title={title} subtitle={subtitle} me={me} />
      <main id="main" className="p-8 space-y-6 flex-1">
        {sample && (
          <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <FlaskConical className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-amber-100">
              <strong>Sample mode.</strong> This view includes synthetic demonstration data. No real people are involved and the results do
              not describe any real system.
            </p>
          </div>
        )}
        {realData && (
          <div role="note" className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
            <Database className="w-4 h-4 text-sky-300 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-sky-100">
              <strong>Real public data.</strong> {realData.source || "This view uses a public dataset."} It is used to show how an audit reads a real deployed system.
              The results describe that dataset, not your organisation, and are not a finding about any individual.
            </p>
          </div>
        )}
        {actions && <div className="flex justify-end gap-2">{actions}</div>}
        {children}
      </main>
    </>
  );
}
