"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";

export function DatasetUpload({
  systemId,
  systemType,
}: {
  systemId: string;
  systemType: "llm" | "tabular";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    form.set("system", systemId);
    for (const key of ["period_start", "period_end", "delete_after"]) {
      if (!form.get(key)) form.delete(key);
    }
    setBusy(true);
    setError(null);
    try {
      await call("POST", "ai/datasets/", form);
      formEl.reset();
      router.refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Dataset Identifier Name" htmlFor="ds_name">
          <input
            id="ds_name"
            name="name"
            required
            maxLength={200}
            placeholder="e.g. Q4 2024 Production Traffic Log"
            className={inputClass}
          />
        </Field>
        <Field
          label="Evaluation Role"
          htmlFor="ds_role"
          hint="Reference data serves as the baseline; Current data evaluates drift."
        >
          <select id="ds_role" name="role" className={inputClass} defaultValue="reference">
            <option value="reference">Baseline Reference Dataset</option>
            <option value="current">Current Production Traffic Log</option>
          </select>
        </Field>
        <Field
          label="Source Data File"
          htmlFor="ds_file"
          hint="CSV or JSONL formatted (UTF-8 encoded, up to 20 MB)."
        >
          <input
            id="ds_file"
            name="file"
            type="file"
            accept=".csv,.jsonl,.ndjson,text/csv"
            required
            className={`${inputClass} file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200 cursor-pointer`}
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Collection Window Start" htmlFor="ds_start">
          <input id="ds_start" name="period_start" type="date" className={inputClass} />
        </Field>
        <Field label="Collection Window End" htmlFor="ds_end">
          <input id="ds_end" name="period_end" type="date" className={inputClass} />
        </Field>
        <Field
          label="Statutory Data Retention Limit"
          htmlFor="ds_delete"
          hint="Automated deletion date under DPDP/GDPR storage limitation."
        >
          <input id="ds_delete" name="delete_after" type="date" className={inputClass} />
        </Field>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/40 p-3 rounded-md border border-zinc-800">
        {systemType === "llm"
          ? "Include columns for prompt query and model response. Optionally provide ground-truth retrieved context, reviewer quality scores, or human-in-the-loop audit indicators. An automated privacy scan will mask direct identifiers upon upload."
          : "Include a column containing model prediction scores. Include actual observed outcomes if available for error disparity analysis. An automated privacy scan will evaluate direct identifiers."}
      </p>

      {error && (
        <div role="alert" className="p-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          {error}
        </div>
      )}

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            <span>Scanning and uploading dataset...</span>
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload and Scan Dataset</span>
          </>
        )}
      </button>
    </form>
  );
}
