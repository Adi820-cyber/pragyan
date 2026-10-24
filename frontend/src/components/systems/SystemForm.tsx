"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  const check = "h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-500";

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="text-xs font-medium text-slate-300 mb-2">What kind of system is it?</legend>
        <div className="grid md:grid-cols-2 gap-3">
          {([
            ["llm", "LLM or generative assistant", "Chatbots, summarisers, report writers and other systems that produce text. You audit a log of prompts and answers."],
            ["tabular", "Tabular classifier", "Scores or decisions from structured data, such as credit, hiring or risk models. You audit a table of predictions."],
          ] as const).map(([value, title, hint]) => (
            <label key={value} className={`rounded-lg border p-3 cursor-pointer ${type === value ? "border-cyan-500/60 bg-cyan-500/10" : "border-white/10 hover:bg-white/5"}`}>
              <input type="radio" name="system_type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
              <span className="block text-sm font-semibold text-slate-100">{title}{value === "llm" && <span className="ml-2 text-[10px] uppercase text-cyan-300">default</span>}</span>
              <span className="block text-xs text-slate-400 mt-1">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="System name" htmlFor="name">
          <input id="name" name="name" required maxLength={200} className={inputClass} />
        </Field>
        <Field label="Decision it affects" htmlFor="decision_affected" hint="For example: whether a loan application is shortlisted.">
          <input id="decision_affected" name="decision_affected" className={inputClass} />
        </Field>
      </div>
      <Field label="Purpose" htmlFor="purpose">
        <textarea id="purpose" name="purpose" required rows={2} className={inputClass} />
      </Field>
      <Field label="Intended population" htmlFor="intended_population">
        <input id="intended_population" name="intended_population" className={inputClass} />
      </Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Owner" htmlFor="owner" hint="Accountable for acting on findings.">
          <select id="owner" name="owner" className={inputClass} defaultValue="">
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reviewer" htmlFor="reviewer" hint="Signs off on findings. Must be a different person from the owner.">
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

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-300 mb-1">Privacy checklists to assess</legend>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="j_DPDP" defaultChecked className={check} /> India DPDP
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="j_GDPR" className={check} /> EU GDPR
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-300 mb-1">About the system</legend>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="automated_decision" className={check} /> It makes or drives decisions about people
        </label>
        {type === "llm" && (
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" name="citations" className={check} /> Answers must cite their sources
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="children" className={check} /> It processes data of people under 18
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" name="sdf" className={check} /> The organisation is notified as a Significant Data Fiduciary
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Saving..." : "Register system"}
      </button>
    </form>
  );
}
