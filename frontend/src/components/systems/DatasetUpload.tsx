"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { Field, buttonClass, inputClass } from "@/components/ui/Panel";

export function DatasetUpload({ systemId, systemType }: { systemId: string; systemType: "llm" | "tabular" }) {
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
        <Field label="Name" htmlFor="ds_name">
          <input id="ds_name" name="name" required maxLength={200} className={inputClass} />
        </Field>
        <Field label="Role" htmlFor="ds_role" hint="The reference is the data you compare against. Current is newer data.">
          <select id="ds_role" name="role" className={inputClass} defaultValue="reference">
            <option value="reference">Reference</option>
            <option value="current">Current</option>
          </select>
        </Field>
        <Field label="File" htmlFor="ds_file" hint="CSV, or JSONL with one JSON object per line. UTF-8, up to 20 MB.">
          <input id="ds_file" name="file" type="file" accept=".csv,.jsonl,.ndjson,text/csv" required className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white`} />
        </Field>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Period start" htmlFor="ds_start">
          <input id="ds_start" name="period_start" type="date" className={inputClass} />
        </Field>
        <Field label="Period end" htmlFor="ds_end">
          <input id="ds_end" name="period_end" type="date" className={inputClass} />
        </Field>
        <Field label="Delete after" htmlFor="ds_delete" hint="Date this copy should be removed.">
          <input id="ds_delete" name="delete_after" type="date" className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-slate-400">
        {systemType === "llm"
          ? "Include the prompt and the system\u0027s answer for each interaction. Add the source text it was given, a quality score, and whether a person reviewed or changed the answer if you have them. Remove direct identifiers you do not need: the privacy scan reports what it finds, with values masked."
          : "Include a column of model predictions. Add actual outcomes if you have them. Remove direct identifiers you do not need: the privacy scan will flag what it finds."}
      </p>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Uploading and scanning..." : "Upload dataset"}
      </button>
    </form>
  );
}
