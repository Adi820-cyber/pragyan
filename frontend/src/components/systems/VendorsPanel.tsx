"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { canEdit, dateOnly } from "@/lib/format";
import type { Dependency } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  model_provider: "Model / LLM API Provider",
  cloud: "Cloud / Hosting Infrastructure",
  data_labelling: "Data Labelling / Annotation",
  analytics: "Observability / Monitoring",
  other: "Other Sub-processor",
};

export function VendorsPanel({
  systemId,
  vendors,
  role,
}: {
  systemId: string;
  vendors: Dependency[];
  role: string;
}) {
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
      data_categories: String(f.get("data_categories") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
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
    if (!window.confirm(`Remove ${v.name} from the active vendor registry?`)) return;
    try {
      await call("DELETE", `ai/dependencies/${v.id}/`);
      router.refresh();
    } catch (e) {
      setError(errText(e));
    }
  }

  const current = editing && editing !== "new" ? editing : null;
  const check = "h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-zinc-100 cursor-pointer";

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">
        Inventory of sub-processors, cloud hosting partners, and model providers. Audits assess data processing agreements (DPA), training opt-outs, cross-border transfers, and retention limits.
      </p>

      {vendors.length === 0 ? (
        <div className="p-3.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
          No external processors recorded. If this system uses third-party APIs or cloud hosts, an audit will record an omission gap.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-md bg-zinc-900/40 overflow-hidden">
          {vendors.map((v) => (
            <li key={v.id} className="p-3.5 text-xs flex flex-wrap items-center justify-between gap-3 hover:bg-zinc-800/20 transition-colors">
              <div className="space-y-0.5 min-w-[240px] flex-1">
                <div className="font-semibold text-zinc-100">{v.name}</div>
                <div className="text-zinc-400">
                  {ROLE_LABEL[v.role]}
                  {v.service ? ` · ${v.service}` : ""}
                  {v.region ? ` · ${v.region}` : ""} · Reviewed {dateOnly(v.last_reviewed)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StateBadge
                  state={v.contract_in_place ? "no_alert" : "review_required"}
                  label={v.contract_in_place ? "DPA on record" : "No contract on file"}
                />
                {v.personal_data_shared && <StateBadge state="insufficient_evidence" label="Shares PII" />}
              </div>

              {editable && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(v)}
                    className="text-xs font-medium text-zinc-300 hover:text-white px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    className="text-xs font-medium text-red-300 hover:text-red-100 px-2.5 py-1.5 rounded hover:bg-red-950/50 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && !editing && (
        <button type="button" onClick={() => setEditing("new")} className={ghostButtonClass}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Third-Party Vendor</span>
        </button>
      )}

      {editing && (
        <form
          key={current?.id ?? "new"}
          onSubmit={save}
          className="rounded-md border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-semibold text-zinc-100">
              {current ? `Edit Vendor: ${current.name}` : "Register Third-Party Sub-processor"}
            </h4>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Vendor Entity Name" htmlFor="v_name">
              <input id="v_name" name="name" required defaultValue={current?.name} className={inputClass} />
            </Field>
            <Field label="Service / Component" htmlFor="v_service">
              <input id="v_service" name="service" defaultValue={current?.service} placeholder="e.g. GPT-4o API" className={inputClass} />
            </Field>
            <Field label="Processing Role" htmlFor="v_role">
              <select id="v_role" name="role" defaultValue={current?.role ?? "model_provider"} className={inputClass}>
                {Object.entries(ROLE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hosting Region / Cloud DC" htmlFor="v_region">
              <input id="v_region" name="region" defaultValue={current?.region} placeholder="e.g. us-east-1, Mumbai" className={inputClass} />
            </Field>
            <Field label="Provider Trains on Customer Data?" htmlFor="v_train">
              <select
                id="v_train"
                name="trains_on_customer_data"
                defaultValue={current?.trains_on_customer_data ?? "unknown"}
                className={inputClass}
              >
                <option value="unknown">Unknown (Flag as Gap)</option>
                <option value="no">No (Zero data retention / training opt-out)</option>
                <option value="yes">Yes (Trains on inputs)</option>
              </select>
            </Field>
            <Field label="Vendor Retention (Days)" htmlFor="v_ret">
              <input
                id="v_ret"
                name="retention_days"
                type="number"
                min={0}
                defaultValue={current?.retention_days ?? ""}
                placeholder="e.g. 30"
                className={inputClass}
              />
            </Field>
            <Field label="Dependency Criticality" htmlFor="v_crit">
              <select id="v_crit" name="criticality" defaultValue={current?.criticality ?? "medium"} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Last DPA Review Date" htmlFor="v_rev">
              <input id="v_rev" name="last_reviewed" type="date" defaultValue={current?.last_reviewed ?? ""} className={inputClass} />
            </Field>
            <Field label="GDPR Cross-Border Mechanism" htmlFor="v_mech" hint="SCCs or adequacy decision.">
              <input id="v_mech" name="transfer_mechanism" defaultValue={current?.transfer_mechanism} placeholder="e.g. Standard Contractual Clauses" className={inputClass} />
            </Field>
          </div>

          <Field label="Shared Data Categories (Comma-separated)" htmlFor="v_cats">
            <input
              id="v_cats"
              name="data_categories"
              defaultValue={current?.data_categories.join(", ")}
              placeholder="e.g. User queries, IP addresses, resumes"
              className={inputClass}
            />
          </Field>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800">
            {([
              ["personal_data_shared", "Receives personal data", current?.personal_data_shared],
              ["contract_in_place", "DPA / contract terms executed", current?.contract_in_place],
              ["subprocessors_listed", "Sub-processors registered", current?.subprocessors_listed],
              ["exit_plan", "Exit / migration plan exists", current?.exit_plan],
              ["outside_india", "Processes data outside India", current?.outside_india],
              ["outside_eea", "Processes data outside the EEA", current?.outside_eea],
            ] as const).map(([name, label, value]) => (
              <label key={name} className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input type="checkbox" name={name} defaultChecked={Boolean(value)} className={check} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {error && (
            <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-zinc-800">
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{busy ? "Saving vendor record..." : "Save Vendor Record"}</span>
            </button>
            <button type="button" onClick={() => setEditing(null)} className={ghostButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
