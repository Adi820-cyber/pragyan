"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { CATEGORY_LABEL } from "@/lib/format";
import type { AISystem, AuditRun, Category, Dataset, ModelVersion, RunConfig, RunPreview } from "@/lib/types";

const STEPS = ["Choose inputs", "Map columns", "Check the data", "Set the policy", "Run"];

const POLICY_FIELDS: { key: string; label: string; hint: string; step: string }[] = [
  { key: "demographic_parity_difference", label: "Outcome gap between groups", hint: "Review when the gap in favourable-outcome rates is above this share.", step: "0.01" },
  { key: "selection_rate_ratio_min", label: "Lowest-to-highest outcome ratio", hint: "Review when the ratio falls below this value. 0.80 echoes the four-fifths rule, a heuristic and not a legal test.", step: "0.01" },
  { key: "equalized_odds_difference", label: "Error-rate gap between groups", hint: "Needs actual outcomes.", step: "0.01" },
  { key: "drift_ks", label: "Numeric drift (KS statistic)", hint: "Review when a numeric input moves more than this.", step: "0.01" },
  { key: "drift_js", label: "Category drift (Jensen-Shannon)", hint: "Review when a category mix moves more than this.", step: "0.01" },
  { key: "performance_drop", label: "Accuracy drop", hint: "Needs actual outcomes in both datasets.", step: "0.01" },
];

const DEFAULTS: Record<string, number> = {
  demographic_parity_difference: 0.1,
  selection_rate_ratio_min: 0.8,
  equalized_odds_difference: 0.1,
  drift_ks: 0.1,
  drift_js: 0.1,
  performance_drop: 0.05,
};

const DEFAULT_RATIONALE =
  "Defaults are screening heuristics for early warning, not legal tests. Reviewed and kept by the system owner.";

export function NewAuditWizard({
  systems,
  versions,
  datasets,
  initialSystem,
}: {
  systems: AISystem[];
  versions: ModelVersion[];
  datasets: Dataset[];
  initialSystem?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [systemId, setSystemId] = useState(initialSystem && systems.some((s) => s.id === initialSystem) ? initialSystem : (systems[0]?.id ?? ""));
  const sysVersions = useMemo(() => versions.filter((v) => v.system === systemId), [versions, systemId]);
  const sysRefs = useMemo(() => datasets.filter((d) => d.system === systemId && d.role === "reference"), [datasets, systemId]);
  const sysCurs = useMemo(() => datasets.filter((d) => d.system === systemId && d.role === "current"), [datasets, systemId]);

  const [versionId, setVersionId] = useState("");
  const [refId, setRefId] = useState("");
  const [curId, setCurId] = useState("");
  const version = sysVersions.find((v) => v.id === versionId) ?? sysVersions[0];
  // Prefer datasets whose name says they hold predictions from the chosen model version.
  const matchesVersion = (d: Dataset) => Boolean(version && d.name.includes(`(${version.version_label} predictions`));
  const ref = sysRefs.find((d) => d.id === refId) ?? sysRefs.find(matchesVersion) ?? sysRefs[0];
  const defaultCur = sysCurs.find(matchesVersion) ?? sysCurs[0];
  const cur = curId === "none" ? undefined : (sysCurs.find((d) => d.id === curId) ?? defaultCur);

  const [prediction, setPrediction] = useState("");
  const [label, setLabel] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [idCols, setIdCols] = useState<string[]>([]);
  const [favourable, setFavourable] = useState("");
  const [thresholds, setThresholds] = useState<Record<string, number>>({ ...DEFAULTS });
  const [rationale, setRationale] = useState(DEFAULT_RATIONALE);
  const [minGroup, setMinGroup] = useState(30);
  const [checks, setChecks] = useState<Category[]>(["bias", "drift", "explainability", "privacy"]);

  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [problems, setProblems] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = ref?.column_schema.map((c) => c.name) ?? [];

  function config(): RunConfig {
    return {
      prediction_column: prediction,
      label_column: label || null,
      group_columns: groups,
      id_columns: idCols,
      favourable_label: favourable || version?.favourable_label || "1",
      min_group_size: minGroup,
      thresholds,
      thresholds_rationale: rationale,
      checks,
    };
  }

  function body() {
    return {
      system: systemId,
      model_version: version?.id,
      reference_dataset: ref?.id,
      current_dataset: cur?.id ?? null,
      config: config(),
    };
  }

  function applySample() {
    const s = (ref?.suggested_config ?? {}) as Partial<RunConfig>;
    setPrediction(String(s.prediction_column ?? ""));
    setLabel(String(s.label_column ?? ""));
    setGroups((s.group_columns as string[]) ?? []);
    setIdCols((s.id_columns as string[]) ?? []);
    setFavourable(String(s.favourable_label ?? ""));
  }

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function runPreview() {
    setBusy(true);
    setProblems(null);
    try {
      const result = await call<RunPreview>("POST", "ai/runs/preview/", body());
      setPreview(result);
      setStep(2);
    } catch (e) {
      setProblems(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setProblems(null);
    try {
      const run = await call<AuditRun>("POST", "ai/runs/", body());
      router.push(`/audits/${run.id}`);
    } catch (e) {
      setProblems(errText(e));
      setBusy(false);
    }
  }

  if (systems.length === 0) {
    return <p className="text-sm text-slate-300">Register an AI system first, then come back to run an audit.</p>;
  }

  const ready = Boolean(version && ref);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((name, i) => (
          <li key={name} aria-current={i === step ? "step" : undefined} className={`text-xs rounded-full px-3 py-1 border ${i === step ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : i < step ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-slate-500"}`}>
            {i + 1}. {name}
          </li>
        ))}
      </ol>

      <div className="glass-panel p-6 space-y-5">
        {step === 0 && (
          <>
            <Field label="AI system" htmlFor="w_system">
              <select id="w_system" value={systemId} onChange={(e) => { setSystemId(e.target.value); setVersionId(""); setRefId(""); setCurId(""); setPreview(null); }} className={inputClass}>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Model version" htmlFor="w_version">
              <select id="w_version" value={version?.id ?? ""} onChange={(e) => setVersionId(e.target.value)} className={inputClass}>
                {sysVersions.length === 0 && <option value="">No model versions: add one first</option>}
                {sysVersions.map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}
              </select>
            </Field>
            <Field label="Reference dataset" htmlFor="w_ref" hint="The data you compare against, with a column of model predictions.">
              <select id="w_ref" value={ref?.id ?? ""} onChange={(e) => setRefId(e.target.value)} className={inputClass}>
                {sysRefs.length === 0 && <option value="">No reference datasets: upload one first</option>}
                {sysRefs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.row_count.toLocaleString()} rows)</option>)}
              </select>
            </Field>
            <Field label="Current dataset (optional)" htmlFor="w_cur" hint="Newer data to check for drift. Without it, drift is reported as not assessed.">
              <select id="w_cur" value={curId || defaultCur?.id || "none"} onChange={(e) => setCurId(e.target.value)} className={inputClass}>
                <option value="none">None: skip drift</option>
                {sysCurs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.row_count.toLocaleString()} rows)</option>)}
              </select>
            </Field>
            {!ready && <p className="text-xs text-amber-200">You need at least one model version and one reference dataset. Add them on the system page.</p>}
            <button type="button" disabled={!ready} onClick={() => { if (!favourable && version) setFavourable(version.favourable_label); setStep(1); }} className={buttonClass}>Continue</button>
          </>
        )}

        {step === 1 && ref && (
          <>
            {ref.suggested_config && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-100">This is the synthetic sample, so the column mapping can be filled in for you.</p>
                <button type="button" onClick={applySample} className={ghostButtonClass}>Use sample mapping</button>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Prediction column" htmlFor="m_pred" hint="What the model decided.">
                <select id="m_pred" value={prediction} onChange={(e) => setPrediction(e.target.value)} className={inputClass}>
                  <option value="">Choose a column</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Favourable outcome value" htmlFor="m_fav" hint="The prediction value that is good for the person. 1 can mean rejection, so be explicit.">
                <input id="m_fav" value={favourable} onChange={(e) => setFavourable(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Actual outcome column (optional)" htmlFor="m_label" hint="Needed for error-rate gaps and accuracy. Past outcomes can themselves reflect historical bias.">
                <select id="m_label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Minimum group size" htmlFor="m_min" hint="Groups smaller than this are reported as insufficient evidence.">
                <input id="m_min" type="number" min={1} value={minGroup} onChange={(e) => setMinGroup(Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
            <fieldset>
              <legend className="text-xs font-medium text-slate-300">Group columns to compare (optional)</legend>
              <p className="text-[11px] text-slate-500 mb-2">Choose these on purpose and only where you have a lawful reason to hold them. Reskure never infers sensitive attributes. With none selected, group checks are reported as not assessed.</p>
              <div className="flex flex-wrap gap-3">
                {columns.filter((c) => c !== prediction && c !== label).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-slate-200">
                    <input type="checkbox" checked={groups.includes(c)} onChange={() => toggle(groups, setGroups, c)} className="accent-cyan-500" /> {c}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-medium text-slate-300">ID columns to leave out of the analysis</legend>
              <div className="flex flex-wrap gap-3 mt-2">
                {columns.filter((c) => c !== prediction && c !== label).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-slate-200">
                    <input type="checkbox" checked={idCols.includes(c)} onChange={() => toggle(idCols, setIdCols, c)} className="accent-cyan-500" /> {c}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">All remaining columns are treated as model inputs. Columns that hold personal data and are not needed are flagged in the next step.</p>
            </fieldset>
            {problems && <p role="alert" className="text-xs text-rose-300 whitespace-pre-wrap">{problems}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(0)} className={ghostButtonClass}>Back</button>
              <button type="button" disabled={!prediction || busy} onClick={runPreview} className={buttonClass}>{busy ? "Checking..." : "Check the data"}</button>
            </div>
          </>
        )}

        {step === 2 && preview && (
          <>
            <h2 className="text-sm font-bold text-white">What will run</h2>
            <ul className="space-y-2">
              {(Object.keys(preview.available_checks) as Category[]).map((key) => {
                const c = preview.available_checks[key];
                return (
                  <li key={key} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="w-52 text-slate-200">{CATEGORY_LABEL[key]}</span>
                    <StateBadge state={c.available ? "assessed" : "not_assessed"} label={c.available ? "Will run" : "Will not be assessed"} />
                    {!c.available && <span className="text-xs text-slate-400">{c.reason}</span>}
                    {key === "bias" && c.available && !c.error_rates && <span className="text-xs text-slate-400">Error-rate gaps need an actual outcome column.</span>}
                  </li>
                );
              })}
            </ul>
            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(preview.data_quality).map(([name, q]) => (
                <div key={name} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100 mb-1">{name === "reference" ? "Reference data" : "Current data"}</div>
                  {q.rows.toLocaleString()} rows, {q.columns} columns.
                  {Object.keys(q.columns_with_missing).length > 0 ? (
                    <> Missing values in: {Object.entries(q.columns_with_missing).map(([c, s]) => `${c} (${(s * 100).toFixed(1)}%)`).join(", ")}.</>
                  ) : <> No missing values.</>}
                </div>
              ))}
            </div>
            {preview.pii_candidates.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <h3 className="text-xs font-bold text-amber-100">Personal-data indicators in the reference data</h3>
                <ul className="mt-1 text-xs text-amber-100 space-y-0.5">
                  {preview.pii_candidates.map((f) => (
                    <li key={`${f.column}-${f.kind}`}>{f.column}: {f.label} ({f.confidence === "detected" ? "pattern match" : "name only, confirm"})</li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-200/80 mt-2">The audit will report these. Consider removing columns you do not need before sharing data.</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className={ghostButtonClass}>Back</button>
              <button type="button" onClick={() => setStep(3)} className={buttonClass}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-xs text-slate-400">These thresholds decide when a result is flagged for review. They are screening policy, not legal standards. They are saved with the run so the result can be defended and reproduced.</p>
            <div className="grid md:grid-cols-2 gap-4">
              {POLICY_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`p_${f.key}`} hint={f.hint}>
                  <input id={`p_${f.key}`} type="number" step={f.step} min={0} max={1} value={thresholds[f.key]} onChange={(e) => setThresholds({ ...thresholds, [f.key]: Number(e.target.value) })} className={inputClass} />
                </Field>
              ))}
            </div>
            <Field label="Why these thresholds" htmlFor="p_why">
              <textarea id="p_why" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} className={inputClass} />
            </Field>
            <fieldset>
              <legend className="text-xs font-medium text-slate-300 mb-2">Checks to run</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-xs text-slate-200">
                    <input type="checkbox" checked={checks.includes(k)} onChange={() => setChecks(checks.includes(k) ? checks.filter((c) => c !== k) : [...checks, k])} className="accent-cyan-500" /> {CATEGORY_LABEL[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} className={ghostButtonClass}>Back</button>
              <button type="button" disabled={checks.length === 0 || !rationale.trim()} onClick={() => setStep(4)} className={buttonClass}>Continue</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-sm font-bold text-white">Ready to run</h2>
            <dl className="grid md:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-400">System / model</dt><dd className="text-slate-100">{systems.find((s) => s.id === systemId)?.name} / {version?.version_label}</dd></div>
              <div><dt className="text-xs text-slate-400">Reference</dt><dd className="text-slate-100">{ref?.name}</dd></div>
              <div><dt className="text-xs text-slate-400">Current</dt><dd className="text-slate-100">{cur?.name ?? "None (drift not assessed)"}</dd></div>
              <div><dt className="text-xs text-slate-400">Groups compared</dt><dd className="text-slate-100">{groups.join(", ") || "None"}</dd></div>
              <div><dt className="text-xs text-slate-400">Checks</dt><dd className="text-slate-100">{checks.map((c) => CATEGORY_LABEL[c]).join(", ")}</dd></div>
            </dl>
            <p className="text-xs text-slate-400">The audit runs in the background. You can leave this page; progress is shown on the audit page.</p>
            {problems && <p role="alert" className="text-xs text-rose-300 whitespace-pre-wrap">{problems}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(3)} className={ghostButtonClass}>Back</button>
              <button type="button" disabled={busy} onClick={start} className={buttonClass}>{busy ? "Starting..." : "Run audit"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
