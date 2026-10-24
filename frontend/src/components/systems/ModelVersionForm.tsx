"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";

export function ModelVersionForm({ systemId, systemType }: { systemId: string; systemType: "llm" | "tabular" }) {
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
          <Field label="Version label" htmlFor="version_label">
            <input id="version_label" name="version_label" required maxLength={100} placeholder="v1" className={inputClass} />
          </Field>
          <Field label="Where the model runs" htmlFor="source">
            <select id="source" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
              <option value="llm_hosted">Hosted by a provider (API)</option>
              <option value="llm_self_hosted">Self-hosted</option>
            </select>
          </Field>
          <Field label="Provider" htmlFor="provider" hint="For example the company that supplies the API.">
            <input id="provider" name="provider" maxLength={100} className={inputClass} />
          </Field>
          <Field label="Model name" htmlFor="model_name">
            <input id="model_name" name="model_name" maxLength={100} className={inputClass} />
          </Field>
          <Field label="Prompt or pipeline version" htmlFor="prompt_version" hint="Changing the prompt changes behaviour, so version it.">
            <input id="prompt_version" name="prompt_version" maxLength={100} className={inputClass} />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Version label" htmlFor="version_label">
              <input id="version_label" name="version_label" required maxLength={100} placeholder="v1" className={inputClass} />
            </Field>
            <Field label="How explanations are produced" htmlFor="source">
              <select id="source" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                <option value="predictions_only">Predictions only (no explanations)</option>
                <option value="local_bundle">My own model, using the local audit tool</option>
                <option value="server_sample">Built-in sample model</option>
              </select>
            </Field>
            <Field label="Favourable outcome value" htmlFor="favourable_label" hint="The prediction value that is good for the person, such as 1 for approved. Be explicit: 1 can mean rejection.">
              <input id="favourable_label" name="favourable_label" defaultValue="1" className={inputClass} />
            </Field>
          </div>
          {source === "server_sample" && (
            <Field label="Sample model" htmlFor="sample_key">
              <select id="sample_key" name="sample_key" className={inputClass} defaultValue="compas_v1">
                <option value="compas_v1">COMPAS v1 (real data; uses sex and prior arrests)</option>
                <option value="compas_v2">COMPAS v2 (real data; without sex or priors)</option>
                <option value="hirelens_v1">HireLens v1 (synthetic; uses city tier)</option>
                <option value="hirelens_v2">HireLens v2 (synthetic; without city tier)</option>
              </select>
            </Field>
          )}
          {source === "local_bundle" && (
            <p className="text-xs text-slate-400">
              Your model file never leaves your machine. Run <code className="text-cyan-300">reskure_audit.py explain</code> locally, then upload the result bundle
              with <code className="text-cyan-300">reskure_audit.py upload</code>. See <code>tools/reskure_audit_cli</code>.
            </p>
          )}
        </>
      )}      <Field label="Notes" htmlFor="notes">
        <input id="notes" name="notes" className={inputClass} />
      </Field>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Saving..." : "Add model version"}
      </button>
    </form>
  );
}
