import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { ModelVersionForm } from "@/components/systems/ModelVersionForm";
import { DatasetUpload } from "@/components/systems/DatasetUpload";
import { DatasetRow } from "@/components/systems/DatasetRow";
import { SystemSettings } from "@/components/systems/SystemSettings";
import { VendorsPanel } from "@/components/systems/VendorsPanel";
import { RightsPanel } from "@/components/systems/RightsPanel";
import { StateBadge } from "@/components/ui/StateBadge";
import { ErrorState, Panel, buttonClass } from "@/components/ui/Panel";
import { ApiError, api, errorMessage, getMe, list } from "@/lib/server/api";
import { dateTime } from "@/lib/format";
import type { AISystem, AuditRun, Dataset, Dependency, ModelVersion, Person, RightsProcess } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  llm_hosted: "Hosted LLM API",
  llm_self_hosted: "Self-hosted LLM",
  server_sample: "Built-in Sample Model",
  local_bundle: "Proprietary Model (Local Bundle)",
  predictions_only: "Tabular Output Predictions",
};

export default async function SystemPage({ params }: PageProps<"/systems/[id]">) {
  const { id } = await params;
  let system: AISystem;
  let versions: ModelVersion[] = [];
  let datasets: Dataset[] = [];
  let runs: AuditRun[] = [];
  let people: Person[] = [];
  let vendors: Dependency[] = [];
  let rights: RightsProcess[] = [];
  let role = "";
  try {
    system = await api<AISystem>(`/ai/systems/${id}/`);
    [versions, datasets, runs, people, vendors, rights, role] = await Promise.all([
      list<ModelVersion>(`/ai/model-versions/?system=${id}`),
      list<Dataset>(`/ai/datasets/?system=${id}`),
      list<AuditRun>(`/ai/runs/?system=${id}`),
      api<Person[]>("/ai/members/"),
      list<Dependency>(`/ai/dependencies/?system=${id}`),
      list<RightsProcess>(`/ai/rights-processes/?system=${id}`),
      getMe().then((me) => me.active_membership?.role ?? ""),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <PageShell title="AI System Details">
        <ErrorState message={errorMessage(error)} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={system.name}
      subtitle={system.purpose}
      sample={datasets.some((d) => d.is_sample && !d.is_real_data)}
      realData={
        datasets.find((d) => d.is_real_data)
          ? { source: datasets.find((d) => d.is_real_data)!.source_note }
          : false
      }
      actions={
        <Link href={`/audits/new?system=${system.id}`} className={buttonClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New audit run</span>
        </Link>
      }
    >
      {/* System Metadata Overview */}
      <Panel title="System Architecture & Oversight">
        <dl className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Assigned Owner</dt>
            <dd className="text-zinc-100 font-semibold">{system.owner_name ?? "Not assigned"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Independent Reviewer</dt>
            <dd className="text-zinc-100 font-semibold">{system.reviewer_name ?? "Not assigned"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Active Statutory Frameworks</dt>
            <dd className="text-zinc-100 font-semibold">{system.jurisdictions.join(", ") || "None selected"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Downstream Decision Affected</dt>
            <dd className="text-zinc-200">{system.decision_affected || "Not stated"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Target Population</dt>
            <dd className="text-zinc-200">{system.intended_population || "Not stated"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Processing Category</dt>
            <dd className="text-zinc-200">{system.system_type === "llm" ? "LLM / Generative Agent" : "Tabular Classifier"}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-zinc-400 font-medium">Automated Decision Making</dt>
            <dd className="text-zinc-200">{system.automated_decision ? "Yes (Profiles individuals)" : "No"}</dd>
          </div>
        </dl>
      </Panel>

      {/* Governance Settings */}
      <Panel title="Governance Configuration">
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded p-1 -m-1">
            ▶ Modify ownership, review delegation, and regulatory jurisdiction checklists
          </summary>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <SystemSettings system={system} people={people} />
          </div>
        </details>
      </Panel>

      {/* Model Versions Registry */}
      <Panel title="Model Versions & Deployments">
        {versions.length === 0 ? (
          <p className="text-xs text-zinc-400 mb-4">No model versions registered. Add a model version to start an audit.</p>
        ) : (
          <ul className="mb-5 divide-y divide-zinc-800/80 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
            {versions.map((v) => (
              <li key={v.id} className="p-3.5 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-100 flex items-center gap-2">
                    <span>{v.version_label}</span>
                    <span className="font-mono text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300">
                      {SOURCE_LABEL[v.source]}
                    </span>
                  </div>
                  <div className="text-zinc-400 font-mono text-[11px]">
                    {v.provider ? `${v.provider} ` : ""}
                    {v.model_name ? `· ${v.model_name} ` : ""}
                    {v.prompt_version ? `· Prompt v${v.prompt_version} ` : ""}
                    {system.system_type === "tabular" ? `· Favourable: "${v.favourable_label}"` : ""}
                  </div>
                </div>
                {v.notes && <div className="text-zinc-400 text-[11px] pt-0.5">{v.notes}</div>}
              </li>
            ))}
          </ul>
        )}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded p-1 -m-1">
            + Register a new model version
          </summary>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <ModelVersionForm systemId={system.id} systemType={system.system_type} />
          </div>
        </details>
      </Panel>

      {/* Supply Chain & Vendors */}
      <Panel title="Supply Chain Dependencies & Third-Party Processors">
        <VendorsPanel systemId={system.id} vendors={vendors} role={role} />
      </Panel>

      {/* Data-Subject Rights Management */}
      <Panel title="Data Subject Rights & Grievance Redressal (DPDP & GDPR)">
        <RightsPanel
          systemId={system.id}
          processes={rights}
          people={people}
          jurisdictions={system.jurisdictions}
          automatedDecision={system.automated_decision}
          role={role}
        />
      </Panel>

      {/* Datasets Registry */}
      <Panel title="Datasets & Prompts Audit Log">
        {datasets.length === 0 ? (
          <p className="text-xs text-zinc-400 mb-4">
            No datasets uploaded. {system.system_type === "llm" ? "Upload a CSV/JSONL log of prompts and answers." : "Upload a tabular dataset with model predictions."}
          </p>
        ) : (
          <ul className="mb-5 divide-y divide-zinc-800/80 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
            {datasets.map((d) => (
              <DatasetRow key={d.id} dataset={d} />
            ))}
          </ul>
        )}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-zinc-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded p-1 -m-1">
            + Upload an evaluation dataset
          </summary>
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <DatasetUpload systemId={system.id} systemType={system.system_type} />
          </div>
        </details>
      </Panel>

      {/* Historical Audits */}
      <Panel title="Historical Audit Executions">
        {runs.length === 0 ? (
          <p className="text-xs text-zinc-400">This system has not been evaluated yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/audits/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 hover:bg-zinc-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <StateBadge state={r.status} />
                    <span className="text-xs font-semibold text-zinc-100">
                      Version: {r.model_version_label}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {dateTime(r.finished_at ?? r.created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}
