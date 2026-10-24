"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";

export function ModelVersionForm({
  systemId,
  systemType,
}: {
  systemId: string;
  systemType: "llm" | "tabular";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLlm = systemType === "llm";
  const [source, setSource] = useState(isLlm ? "llm_hosted" : "predictions_only");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await call("POST", "ai/model-versions/", {
        system: systemId,
        version_label: form.get("version_label"),
        source,
        sample_key: source === "server_sample" ? form.get("sample_key") : "",
        provider: isLlm ? form.get("provider") || "" : "",
        model_name: isLlm ? form.get("model_name") || "" : "",
        prompt_version: isLlm ? form.get("prompt_version") || "" : "",
        favourable_label: form.get("favourable_label") || "1",
        notes: form.get("notes") || "",
      });
      (event.target as HTMLFormElement).reset();
      setSource(isLlm ? "llm_hosted" : "predictions_only");
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {isLlm ? (
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Version Identifier" htmlFor="version_label">
            <input
              id="version_label"
              name="version_label"
              required
              maxLength={100}
              placeholder="e.g. v2.1-prod"
              className={inputClass}
            />
          </Field>
          <Field label="Hosting Environment" htmlFor="source">
            <select id="source" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
              <option value="llm_hosted">Third-Party Hosted Provider API</option>
              <option value="llm_self_hosted">Self-Hosted Private Infrastructure</option>
            </select>
          </Field>
          <Field label="Service Provider" htmlFor="provider" hint="Entity supplying the model endpoint.">
            <input id="provider" name="provider" maxLength={100} placeholder="e.g. OpenAI, Anthropic, Bedrock" className={inputClass} />
          </Field>
          <Field label="Foundation Model Name" htmlFor="model_name">
            <input id="model_name" name="model_name" maxLength={100} placeholder="e.g. gpt-4o, claude-3-5-sonnet" className={inputClass} />
          </Field>
          <Field
            label="Prompt / System Instruction Version"
            htmlFor="prompt_version"
            hint="System instruction version hash."
          >
            <input id="prompt_version" name="prompt_version" maxLength={100} placeholder="e.g. prompt-v1.4" className={inputClass} />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Version Identifier" htmlFor="version_label">
              <input
                id="version_label"
                name="version_label"
                required
                maxLength={100}
                placeholder="e.g. v1.0.0"
                className={inputClass}
              />
            </Field>
            <Field label="Explanation Generation Mode" htmlFor="source">
              <select id="source" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                <option value="predictions_only">Predictions Only (Skip SHAP feature importances)</option>
                <option value="local_bundle">Proprietary Model (Audited via local CLI bundle)</option>
                <option value="server_sample">Server Demonstration Model</option>
              </select>
            </Field>
            <Field
              label="Favourable Outcome Value"
              htmlFor="favourable_label"
              hint="Prediction output designating positive treatment (e.g. '1', 'Approved')."
            >
              <input id="favourable_label" name="favourable_label" defaultValue="1" className={inputClass} />
            </Field>
          </div>
          {source === "server_sample" && (
            <Field label="Demonstration Model Profile" htmlFor="sample_key">
              <select id="sample_key" name="sample_key" className={inputClass} defaultValue="compas_v1">
                <option value="compas_v1">COMPAS v1 (Real recidivism scoring dataset; sex & prior arrests)</option>
                <option value="compas_v2">COMPAS v2 (Real recidivism scoring dataset; protected features removed)</option>
                <option value="hirelens_v1">HireLens v1 (Synthetic screening classifier; includes metro tier)</option>
                <option value="hirelens_v2">HireLens v2 (Synthetic screening classifier; demographic blind)</option>
              </select>
            </Field>
          )}
          {source === "local_bundle" && (
            <div className="p-3 rounded-md border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300">
              Model weights never leave your local infrastructure. Generate local SHAP explanations using the CLI tool:
              <pre className="mt-1 font-mono text-[11px] text-zinc-200 bg-zinc-950 p-2 rounded border border-zinc-800">
                python tools/reskure_audit_cli/reskure_audit.py explain --model model.pkl
              </pre>
            </div>
          )}
        </>
      )}

      <Field label="Version Release Notes" htmlFor="notes">
        <input id="notes" name="notes" placeholder="e.g. Retrained on Q3 2024 applicant data" className={inputClass} />
      </Field>

      {error && (
        <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {error}
        </div>
      )}

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            <span>Registering version...</span>
          </>
        ) : (
          <span>Save Model Version</span>
        )}
      </button>
    </form>
  );
}
