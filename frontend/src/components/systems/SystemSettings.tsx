"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
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

  const check = "h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-zinc-100 cursor-pointer";

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="System Owner" htmlFor="s_owner">
          <select id="s_owner" name="owner" defaultValue={system.owner ?? ""} className={inputClass}>
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Independent Reviewer" htmlFor="s_reviewer" hint="Must be different from system owner.">
          <select id="s_reviewer" name="reviewer" defaultValue={system.reviewer ?? ""} className={inputClass}>
            <option value="">Not assigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-2 pt-1 border-t border-zinc-800">
        <span className="block text-xs font-medium text-zinc-300">Regulatory Frameworks & Risk Settings</span>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="j_DPDP" defaultChecked={system.jurisdictions.includes("DPDP")} className={check} />
            <span>India DPDP Act checklist</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="j_GDPR" defaultChecked={system.jurisdictions.includes("GDPR")} className={check} />
            <span>EU GDPR checklist</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="automated_decision" defaultChecked={system.automated_decision} className={check} />
            <span>Produces automated decisions about people</span>
          </label>
          {system.system_type === "llm" && (
            <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input type="checkbox" name="citations" defaultChecked={system.requires_citations} className={check} />
              <span>Answers must cite verified sources</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="children" defaultChecked={system.processes_children_data} className={check} />
            <span>Processes minor (&lt;18) data</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
            <input type="checkbox" name="sdf" defaultChecked={system.is_significant_data_fiduciary} className={check} />
            <span>Significant Data Fiduciary (SDF) status</span>
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          <span>{busy ? "Saving settings..." : "Update Settings"}</span>
        </button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Settings updated</span>
          </span>
        )}
      </div>
    </form>
  );
}
