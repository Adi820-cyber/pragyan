import type { ReactNode } from "react";
import { Database, Info } from "lucide-react";
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
    <div className="flex-1 flex flex-col min-w-0">
      <Header title={title} subtitle={subtitle} me={me} />
      <main id="main" className="p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto min-w-0">
        {sample && (
          <div
            role="note"
            className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
          >
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="leading-relaxed">
              <strong className="font-semibold text-amber-100">Sample evaluation dataset.</strong> This view includes synthetic demo data. Results do not describe production systems or real individuals.
            </div>
          </div>
        )}
        {realData && (
          <div
            role="note"
            className="flex items-start gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-xs text-blue-200"
          >
            <Database className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="leading-relaxed">
              <strong className="font-semibold text-blue-100">Public reference dataset.</strong> {realData.source || "This view uses a public dataset."} Used strictly to demonstrate audit evaluation on real data structures.
            </div>
          </div>
        )}
        {actions && <div className="flex items-center justify-end gap-2.5">{actions}</div>}
        {children}
      </main>
    </div>
  );
}
