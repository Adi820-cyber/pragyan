import { PageShell } from "@/components/layout/PageShell";
import { NewAuditWizard } from "@/components/audit/NewAuditWizard";
import { ErrorState } from "@/components/ui/Panel";
import { WhatThisShows } from "@/components/ui/WhatThisShows";
import { errorMessage, list } from "@/lib/server/api";
import type { AISystem, Dataset, ModelVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewAuditPage({ searchParams }: PageProps<"/audits/new">) {
  const params = await searchParams;
  const initial = typeof params.system === "string" ? params.system : undefined;
  let systems: AISystem[] = [];
  let versions: ModelVersion[] = [];
  let datasets: Dataset[] = [];
  let failure: string | null = null;
  try {
    [systems, versions, datasets] = await Promise.all([
      list<AISystem>("/ai/systems/"),
      list<ModelVersion>("/ai/model-versions/"),
      list<Dataset>("/ai/datasets/"),
    ]);
  } catch (error) {
    failure = errorMessage(error);
  }

  return (
    <PageShell title="New audit" subtitle="Pick the inputs, say what the columns mean, and review the policy before anything runs" sample={datasets.some((d) => d.is_sample && !d.is_real_data)} realData={datasets.find((d) => d.is_real_data) ? { source: datasets.find((d) => d.is_real_data)!.source_note } : false}>
      <WhatThisShows>
        A short guided set-up for one audit: choose the system, model version and data, tell Reskure which columns mean what, check what will run, and set the policy limits. Nothing runs until the last step.
      </WhatThisShows>
      {failure ? (
        <ErrorState message={failure} />
      ) : (
        <NewAuditWizard systems={systems.filter((s) => s.status !== "ARCHIVED")} versions={versions} datasets={datasets} initialSystem={initial} />
      )}
    </PageShell>
  );
}
