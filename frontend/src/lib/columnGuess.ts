import type { Dataset } from "@/lib/types";

type Col = Dataset["column_schema"][number];

export interface ColumnGuess {
  prediction: string;
  label: string;
  groups: string[];
  ids: string[];
}

const ID_LIKE = /(^|_)(id|uuid|guid|case|date|time|timestamp|dob|birth|name|email|phone|ssn|pan|aadhaar)(_|$)|_id$/i;
const GROUP_LIKE = /(^|_)(gender|sex|race|ethnic\w*|religion|caste|disab\w*|age_group|age_cat\w*|nationality)(_|$)/i;
const PRED_LIKE = /pred|decision|shortlist|approved|selected|flag|result|tool/i;
const LABEL_LIKE = /actual|label|truth|recid|outcome|hired|target|default/i;

export const isIdLike = (c: Col, rowCount: number) =>
  ID_LIKE.test(c.name) || (c.kind !== "continuous" && rowCount > 20 && c.n_unique >= rowCount * 0.9);

/** Binary, not an identifier: the only kind of column that can hold a model decision or an actual outcome. */
const isBinary = (c: Col, rowCount: number) => c.n_unique === 2 && !isIdLike(c, rowCount);

/** Best-effort defaults for datasets without a stored sample mapping. Never picks ID-like or high-cardinality columns. */
export function guessColumns(columns: Col[], rowCount: number): ColumnGuess {
  const binary = columns.filter((c) => isBinary(c, rowCount));
  const pickBy = (re: RegExp, pool: Col[]) => pool.find((c) => re.test(c.name))?.name;
  const prediction = pickBy(PRED_LIKE, binary) ?? "";
  const label = pickBy(LABEL_LIKE, binary.filter((c) => c.name !== prediction)) ?? "";
  const ids = columns.filter((c) => c.name !== prediction && c.name !== label && isIdLike(c, rowCount)).map((c) => c.name);
  const groups = columns
    .filter((c) => c.name !== prediction && c.name !== label && !ids.includes(c.name) && GROUP_LIKE.test(c.name))
    .map((c) => c.name);
  return { prediction, label, groups, ids };
}

/** A readable problem with the chosen mapping, or null. Mirrors the server's checks so users see it before Verify. */
export function mappingProblem(columns: Col[], prediction: string, label: string, groups: string[], ids: string[]): string | null {
  const byName = (n: string) => columns.find((c) => c.name === n);
  const p = byName(prediction);
  if (p && p.n_unique !== 2) {
    return `Prediction column '${prediction}' has ${p.n_unique} different values. It must be a yes/no column of model decisions, not an identifier or a score.`;
  }
  const l = label ? byName(label) : undefined;
  if (l && l.n_unique > 2) {
    return `Actual outcome column '${label}' has ${l.n_unique} different values. It must be a yes/no column, or leave it as None.`;
  }
  if (label && label === prediction) return "The prediction column and the actual outcome column must be different.";
  const clash = groups.filter((g) => ids.includes(g));
  if (clash.length) return `${clash.join(", ")} cannot be both a group to compare and an identifier to exclude.`;
  return null;
}
