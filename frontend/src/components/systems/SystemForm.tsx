"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";
import type { Person } from "@/lib/types";

export function SystemForm({ people }: { people: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"llm" | "tabular">("llm");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const jurisdictions = ["DPDP", "GDPR"].filter((j) => form.get(`j_${j}`) === "on");
    setBusy(true);
    setError(null);
    try {
      const created = await call<{ id: string }>("POST", "ai/systems/", {
        name: form.get("name"),
        system_type: type,
        requires_citations: type === "llm" && form.get("citations") === "on",
        purpose: form.get("purpose"),
        decision_affected: form.get("decision_affected") || "",
        intended_population: form.get("intended_population") || "",
        owner: form.get("owner") || null,
        reviewer: form.get("reviewer") || null,
        jurisdictions,
        automated_decision: form.get("automated_decision") === "on",
        processes_children_data: form.get("children") === "on",
        is_significant_data_fiduciary: form.get("sdf") === "on",
      });
      router.push(`/systems/${created.id}`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const check = "h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-zinc-100 cursor-pointer";

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="text-xs font-medium text-zinc-300 mb-2.5">Architectural System Category</legend>
        <div className="grid md:grid-cols-2 gap-3">
          {([
            [
              "llm",
              "LLM / Generative Assistant",
              "Chatbots, summarisers, agent pipelines, or document Q&A. Evaluates prompt and completion logs.",
            ],
            [
              "tabular",
              "Tabular Risk / Decision Classifier",
              "Structured numerical models, credit scoring, hiring screeners, or fraud filters. Evaluates predictions.",
            ],
          ] as const).map(([value, title, hint]) => (
            <label
              key={value}
              className={`rounded-md border p-3.5 cursor-pointer transition-colors ${
                type === value
                  ? "border-zinc-400 bg-zinc-800 text-zinc-100 font-medium shadow-xs"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/30"
              }`}
            >
              <input
                type="radio"
                name="system_type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100">{title}</span>
                {value === "llm" && (
                  <span className="text-[10px] font-mono uppercase bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-300">
                    Standard
                  </span>
                )}
              </span>
              <span className="block text-xs text-zinc-400 mt-1.5 leading-relaxed">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="System Identifier Name" htmlFor="name">
          <input
            id="name"
            name="name"
            required
            maxLength={200}
            placeholder="e.g. Applicant Screening LLM"
            className={inputClass}
          />
        </Field>
        <Field
          label="Downstream Decision Affected"
          htmlFor="decision_affected"
          hint="Operational impact (e.g. loan pre-approval, job shortlisting)."
        >
          <input
            id="decision_affected"
            name="decision_affected"
            placeholder="e.g. Job candidate shortlisting"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Architectural Purpose & Objectives" htmlFor="purpose">
        <textarea
          id="purpose"
          name="purpose"
          required
          rows={2}
          placeholder="Describe intended deployment context, business function, and data flow..."
          className={inputClass}
        />
      </Field>

      <Field
        label="Intended Data Subjects / Population"
        htmlFor="intended_population"
        hint="Target demographic or customer group evaluated."
      >
        <input
          id="intended_population"
          name="intended_population"
          placeholder="e.g. External job applicants in India / EMEA"
          className={inputClass}
        />
      </Field>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="System Owner (Remediation Accountable)" htmlFor="owner">
          <select id="owner" name="owner" className={inputClass} defaultValue="">
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Independent Reviewer (Audit Sign-off)"
          htmlFor="reviewer"
          hint="Segregation of duties: Reviewer must be different from owner."
        >
          <select id="reviewer" name="reviewer" className={inputClass} defaultValue="">
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-2 pt-1 border-t border-zinc-800">
        <legend className="text-xs font-medium text-zinc-300 mb-2">Statutory Regulatory Checklists</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="j_DPDP" defaultChecked className={check} />
            <span>India Digital Personal Data Protection (DPDP) Act 2023</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="j_GDPR" className={check} />
            <span>EU General Data Protection Regulation (GDPR)</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2 pt-1 border-t border-zinc-800">
        <legend className="text-xs font-medium text-zinc-300 mb-2">Automated Processing & Risk Factors</legend>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="automated_decision" className={check} />
            <span>Produces automated decisions or profiles individuals</span>
          </label>
          {type === "llm" && (
            <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input type="checkbox" name="citations" className={check} />
              <span>Enforce mandatory citation of source context</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="children" className={check} />
            <span>Processes personal data of minors (&lt; 18 years)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="sdf" className={check} />
            <span>Organization designated as Significant Data Fiduciary (SDF)</span>
          </label>
        </div>
      </fieldset>

      {error && (
        <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="pt-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Registering system...</span>
            </>
          ) : (
            <span>Register AI System</span>
          )}
        </button>
      </div>
    </form>
  );
}
