import { z } from "zod";
const count = z.number().int().nonnegative();
const rate = z.number().finite().min(0).max(1).nullable();
const metrics = z.object({ n: count, classified: count, abstained: count, known_labels: count, prediction_coverage: rate, precision: rate, end_to_end_sensitivity: rate, selective_false_positive_rate: rate, brier: rate, auroc: rate,
  confusion: z.object({ tp: count, fp: count, tn: count, fn: count, positive_abstentions: count, negative_abstentions: count, unknown_labels: count }),
  reliability: z.array(z.object({ lower: z.number().min(0).max(1), upper: z.number().min(0).max(1), n: count, mean_probability: rate, positive_fraction: rate })).max(10) }).passthrough();
// Imported reports are aggregate documents, never authenticated study evidence.
export const EvaluationReport = z.object({ schema: z.literal("observatory-evaluation/1"), mode: z.enum(["synthetic_fixture", "consented_study"]), target: z.literal("ai-directed-execution/1"), corpus_digest: z.string().regex(/^[a-f0-9]{64}$/), model_digest: z.string().regex(/^[a-f0-9]{64}$/), split_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(), holdout_n: count, holdout_groups: count, total_corpus_rows: count,
  comparisons: z.array(z.object({ model: z.string().min(1).max(128), metrics,
    uncertainty: z.object({ method: z.string().max(80), groups: count, intervals: z.record(z.string(), z.object({ bounds: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).nullable(), valid_resamples: count })).nullable() }).passthrough(),
    cohorts: z.record(z.string(), metrics), prevalence_shift: z.array(z.object({ assumed_prevalence: z.number().min(0).max(1), flagged_fraction: z.number().min(0).max(1), positive_predictive_value: rate })).max(21) }).passthrough()).min(1).max(20),
  limitations: z.array(z.string().max(1000)).max(100), optional_models: z.array(z.object({ name: z.string().max(128), status: z.string().max(80) })).max(20).optional() }).passthrough();
