import type { AISystem } from "./types";

/**
 * Impact profile, derived from the answers recorded about a system. It is a prompt for how much scrutiny a system needs,
 * not a legal risk classification, and the UI says so.
 */
export function impactProfile(s: Pick<AISystem, "automated_decision" | "processes_children_data" | "is_significant_data_fiduciary">): {
  label: "Higher impact" | "Standard";
  reasons: string[];
} {
  const reasons: string[] = [];
  if (s.automated_decision) reasons.push("makes or drives decisions about people");
  if (s.processes_children_data) reasons.push("processes data of under-18s");
  if (s.is_significant_data_fiduciary) reasons.push("notified as a Significant Data Fiduciary");
  return { label: reasons.length > 0 ? "Higher impact" : "Standard", reasons };
}

export const SYSTEM_TYPE_LABEL: Record<string, string> = { llm: "LLM / generative", tabular: "Tabular classifier" };
