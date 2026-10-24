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
  llm_hosted: "Hosted LLM",
  llm_self_hosted: "Self-hosted LLM",
  server_sample: "Built-in sample model",
  local_bundle: "Own model (local tool)",
  predictions_only: "Predictions only",
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
      <PageShell title="AI System">
        <ErrorState message={errorMessage(error)} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={system.name}
      subtitle={system.purpose}
      sample={datasets.some((d) => d.is_sample && !d.is_real_data)}
      realData={datasets.find((d) => d.is_real_data) ? { source: datasets.find((d) => d.is_real_data)!.source_note } : false}
      actions={
        <Link href={`/audits/new?system=${system.id}`} className={buttonClass}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New audit
        </Link>
      }
    >
      <Panel title="About this system">
        <dl className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Owner</dt>
            <dd className="text-slate-100">{system.owner_name ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Reviewer</dt>
            <dd className="text-slate-100">{system.reviewer_name ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Privacy checklists</dt>
            <dd className="text-slate-100">{system.jurisdictions.join(", ") || "None selected"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Decision affected</dt>
            <dd className="text-slate-100">{system.decision_affected || "Not stated"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Intended population</dt>
            <dd className="text-slate-100">{system.intended_population || "Not stated"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Type</dt>
            <dd className="text-slate-100">{system.system_type === "llm" ? "LLM / generative system" : "Tabular classifier"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Makes decisions about people</dt>
            <dd className="text-slate-100">{system.automated_decision ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Settings">
        <details>
          <summary className="cursor-pointer text-sm text-cyan-300 hover:text-cyan-200 mb-3">Edit owner, reviewer and checklists</summary>
          <SystemSettings system={system} people={people} />
        </details>
      </Panel>

      <Panel title="Model versions">
        {versions.length === 0 ? (
          <p className="text-xs text-slate-400 mb-4">No model versions yet. Add one to start an audit.</p>
        ) : (
          <ul className="mb-5 space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-sm">
                <span className="font-semibold text-slate-100">{v.version_label}</span>
                <span className="text-xs text-slate-400"> · {SOURCE_LABEL[v.source]}{v.provider ? ` · ${v.provider}` : ""}{v.model_name ? ` / ${v.model_name}` : ""}{v.prompt_version ? ` · prompt ${v.prompt_version}` : ""}{system.system_type === "tabular" ? ` · favourable value "${v.favourable_label}"` : ""}</span>
                {v.notes && <div className="text-xs text-slate-500">{v.notes}</div>}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm text-cyan-300 hover:text-cyan-200 mb-3">Add a model version</summary>
          <ModelVersionForm systemId={system.id} systemType={system.system_type} />
        </details>
      </Panel>

      <Panel title="Vendors and dependencies">
        <VendorsPanel systemId={system.id} vendors={vendors} role={role} />
      </Panel>

      <Panel title="Data-subject rights">
        <RightsPanel
          systemId={system.id}
          processes={rights}
          people={people}
          jurisdictions={system.jurisdictions}
          automatedDecision={system.automated_decision}
          role={role}
        />
      </Panel>

      <Panel title="Datasets">
        {datasets.length === 0 ? (
          <p className="text-xs text-slate-400 mb-4">No datasets yet. {system.system_type === "llm" ? "Upload a log of prompts and answers as CSV or JSONL." : "Upload a reference dataset with a column of model predictions."}</p>
        ) : (
          <ul className="mb-5 space-y-2">
            {datasets.map((d) => (
              <DatasetRow key={d.id} dataset={d} />
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm text-cyan-300 hover:text-cyan-200 mb-3">Upload a dataset</summary>
          <DatasetUpload systemId={system.id} systemType={system.system_type} />
        </details>
      </Panel>

      <Panel title="Audit history">
        {runs.length === 0 ? (
          <p className="text-xs text-slate-400">This system has not been audited yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/audits/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/40 p-3 hover:border-cyan-500/40">
                  <StateBadge state={r.status} />
                  <span className="text-sm text-slate-100">Model {r.model_version_label}</span>
                  <span className="text-xs text-slate-400">{dateTime(r.finished_at ?? r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageShell>
  );
}
