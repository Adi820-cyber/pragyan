"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";
import type { AISystem, Person } from "@/lib/types";

export function SystemSettings({ system, people }: { system: AISystem; people: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await call("PATCH", `ai/systems/${system.id}/`, {
        owner: f.get("owner") || null,
        reviewer: f.get("reviewer") || null,
        jurisdictions: ["DPDP", "GDPR"].filter((j) => f.get(`j_${j}`) === "on"),
        automated_decision: f.get("automated_decision") === "on",
        processes_children_data: f.get("children") === "on",
        is_significant_data_fiduciary: f.get("sdf") === "on",
        requires_citations: system.system_type === "llm" && f.get("citations") === "on",
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const check = "h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-500";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Owner" htmlFor="s_owner">
          <select id="s_owner" name="owner" defaultValue={system.owner ?? ""} className={inputClass}>
            <option value="">Not assigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Reviewer" htmlFor="s_reviewer" hint="Must be a different person from the owner.">
          <select id="s_reviewer" name="reviewer" defaultValue={system.reviewer ?? ""} className={inputClass}>
            <option value="">Not assigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="j_DPDP" defaultChecked={system.jurisdictions.includes("DPDP")} className={check} /> India DPDP checklist</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="j_GDPR" defaultChecked={system.jurisdictions.includes("GDPR")} className={check} /> EU GDPR checklist</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="automated_decision" defaultChecked={system.automated_decision} className={check} /> Makes or drives decisions about people</label>
        {system.system_type === "llm" && (
          <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="citations" defaultChecked={system.requires_citations} className={check} /> Answers must cite their sources</label>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="children" defaultChecked={system.processes_children_data} className={check} /> Processes data of under-18s</label>
        <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="sdf" defaultChecked={system.is_significant_data_fiduciary} className={check} /> Notified Significant Data Fiduciary</label>
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Saving..." : "Save"}</button>
        {saved && <span role="status" className="text-xs text-emerald-300">Saved. The privacy checklist was updated.</span>}
      </div>
    </form>
  );
}
