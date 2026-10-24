"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, dateOnly } from "@/lib/format";
import type { Dependency } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  model_provider: "Model / LLM provider",
  cloud: "Cloud or hosting",
  data_labelling: "Data labelling",
  analytics: "Analytics or monitoring",
  other: "Other",
};

export function VendorsPanel({ systemId, vendors, role }: { systemId: string; vendors: Dependency[]; role: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Dependency | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(role);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const yes = (k: string) => f.get(k) === "on";
    const body = {
      system: systemId,
      name: f.get("name"),
      service: f.get("service") || "",
      role: f.get("role"),
      personal_data_shared: yes("personal_data_shared"),
      region: f.get("region") || "",
      outside_india: yes("outside_india"),
      outside_eea: yes("outside_eea"),
      transfer_mechanism: f.get("transfer_mechanism") || "",
      contract_in_place: yes("contract_in_place"),
      trains_on_customer_data: f.get("trains_on_customer_data"),
      retention_days: f.get("retention_days") ? Number(f.get("retention_days")) : null,
      subprocessors_listed: yes("subprocessors_listed"),
      exit_plan: yes("exit_plan"),
      criticality: f.get("criticality"),
      last_reviewed: f.get("last_reviewed") || null,
      data_categories: String(f.get("data_categories") || "").split(",").map((s) => s.trim()).filter(Boolean),
    };
    setBusy(true);
    setError(null);
    try {
      if (editing && editing !== "new") await call("PATCH", `ai/dependencies/${editing.id}/`, body);
      else await call("POST", "ai/dependencies/", body);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: Dependency) {
    if (!window.confirm(`Remove ${v.name} from the register? Past audits keep their own copy.`)) return;
    try {
      await call("DELETE", `ai/dependencies/${v.id}/`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    }
  }

  const current = editing && editing !== "new" ? editing : null;
  const check = "h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-500";

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        List every vendor, cloud service or model provider that touches this system. The audit checks contracts, data flows, training use, retention, transfers and exit options.
        These are your declarations; the tool cannot verify them.
      </p>
      {vendors.length === 0 ? (
        <p className="text-sm text-amber-200">No vendors recorded yet. An audit will report this as a gap.</p>
      ) : (
        <ul className="space-y-2">
          {vendors.map((v) => (
            <li key={v.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <div className="text-sm font-semibold text-slate-100">{v.name}</div>
                <div className="text-xs text-slate-400">
                  {ROLE_LABEL[v.role]}{v.service ? ` · ${v.service}` : ""}{v.region ? ` · ${v.region}` : ""} · last reviewed {dateOnly(v.last_reviewed)}
                </div>
              </div>
              <StateBadge state={v.contract_in_place ? "no_alert" : "review_required"} label={v.contract_in_place ? "Contract on record" : "No contract on record"} />
              {v.personal_data_shared && <StateBadge state="insufficient_evidence" label="Personal data shared" />}
              {editable && (
                <span className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setEditing(v)} className="text-cyan-300 hover:text-cyan-200 underline">Edit</button>
                  <button type="button" onClick={() => remove(v)} className="text-rose-300 hover:text-rose-200 underline">Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && !editing && (
        <button type="button" onClick={() => setEditing("new")} className={ghostButtonClass}>Add a vendor</button>
      )}
      {editing && (
        <form key={current?.id ?? "new"} onSubmit={save} className="rounded-lg border border-white/10 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white">{current ? `Edit ${current.name}` : "Add a vendor"}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Name" htmlFor="v_name"><input id="v_name" name="name" required defaultValue={current?.name} className={inputClass} /></Field>
            <Field label="Service" htmlFor="v_service"><input id="v_service" name="service" defaultValue={current?.service} className={inputClass} /></Field>
            <Field label="Role" htmlFor="v_role">
              <select id="v_role" name="role" defaultValue={current?.role ?? "model_provider"} className={inputClass}>
                {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Where data is processed" htmlFor="v_region"><input id="v_region" name="region" defaultValue={current?.region} className={inputClass} /></Field>
            <Field label="Trains on your data?" htmlFor="v_train">
              <select id="v_train" name="trains_on_customer_data" defaultValue={current?.trains_on_customer_data ?? "unknown"} className={inputClass}>
                <option value="unknown">Unknown</option><option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Retention at the vendor (days)" htmlFor="v_ret"><input id="v_ret" name="retention_days" type="number" min={0} defaultValue={current?.retention_days ?? ""} className={inputClass} /></Field>
            <Field label="Criticality" htmlFor="v_crit">
              <select id="v_crit" name="criticality" defaultValue={current?.criticality ?? "medium"} className={inputClass}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </Field>
            <Field label="Last reviewed" htmlFor="v_rev"><input id="v_rev" name="last_reviewed" type="date" defaultValue={current?.last_reviewed ?? ""} className={inputClass} /></Field>
            <Field label="Transfer mechanism" htmlFor="v_mech" hint="Needed when data leaves the EEA under GDPR."><input id="v_mech" name="transfer_mechanism" defaultValue={current?.transfer_mechanism} className={inputClass} /></Field>
          </div>
          <Field label="Data it receives (comma separated)" htmlFor="v_cats"><input id="v_cats" name="data_categories" defaultValue={current?.data_categories.join(", ")} className={inputClass} /></Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {([
              ["personal_data_shared", "Receives personal data", current?.personal_data_shared],
              ["contract_in_place", "Contract or data processing terms on record", current?.contract_in_place],
              ["subprocessors_listed", "Sub-processors listed", current?.subprocessors_listed],
              ["exit_plan", "Exit plan recorded", current?.exit_plan],
              ["outside_india", "Processes data outside India", current?.outside_india],
              ["outside_eea", "Processes data outside the EEA", current?.outside_eea],
            ] as const).map(([name, label, value]) => (
              <label key={name} className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name={name} defaultChecked={Boolean(value)} className={check} /> {label}
              </label>
            ))}
          </div>
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Saving..." : "Save vendor"}</button>
            <button type="button" onClick={() => setEditing(null)} className={ghostButtonClass}>Cancel</button>
          </div>
        </form>
      )}
      {!editing && error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
