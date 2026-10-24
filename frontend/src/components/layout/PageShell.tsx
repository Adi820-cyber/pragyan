import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Header } from "./Header";
import { getMe } from "@/lib/server/api";

export async function PageShell({
  title,
  subtitle,
  sample = false,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  sample?: boolean;
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
        {actions && <div className="flex justify-end gap-2">{actions}</div>}
        {children}
      </main>
    </>
  );
}
