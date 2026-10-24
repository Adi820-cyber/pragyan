"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, Panel, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, dateOnly } from "@/lib/format";
import type { AISystem, Dependency } from "@/lib/types";

const RELATIONSHIP: Record<string, string> = { processor: "Processor", sub_processor: "Sub-processor", joint_controller: "Joint controller", other: "Other" };
const ROLE: Record<string, string> = { model_provider: "Model / LLM provider", cloud: "Cloud or hosting", data_labelling: "Data labelling", analytics: "Analytics or monitoring", other: "Other" };
const RISK_TONE: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  low: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  unknown: "bg-slate-500/10 text-slate-300 border-slate-500/30",
};
const RISK_LABEL: Record<string, string> = { high: "High risk", medium: "Medium risk", low: "Low risk under policy", unknown: "Not enough recorded" };

export function VendorRegister({ vendors, systems, role }: { vendors: Dependency[]; systems: AISystem[]; role: string }) {
  const router = useRouter();
  const [relationship, setRelationship] = useState("");
  const [risk, setRisk] = useState("");
  const [dpa, setDpa] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Dependency | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(role);

  const shown = vendors.filter(
    (v) =>
      (!relationship || v.relationship === relationship) &&
      (!risk || v.risk === risk) &&
      (!dpa || (dpa === "yes" ? v.contract_in_place : !v.contract_in_place)) &&
      (!query || `${v.name} ${v.service}`.toLowerCase().includes(query.toLowerCase())),
  );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const yes = (k: string) => f.get(k) === "on";
    const body = {
      system: f.get("system"),
      name: f.get("name"),
      service: f.get("service") || "",
      role: f.get("role"),
      relationship: f.get("relationship"),
      personal_data_shared: yes("personal_data_shared"),
      region: f.get("region") || "",
      outside_india: yes("outside_india"),
      outside_eea: yes("outside_eea"),
      transfer_mechanism: f.get("transfer_mechanism") || "",
      contract_in_place: yes("contract_in_place"),
      trains_on_customer_data: f.get("trains_on_customer_data"),
      subprocessors_listed: yes("subprocessors_listed"),
      exit_plan: yes("exit_plan"),
      criticality: f.get("criticality"),
      last_reviewed: f.get("last_reviewed") || null,
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

  const cur = editing && editing !== "new" ? editing : null;
  const check = "accent-cyan-500";

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        <strong className="text-slate-300">What this shows:</strong> every vendor, processor and sub-processor that touches an AI system, whether a data processing agreement (DPA) is recorded,
        whether personal data crosses a border, and the gaps the audit rules find. These are declared facts, not verified by the tool. Risk is derived from them.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="v-q"><input id="v-q" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} placeholder="Name or service" /></Field>
        <Field label="Relationship" htmlFor="v-rel">
          <select id="v-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(RELATIONSHIP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Risk" htmlFor="v-risk">
          <select id="v-risk" value={risk} onChange={(e) => setRisk(e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(RISK_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="DPA signed" htmlFor="v-dpa">
          <select id="v-dpa" value={dpa} onChange={(e) => setDpa(e.target.value)} className={inputClass}>
            <option value="">All</option>
            <option value="yes">Recorded</option>
            <option value="no">Not recorded</option>
          </select>
        </Field>
        {editable && <button type="button" className={buttonClass} onClick={() => setEditing("new")}>Add vendor</button>}
      </div>

      {editing && (
        <Panel title={cur ? `Edit ${cur.name}` : "Add vendor"}>
          <form onSubmit={save} className="grid md:grid-cols-3 gap-3" key={cur?.id ?? "new"}>
            <Field label="AI system" htmlFor="vf-system">
              <select id="vf-system" name="system" defaultValue={cur?.system ?? systems[0]?.id} required disabled={!!cur} className={inputClass}>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Vendor name" htmlFor="vf-name"><input id="vf-name" name="name" defaultValue={cur?.name} required className={inputClass} /></Field>
            <Field label="Service" htmlFor="vf-service"><input id="vf-service" name="service" defaultValue={cur?.service} className={inputClass} /></Field>
            <Field label="Relationship" htmlFor="vf-rel">
              <select id="vf-rel" name="relationship" defaultValue={cur?.relationship ?? "processor"} className={inputClass}>
                {Object.entries(RELATIONSHIP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Type of service" htmlFor="vf-role">
              <select id="vf-role" name="role" defaultValue={cur?.role ?? "model_provider"} className={inputClass}>
                {Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Criticality" htmlFor="vf-crit">
              <select id="vf-crit" name="criticality" defaultValue={cur?.criticality ?? "medium"} className={inputClass}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </Field>
            <Field label="Region where data is held" htmlFor="vf-region"><input id="vf-region" name="region" defaultValue={cur?.region} className={inputClass} /></Field>
            <Field label="Transfer mechanism" htmlFor="vf-tm" hint="For example standard contractual clauses."><input id="vf-tm" name="transfer_mechanism" defaultValue={cur?.transfer_mechanism} className={inputClass} /></Field>
            <Field label="Trains on your data?" htmlFor="vf-train">
              <select id="vf-train" name="trains_on_customer_data" defaultValue={cur?.trains_on_customer_data ?? "unknown"} className={inputClass}>
                <option value="unknown">Unknown</option><option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Last reviewed" htmlFor="vf-rev"><input id="vf-rev" name="last_reviewed" type="date" defaultValue={cur?.last_reviewed ?? ""} className={inputClass} /></Field>
            <fieldset className="md:col-span-2 grid grid-cols-2 gap-2 text-xs text-slate-200">
              <legend className="text-xs font-medium text-slate-300 mb-1">Declared facts</legend>
              <label className="flex items-center gap-2"><input type="checkbox" name="contract_in_place" defaultChecked={cur?.contract_in_place} className={check} /> DPA / contract signed</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="personal_data_shared" defaultChecked={cur?.personal_data_shared} className={check} /> Personal data is shared</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="outside_india" defaultChecked={cur?.outside_india} className={check} /> Data leaves India</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="outside_eea" defaultChecked={cur?.outside_eea} className={check} /> Data leaves the EEA</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="subprocessors_listed" defaultChecked={cur?.subprocessors_listed} className={check} /> Sub-processors listed</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="exit_plan" defaultChecked={cur?.exit_plan} className={check} /> Exit plan exists</label>
            </fieldset>
            <div className="md:col-span-3 flex gap-2">
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Saving..." : "Save vendor"}</button>
              <button type="button" onClick={() => { setEditing(null); setError(null); }} className={ghostButtonClass}>Cancel</button>
            </div>
            {error && <p role="alert" className="md:col-span-3 text-xs text-rose-300">{error}</p>}
          </form>
        </Panel>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-slate-400">{vendors.length === 0 ? "No vendors are recorded yet. Add the model provider, cloud host and any sub-processors." : "No vendors match the filters."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <caption className="sr-only">Vendor and processor register</caption>
            <thead className="text-slate-500">
              <tr>
                {["Vendor", "AI system", "Relationship", "DPA signed", "Cross-border", "Last reviewed", "Risk", "Gaps", ""].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {shown.map((v) => (
                <tr key={v.id} className="border-t border-white/10 align-top">
                  <td className="py-2 pr-3"><div className="font-semibold">{v.name}</div><div className="text-slate-500">{v.service || ROLE[v.role]}</div>{v.is_demo && <div className="text-[10px] text-amber-300">Demo data</div>}</td>
                  <td className="py-2 pr-3">{v.system_name}</td>
                  <td className="py-2 pr-3">{RELATIONSHIP[v.relationship]}</td>
                  <td className="py-2 pr-3">{v.contract_in_place ? "Recorded" : v.personal_data_shared ? "Not recorded" : "n/a (no personal data)"}</td>
                  <td className="py-2 pr-3">{v.outside_india || v.outside_eea ? `Yes: ${[v.outside_india && "outside India", v.outside_eea && "outside EEA"].filter(Boolean).join(", ")}${v.transfer_mechanism ? ` (${v.transfer_mechanism})` : ""}` : "No"}</td>
                  <td className="py-2 pr-3">{dateOnly(v.last_reviewed)}</td>
                  <td className="py-2 pr-3"><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${RISK_TONE[v.risk]}`}>{RISK_LABEL[v.risk]}</span></td>
                  <td className="py-2 pr-3 max-w-xs">{v.gaps.length ? <ul className="list-disc ml-4 text-slate-300">{v.gaps.slice(0, 3).map((g) => <li key={g}>{g}</li>)}</ul> : <span className="text-slate-500">None recorded</span>}</td>
                  <td className="py-2">{editable && <button type="button" onClick={() => setEditing(v)} className="text-cyan-300 hover:text-cyan-200 underline">Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
