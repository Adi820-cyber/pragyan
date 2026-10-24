"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { call, errText } from "@/lib/client/api";
import { StateBadge } from "@/components/ui/StateBadge";
import { Field, buttonClass, ghostButtonClass, inputClass } from "@/components/ui/Panel";
import { CATEGORY_LABEL } from "@/lib/format";
import type { AISystem, AuditRun, Category, Dataset, ModelVersion, RunConfig, RunPreview } from "@/lib/types";

const STEPS = ["Choose inputs", "Map columns", "Verify data", "Set policy", "Execute"];

const POLICY_FIELDS: { key: string; label: string; hint: string; step: string }[] = [
  { key: "demographic_parity_difference", label: "Outcome gap between groups", hint: "Flag when the gap in favourable-outcome rates is above this share.", step: "0.01" },
  { key: "selection_rate_ratio_min", label: "Lowest-to-highest outcome ratio", hint: "Flag when the ratio falls below this value. 0.80 echoes the 4/5ths rule heuristic.", step: "0.01" },
  { key: "equalized_odds_difference", label: "Error-rate gap between groups", hint: "Requires ground truth actual outcomes.", step: "0.01" },
  { key: "drift_ks", label: "Numeric drift (KS statistic)", hint: "Flag when a numeric input distribution moves more than this.", step: "0.01" },
  { key: "drift_js", label: "Category drift (Jensen-Shannon)", hint: "Flag when a category mix shifts more than this.", step: "0.01" },
  { key: "performance_drop", label: "Accuracy drop", hint: "Requires ground truth actual outcomes in both datasets.", step: "0.01" },
];

const LLM_POLICY_FIELDS: { key: string; label: string; hint: string; step: string }[] = [
  { key: "llm_refusal_gap", label: "Refusal-rate gap between groups", hint: "Flag when one group is refused/deflected more often than another by more than this share.", step: "0.01" },
  { key: "llm_length_ratio_min", label: "Answer-length ratio between groups", hint: "Flag when the shortest group median is below this share of the longest.", step: "0.01" },
  { key: "llm_score_gap_d", label: "Quality-score gap (standard deviations)", hint: "Requires a quality score column.", step: "0.05" },
  { key: "llm_min_grounded", label: "Minimum groundedness", hint: "Requires source/context column. Share of answer supported by source context.", step: "0.01" },
  { key: "llm_unsupported_number_rate", label: "Max outputs with unsupported figures", hint: "Share of outputs that state a number found in neither source nor prompt.", step: "0.01" },
  { key: "llm_min_citation_share", label: "Minimum citation coverage", hint: "Applies when answers must cite sources.", step: "0.01" },
  { key: "llm_min_review_share", label: "Minimum share reviewed by a human", hint: "Requires a human-review audit column.", step: "0.01" },
  { key: "drift_ks", label: "Numeric drift (KS statistic)", hint: "Flag when answer or prompt length distribution shifts more than this.", step: "0.01" },
  { key: "drift_js", label: "Vocabulary and category drift (Jensen-Shannon)", hint: "Flag when prompts or answers shift distribution beyond this limit.", step: "0.01" },
];

const LLM_DEFAULTS: Record<string, number> = {
  llm_refusal_gap: 0.05,
  llm_length_ratio_min: 0.8,
  llm_score_gap_d: 0.2,
  llm_min_grounded: 0.7,
  llm_unsupported_number_rate: 0.05,
  llm_min_citation_share: 0.8,
  llm_min_review_share: 0.1,
  drift_ks: 0.1,
  drift_js: 0.1,
};

const DEFAULTS: Record<string, number> = {
  demographic_parity_difference: 0.1,
  selection_rate_ratio_min: 0.8,
  equalized_odds_difference: 0.1,
  drift_ks: 0.1,
  drift_js: 0.1,
  performance_drop: 0.05,
};

const DEFAULT_RATIONALE =
  "Defaults reflect early-warning screening heuristics, not rigid legal tests. Documented and reviewed by the model owner.";

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
  const [systemId, setSystemId] = useState(
    initialSystem && systems.some((s) => s.id === initialSystem) ? initialSystem : systems[0]?.id ?? ""
  );
  const sysVersions = useMemo(() => versions.filter((v) => v.system === systemId), [versions, systemId]);
  const sysRefs = useMemo(
    () => datasets.filter((d) => d.system === systemId && d.role === "reference"),
    [datasets, systemId]
  );
  const sysCurs = useMemo(
    () => datasets.filter((d) => d.system === systemId && d.role === "current"),
    [datasets, systemId]
  );

  const [versionId, setVersionId] = useState("");
  const [refId, setRefId] = useState("");
  const [curId, setCurId] = useState<string>("");

  const version = sysVersions.find((v) => v.id === versionId) ?? sysVersions[0];
  const matchesVersion = (d: Dataset) => Boolean(version && d.name.includes(`(${version.version_label} `));
  const ref = sysRefs.find((d) => d.id === refId) ?? sysRefs.find(matchesVersion) ?? sysRefs[0];
  const defaultCur = sysCurs.find(matchesVersion) ?? sysCurs[0];
  const cur = curId === "none" ? undefined : sysCurs.find((d) => d.id === curId) ?? defaultCur;

  const system = systems.find((s) => s.id === systemId);
  const isLlm = system?.system_type === "llm";
  const [llmCols, setLlmCols] = useState<Record<string, string>>({});
  const [requireCitations, setRequireCitations] = useState(false);
  const setLlm = (key: string, value: string) => setLlmCols((c) => ({ ...c, [key]: value }));
  const [prediction, setPrediction] = useState("");
  const [label, setLabel] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [idCols, setIdCols] = useState<string[]>([]);
  const [favourable, setFavourable] = useState("");
  const [thresholds, setThresholds] = useState<Record<string, number>>({ ...DEFAULTS, ...LLM_DEFAULTS });
  const [rationale, setRationale] = useState(DEFAULT_RATIONALE);
  const [minGroup, setMinGroup] = useState(30);
  const [checks, setChecks] = useState<Category[]>([
    "bias",
    "drift",
    "explainability",
    "grounding",
    "privacy",
    "governance",
  ]);

  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [problems, setProblems] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const columns = ref?.column_schema.map((c) => c.name) ?? [];
  const activeChecks = checks.filter((c) => (isLlm ? c !== "explainability" : c !== "grounding"));

  function config(): RunConfig {
    const base = {
      group_columns: groups,
      id_columns: idCols,
      min_group_size: minGroup,
      thresholds,
      thresholds_rationale: rationale,
      checks: activeChecks,
    };
    if (isLlm) {
      return {
        ...base,
        prompt_column: llmCols.prompt || null,
        output_column: llmCols.output || null,
        context_column: llmCols.context || null,
        score_column: llmCols.score || null,
        citations_column: llmCols.citations || null,
        human_reviewed_column: llmCols.reviewed || null,
        human_override_column: llmCols.override || null,
        require_citations: requireCitations,
      };
    }
    return {
      ...base,
      prediction_column: prediction,
      label_column: label || null,
      favourable_label: favourable || version?.favourable_label || "1",
    };
  }

  function body() {
    return {
      system: systemId,
      model_version: version?.id,
      reference_dataset: ref?.id,
      current_dataset: cur?.id ?? null,
      config: { ...extraFromSample(), ...config() },
    };
  }

  function extraFromSample(): Partial<RunConfig> {
    if (!ref?.suggested_config) return {};
    const s = ref.suggested_config;
    return {
      sample_tag: s.sample_tag ?? null,
      sample_scenario: s.sample_scenario ?? null,
      sample_group_values: s.sample_group_values ?? {},
      sample_grounded_field: s.sample_grounded_field ?? null,
      sample_favourable_field: s.sample_favourable_field ?? null,
    };
  }

  function applySample() {
    if (!ref?.suggested_config) return;
    const s = ref.suggested_config;
    if (s.system_type === "llm") {
      setLlmCols({
        prompt: s.prompt_column ?? "",
        output: s.output_column ?? "",
        context: s.context_column ?? "",
        score: s.score_column ?? "",
        citations: s.citations_column ?? "",
        reviewed: s.human_reviewed_column ?? "",
        override: s.human_override_column ?? "",
      });
      setRequireCitations(Boolean(s.require_citations));
    } else {
      if (s.prediction_column) setPrediction(s.prediction_column);
      if (s.label_column) setLabel(s.label_column);
      if (s.favourable_label) setFavourable(s.favourable_label);
    }
    if (s.group_columns) setGroups(s.group_columns);
    if (s.id_columns) setIdCols(s.id_columns);
  }

  function toggle(list: string[], set: (l: string[]) => void, item: string) {
    set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  }

  async function runPreview() {
    setBusy(true);
    setProblems(null);
    try {
      const p = await call<RunPreview>("POST", "ai/runs/preview/", body());
      setPreview(p);
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
      router.refresh();
    } catch (e) {
      setProblems(errText(e));
      setBusy(false);
    }
  }

  if (systems.length === 0) {
    return (
      <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-300">
        Register an AI system first, then come back to configure and run an audit.
      </div>
    );
  }

  const ready = Boolean(version && ref);

  return (
    <div className="space-y-6">
      {/* Crisp utilitarian stepper */}
      <nav aria-label="Progress">
        <ol className="grid grid-cols-2 md:grid-cols-5 gap-2" aria-label="Steps">
          {STEPS.map((name, i) => {
            const isCurrent = i === step;
            const isDone = i < step;
            return (
              <li
                key={name}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex items-center gap-2 p-2.5 rounded-md border text-xs transition-colors ${
                  isCurrent
                    ? "border-zinc-200 bg-zinc-100 text-zinc-950 font-semibold shadow-xs"
                    : isDone
                    ? "border-zinc-700 bg-zinc-900/80 text-zinc-200 font-medium"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-500"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono shrink-0 ${
                    isCurrent
                      ? "bg-zinc-950 text-zinc-100 font-bold"
                      : isDone
                      ? "bg-zinc-800 text-zinc-300"
                      : "bg-zinc-900 text-zinc-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="truncate">{name}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Target AI System" htmlFor="w_system">
              <select
                id="w_system"
                value={systemId}
                onChange={(e) => {
                  setSystemId(e.target.value);
                  setVersionId("");
                  setRefId("");
                  setCurId("");
                  setPreview(null);
                }}
                className={inputClass}
              >
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.system_type === "llm" ? "Generative/LLM" : "Tabular Classifier"})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Model Version" htmlFor="w_version">
              <select
                id="w_version"
                value={version?.id ?? ""}
                onChange={(e) => setVersionId(e.target.value)}
                className={inputClass}
              >
                {sysVersions.length === 0 && <option value="">No model versions found — add one first</option>}
                {sysVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.version_label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Reference Evaluation Dataset"
              htmlFor="w_ref"
              hint="Baseline reference set containing historical model outputs or prompt logs."
            >
              <select
                id="w_ref"
                value={ref?.id ?? ""}
                onChange={(e) => setRefId(e.target.value)}
                className={inputClass}
              >
                {sysRefs.length === 0 && <option value="">No reference datasets — upload one first</option>}
                {sysRefs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Comparison Dataset (Optional)"
              htmlFor="w_cur"
              hint="Recent production traffic log to evaluate distribution drift against baseline."
            >
              <select
                id="w_cur"
                value={curId || defaultCur?.id || "none"}
                onChange={(e) => setCurId(e.target.value)}
                className={inputClass}
              >
                <option value="none">None (skip drift evaluation)</option>
                {sysCurs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
            </Field>

            {!ready && (
              <div className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                You need at least one model version and one reference dataset to continue. Register them on the system details page.
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                disabled={!ready}
                onClick={() => {
                  if (!favourable && version) setFavourable(version.favourable_label);
                  setStep(1);
                }}
                className={buttonClass}
              >
                Continue to Column Mapping →
              </button>
            </div>
          </div>
        )}

        {step === 1 && ref && (
          <div className="space-y-5">
            {ref.suggested_config && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3.5">
                <p className="text-xs text-zinc-300">
                  Pre-mapped synthetic demo schema detected for this dataset.
                </p>
                <button type="button" onClick={applySample} className={ghostButtonClass}>
                  Apply Sample Mapping
                </button>
              </div>
            )}

            {isLlm ? (
              <div className="grid md:grid-cols-2 gap-4">
                {([
                  ["output", "Answer / Output column", "Generated response text (Required)", true],
                  ["prompt", "Prompt / Input column", "User prompt or instructions query", false],
                  ["context", "Source / Retrieved Context", "Context/passages used to measure groundedness", false],
                  ["score", "Quality Score column", "Reviewer or automated score value", false],
                  ["citations", "Citations column", "Leave blank to detect inline bracketed citations", false],
                  ["reviewed", "Human Review indicator", "Boolean or 1 if human reviewed", false],
                  ["override", "Human Override indicator", "Boolean or 1 if reviewer altered result", false],
                ] as const).map(([key, title, hint]) => (
                  <Field key={key} label={title} htmlFor={`l_${key}`} hint={hint}>
                    <select
                      id={`l_${key}`}
                      value={llmCols[key] ?? ""}
                      onChange={(e) => setLlm(key, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">{key === "output" ? "Select output column" : "None"}</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
                <Field
                  label="Minimum Sub-group Size"
                  htmlFor="m_min"
                  hint="Groups smaller than this threshold report insufficient evidence."
                >
                  <input
                    id="m_min"
                    type="number"
                    min={1}
                    value={minGroup}
                    onChange={(e) => setMinGroup(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <div className="md:col-span-2 pt-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireCitations}
                      onChange={(e) => setRequireCitations(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                    <span>Enforce source citation policy (alerts when citation coverage is low)</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Model Prediction column" htmlFor="m_pred" hint="Column holding model classification scores.">
                  <select
                    id="m_pred"
                    value={prediction}
                    onChange={(e) => setPrediction(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select column</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Favourable Outcome Value"
                  htmlFor="m_fav"
                  hint="Positive outcome category value (e.g., '1', 'Approved', 'Low Risk')."
                >
                  <input
                    id="m_fav"
                    value={favourable}
                    onChange={(e) => setFavourable(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Ground Truth Actual Label (Optional)"
                  htmlFor="m_label"
                  hint="Historical outcome column needed for error-rate disparity and accuracy."
                >
                  <select
                    id="m_label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">None (Fairness via parity only)</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Minimum Sub-group Size"
                  htmlFor="m_min"
                  hint="Groups smaller than this threshold report insufficient evidence."
                >
                  <input
                    id="m_min"
                    type="number"
                    min={1}
                    value={minGroup}
                    onChange={(e) => setMinGroup(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            <div className="pt-2 space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                {isLlm ? "Demographic / Demographic-proxy Columns (Optional)" : "Sensitive Group Columns for Disparity Screening"}
              </label>
              <div className="flex flex-wrap gap-2">
                {columns
                  .filter((c) => c !== prediction && c !== label && !Object.values(llmCols).includes(c))
                  .map((c) => (
                    <label
                      key={c}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        groups.includes(c)
                          ? "border-zinc-400 bg-zinc-800 text-zinc-100 font-medium"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={groups.includes(c)}
                        onChange={() => toggle(groups, setGroups, c)}
                        className="sr-only"
                      />
                      <span>{c}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                Identifiers to exclude from model input analysis
              </label>
              <div className="flex flex-wrap gap-2">
                {columns
                  .filter((c) => c !== prediction && c !== label)
                  .map((c) => (
                    <label
                      key={c}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                        idCols.includes(c)
                          ? "border-zinc-400 bg-zinc-800 text-zinc-100 font-medium"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={idCols.includes(c)}
                        onChange={() => toggle(idCols, setIdCols, c)}
                        className="sr-only"
                      />
                      <span>{c}</span>
                    </label>
                  ))}
              </div>
            </div>

            {problems && (
              <div role="alert" className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                {problems}
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setStep(0)} className={ghostButtonClass}>
                Back
              </button>
              <button
                type="button"
                disabled={(isLlm ? !llmCols.output : !prediction) || busy}
                onClick={runPreview}
                className={buttonClass}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Verifying schema...</span>
                  </>
                ) : (
                  <span>Verify Data & Checks →</span>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Verification & Check Feasibility</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Evaluates input completeness against required test criteria before execution.
              </p>
            </div>

            <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-md bg-zinc-900/60 overflow-hidden">
              {(Object.keys(preview.available_checks) as Category[]).map((key) => {
                const c = preview.available_checks[key];
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <span className="w-40 text-xs font-medium text-zinc-200">{CATEGORY_LABEL[key]}</span>
                      <StateBadge
                        state={c.available ? "assessed" : "not_assessed"}
                        label={c.available ? "Ready to run" : "Will not assess"}
                      />
                    </div>
                    {!c.available && <span className="text-xs text-zinc-400">{c.reason}</span>}
                    {key === "bias" && c.available && !c.error_rates && (
                      <span className="text-xs text-zinc-400">Error disparities omitted (no actual outcome column).</span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(preview.data_quality).map(([name, q]) => (
                <div key={name} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-4 space-y-1 text-xs">
                  <div className="font-semibold text-zinc-200">
                    {name === "reference" ? "Reference Dataset" : "Comparison Dataset"}
                  </div>
                  <div className="text-zinc-400 tabular-nums">
                    {q.rows.toLocaleString()} rows · {q.columns} columns
                  </div>
                  <div className="text-[11px] text-zinc-400 pt-1">
                    {Object.keys(q.columns_with_missing).length > 0 ? (
                      <>
                        Missing values detected in:{" "}
                        {Object.entries(q.columns_with_missing)
                          .map(([c, s]) => `${c} (${(s * 100).toFixed(1)}%)`)
                          .join(", ")}
                      </>
                    ) : (
                      "No null or missing values detected."
                    )}
                  </div>
                </div>
              ))}
            </div>

            {preview.pii_candidates.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
                <h4 className="text-xs font-semibold text-amber-100">Personal Data Indicators Detected</h4>
                <ul className="text-xs text-amber-200/90 space-y-1">
                  {preview.pii_candidates.map((f) => (
                    <li key={`${f.column}-${f.kind}`} className="flex items-center gap-2">
                      <span className="font-mono bg-amber-950 px-1.5 py-0.5 rounded border border-amber-800">
                        {f.column}
                      </span>
                      <span>{f.label} ({f.confidence === "detected" ? "pattern verified" : "name match"})</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-300/80">
                  These columns will be audited under data minimisation rules. Exclude any non-essential fields.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setStep(1)} className={ghostButtonClass}>
                Back
              </button>
              <button type="button" onClick={() => setStep(3)} className={buttonClass}>
                Continue to Policy Thresholds →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Set Audit Policy Thresholds</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Defines automated trigger limits for human review. These are stored permanently alongside the audit record.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {(isLlm ? LLM_POLICY_FIELDS : POLICY_FIELDS).map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`p_${f.key}`} hint={f.hint}>
                  <input
                    id={`p_${f.key}`}
                    type="number"
                    step={f.step}
                    min={0}
                    max={1}
                    value={thresholds[f.key]}
                    onChange={(e) => setThresholds({ ...thresholds, [f.key]: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>

            <Field
              label="Policy Justification / Rationale"
              htmlFor="p_why"
              hint="Document rationale for chosen tolerance limits for audit defensibility."
            >
              <textarea
                id="p_why"
                rows={2}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className={inputClass}
              />
            </Field>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">Enabled Category Modules</label>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(CATEGORY_LABEL) as Category[])
                  .filter((k) => (isLlm ? k !== "explainability" : k !== "grounding"))
                  .map((k) => (
                    <label key={k} className="inline-flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checks.includes(k)}
                        onChange={() =>
                          setChecks(checks.includes(k) ? checks.filter((c) => c !== k) : [...checks, k])
                        }
                        className="rounded border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                      <span>{CATEGORY_LABEL[k]}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setStep(2)} className={ghostButtonClass}>
                Back
              </button>
              <button
                type="button"
                disabled={activeChecks.length === 0 || !rationale.trim()}
                onClick={() => setStep(4)}
                className={buttonClass}
              >
                Review & Confirm →
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Ready to Execute Audit</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Verify configuration parameters before launching the asynchronous audit job.
              </p>
            </div>

            <dl className="grid md:grid-cols-2 gap-4 text-xs border border-zinc-800 rounded-md bg-zinc-900/60 p-4">
              <div>
                <dt className="text-zinc-400">Target System / Version</dt>
                <dd className="text-zinc-100 font-medium mt-0.5">
                  {system?.name} · {version?.version_label}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Reference Dataset</dt>
                <dd className="text-zinc-100 font-medium mt-0.5">{ref?.name}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Comparison Dataset</dt>
                <dd className="text-zinc-100 font-medium mt-0.5">{cur?.name ?? "None (Drift bypassed)"}</dd>
              </div>
              <div>
                <dt className="text-zinc-400">Evaluated Demographic Groups</dt>
                <dd className="text-zinc-100 font-medium mt-0.5">{groups.join(", ") || "None specified"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-zinc-400">Active Audit Modules</dt>
                <dd className="text-zinc-100 font-medium mt-0.5">
                  {activeChecks.map((c) => CATEGORY_LABEL[c]).join(" · ")}
                </dd>
              </div>
            </dl>

            {problems && (
              <div role="alert" className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                {problems}
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
              <button type="button" onClick={() => setStep(3)} className={ghostButtonClass}>
                Back
              </button>
              <button type="button" disabled={busy} onClick={start} className={buttonClass}>
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Initiating audit job...</span>
                  </>
                ) : (
                  <span>Launch Audit Run</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
