# Review of submitted Stage 1 and Stage 2 research

Reviewed 24 October 2026. This is an evidence audit, not a completed customer study or a reproduced benchmark.

## Conclusion

The earlier repository research is incomplete as empirical validation. Its disclosure of missing interviews and experiments was necessary, but identifying the gap did not complete the requested evidence-gathering stage. The submitted research improves the proposed methodology, but does not by itself close that gap.

The Perplexity submission is primarily a research design. The Gemini summary and accompanying ten-page dossier claim completed synthetic experiments. Those claims remain unverified because the supplied materials contain no executable experiment, generated records, seed, environment, fitted model, or raw results. This absence does not establish that the experiments never happened; it prevents independent reproduction.

## Evidence inventory

| Item | What is present | What it establishes |
|---|---|---|
| Perplexity text | Personas, hypotheses, metrics, interview and pilot proposals, public references | A useful investigation plan; not completed interviews or measured startup baselines |
| Gemini summary and dossier | Literature synthesis, cost estimates, synthetic simulation narrative and figures | Claims and hypotheses to verify; not independently reproducible experimental evidence |
| Original Reskure research | Source review and static repository inspection | Product gaps and desk evidence; no measured customer impact |
| This review | Document inspection, official-source checks, arithmetic checks below | Specific corrections and reproducibility requirements; no product performance result |

## Claim-by-claim disposition

| Claim | Assessment | Required treatment |
|---|---|---|
| 140+ hours per release; 3–6 weeks | Not a measured baseline for our target startups in the supplied evidence | Treat as externally reported estimates with exact provenance; measure a real workflow before adopting |
| €15k–80k consulting and €100k–300k enterprise costs | Not verified procurement quotes or like-for-like competitor trials | Do not use as established market-wide price ranges or proof of willingness to pay |
| N=5,000 synthetic records and 24-week drift experiment | Reported in dossier, without reproducibility artifacts | Label unverified reported simulation; cannot call this a Reskure benchmark |
| DIR improves .560 to .906 | Internally consistent with the reported selection rates | Retain only as arithmetic-consistent reported figures, not proven model improvement |
| EOD improves -.414 to -.060 | Cannot derive from selection rates alone | Require true labels and per-group true-positive counts/rates |
| PSI .231 at week 15 and .450 at week 24 | Cannot verify without reference/current distributions and calculation details | Require bin edges, counts, smoothing and per-window results |
| Mitigation maintains DIR .800 | No code, model, results or utility tradeoff provided | Require held-out results, accuracy/error tradeoffs and repeated seeds |
| DIR .80 is a universal regulatory pass; EOD ±.08 is a safe harbor | Unsupported as universal legal claims | Remove legal-pass wording; thresholds require context and justification |
| 99% PII recall, explanations under 200ms, 50k rows under 15 minutes | No benchmark artifacts supplied | Keep only as proposed acceptance targets with test protocols |
| 90% reduction and under $2,000 annual cost | No measured total-cost comparison supplied | Include setup, review labor, hosting, maintenance and legal review in future comparison |
| Practitioner observations | Secondary synthesis of published material | Label as literature synthesis; do not count as direct user observation |
| No integrated alternative exists | Too broad | Include AI Verify as a direct comparison |
| High-risk EU AI Act obligations all apply from August 2026 | Outdated against current official timeline | Version legal mappings and effective dates; see sources below |
| Compliance certificates | Automated checks cannot establish full legal compliance | Produce an evidence report with scope, limitations and human review |

## Arithmetic actually checked

Using only the rounded percentages printed on page 7:

- Before: 0.551 / 0.984 = 0.55995935, which rounds to DIR 0.560.
- Before signed selection-rate difference: 0.551 - 0.984 = -0.433.
- After: 0.899 / 0.992 = 0.90625, which rounds to DIR 0.906.
- After signed selection-rate difference: 0.899 - 0.992 = -0.093.

The after difference is a selection-rate difference, not EOD. EOD compares true-positive rates conditional on actual positive labels. These arithmetic checks do not establish that a model was fitted, that records exist, or that mitigation preserved predictive usefulness. In particular, very high acceptance rates require a utility check: increasing positive predictions can improve a selection-rate ratio without improving decisions.

## What to keep and change in Reskure's direction

Keep the four requested pillars: bias assessment, privacy/security evidence, drift monitoring and explanations. Keep model inventory, accountable owners, an evidence trail and actionable findings. Retain the proposed before/after study, but record observed results instead of filling it with assumed numbers.

Prioritize a narrow batch tabular demonstration with versioned data and models. Connect each finding to its input, method, threshold, limitations and reviewer. Security and tenant isolation must be repaired before customer data is used, as identified in the earlier repository review.

Remove universal fairness pass marks, automatic compliance certification, unsupported ROI promises and claims that competitors do not integrate these functions. Defer broad LLM/NLP coverage, streaming infrastructure and automatic model recalibration until the core audit is reproducible. A drift alert should trigger investigation; it does not by itself prove worsening fairness or justify automatic retraining.

## Evidence needed to close the gap

1. **Technical reproduction:** obtain the reported simulation notebook/script, seed, dependency versions, generated CSVs, labels, model configuration, split method, mitigation configuration and raw per-window results. If unavailable, run a new experiment and explicitly distinguish its results from Gemini's claims.
2. **Measured baseline:** run a fixed task on the same data using existing tools and Reskure when implemented. Log setup time, runtime, memory, manual steps, failed runs and report completeness. Do not report planned product behavior as observed behavior.
3. **User discovery:** collect actual consented interviews and workflow observations. Record participant role, organisation context, date, questions, anonymized notes and counterexamples. Public practitioner writing is useful secondary evidence, but not a substitute for these observations.
4. **Competitor evaluation:** include AI Verify, Fairlearn, Evidently and SHAP; distinguish a component library from a complete workflow. Documentation review and successful local installation are different evidence levels.
5. **Dataset limitations:** public and synthetic benchmarks can validate technical behavior, not Indian startup demand or real-world fairness. Synthetic group attributes are not permission to infer sensitive attributes in customer data.

Stage 1 remains provisionally framed, with target-user assumptions unvalidated. Stage 2 has useful desk evidence and a candidate experimental design; empirical completion is not established by the supplied files.

## Independently checked sources

- [Fairlearn: common fairness metrics and four-fifths-rule limitations](https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html). Meeting a metric does not automatically establish fairness; context and subgroup sample sizes matter.
- [AI Verify official user guide](https://aiverify-foundation.github.io/aiverify/). Documents technical tests, process checklists and reporting. This is a documentation comparison, not a local installation trial.
- [European Commission: AI Act application timeline](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai). Current guidance lists Annex III high-risk application from 2 December 2027 and Annex I product systems from 2 August 2028, with other provisions following separate dates.
- [Council official timeline](https://www.consilium.europa.eu/en/policies/artificial-intelligence-act/timeline-artificial-intelligence/). Confirms revised high-risk timelines and retention of strict necessity for special-category data processing for bias detection/correction. Do not treat bias auditing as blanket authorization to collect sensitive data.

## Submitted materials reviewed

- `C:/Users/Lenovo/Downloads/Pragyan_2K26_Track_4_05_Stage1_Stage2_Research_Dossier.pdf` — ten pages; text and hyperlinks inspected, experimental figure visually inspected.
- `C:/Users/Lenovo/.codex/attachments/f66f14d5-e538-4439-9dd1-5bf4fc5ab3fb/Pasted text.txt` — Perplexity-style Stage 1/2 research plan.
- `C:/Users/Lenovo/.codex/attachments/16440e90-84cd-4c16-af13-10ec97f69625/Pasted text.txt` — Gemini-style completed-research summary.
