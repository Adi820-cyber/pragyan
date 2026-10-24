import { Sidebar } from "@/components/layout/Sidebar";
import { getMe } from "@/lib/server/api";
import { ROLE_LABEL } from "@/lib/format";
import { ErrorState } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/server/api";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let tenantName = "";
  let role = "";
  let failure: string | null = null;
  try {
    const me = await getMe();
    tenantName = me.active_membership?.tenant_name ?? "No organisation selected";
    role = me.active_membership?.role ?? "";
    if (!me.active_membership) {
      failure = "Your account has no active membership for the selected organisation. Sign out and back in.";
    }
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <div className="flex min-h-dvh bg-zinc-950 text-zinc-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-zinc-900 focus:text-zinc-100 focus:px-4 focus:py-2 focus:rounded-md focus:border focus:border-zinc-700 focus:ring-2 focus:ring-zinc-400"
      >
        Skip to content
      </a>
      <Sidebar tenantName={tenantName} roleLabel={ROLE_LABEL[role] ?? role} />
      <div className="flex-1 flex flex-col min-w-0">
        {failure ? (
          <main id="main" className="p-6 md:p-8 max-w-7xl w-full mx-auto">
            <ErrorState message={failure} />
          </main>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
