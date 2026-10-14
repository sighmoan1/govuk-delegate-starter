import { expect, it } from 'vitest';
import { EvaluationReport } from '../src/lib/evaluation-report';
const report = () => ({ schema: 'observatory-evaluation/1', mode: 'synthetic_fixture', target: 'ai-directed-execution/1', corpus_digest: 'a'.repeat(64), model_digest: 'b'.repeat(64), source_commit: 'c'.repeat(40), protocol_version: 'fixture/1', configurations: [{ model_digest: 'd'.repeat(64), features: ['latency_ms'], threshold: .6 }], holdout_n: 1, holdout_groups: 1, total_corpus_rows: 5, comparisons: [{ model: 'logistic', metrics: { n: 1, classified: 1, abstained: 0, known_labels: 1, prediction_coverage: 1, precision: 1, end_to_end_sensitivity: 1, selective_false_positive_rate: null, brier: .01, auroc: null, raw_flagged_fraction: 1, confusion: { tp: 1, fp: 0, tn: 0, fn: 0, positive_abstentions: 0, negative_abstentions: 0, unknown_labels: 0 }, reliability: [] }, uncertainty: { method: 'descriptive_only', groups: 1, intervals: null, reason: 'TOO_FEW_INDEPENDENT_GROUPS' }, cohorts: {}, prevalence_shift: [], population_prevalence: { adjusted_estimate: null, status: 'UNAVAILABLE' } }], limitations: ['Synthetic fixture'] });
it('local report validation preserves aggregate provenance, configuration and uncertainty on export', () => {
  const parsed = EvaluationReport.parse(report());
  expect(parsed.source_commit).toBe('c'.repeat(40));
  expect(parsed.configurations).toEqual(report().configurations);
  expect(parsed.comparisons[0].metrics.raw_flagged_fraction).toBe(1);
  expect(parsed.comparisons[0].uncertainty.reason).toBe('TOO_FEW_INDEPENDENT_GROUPS');
  expect(parsed.comparisons[0].population_prevalence).toEqual({ adjusted_estimate: null, status: 'UNAVAILABLE' });
});
it('malformed display fields remain rejected before rendering an imported report', () => {
  const invalid = report(); invalid.comparisons[0].metrics.precision = 2;
  expect(EvaluationReport.safeParse(invalid).success).toBe(false);
});
