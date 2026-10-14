import { describe, expect, it } from "vitest";
import { classifyFrozen, experiment, type EvidenceRecord } from "../src/lib/classification";
import { logisticAdapter, modelArtifact } from "../src/lib/statistical-model";

const artifact = () => ({ schema: "observatory-logistic/1", target: "ai-directed-execution/1", feature_set: ["latency_ms"], feature_names: ["latency_ms", "latency_ms/not_observed", "latency_ms/not_configured", "latency_ms/error"], coefficients: [2, 0, 0, 0], intercept: 0, mean: [Math.log(2), 0, 0, 0], scale: [1, 1, 1, 1], threshold: .6, mode: "synthetic_fixture", seed: 73, sklearn_version: "1.8.0", corpus_digest: "a".repeat(64), calibration: { method: "raw_logistic_no_probability_calibration", false_positive_target: .01, negative_n: 20, observed_false_positives: 0, target_substantiated: false }, limitations: ["Synthetic fixture"] });
const evidence = (): EvidenceRecord => ({ schema: "observatory-evidence/1", source: "hmrc", source_event_id: "never-a-feature", collection_method: "fixture", observed_at: "2026-10-14T00:00:00Z", sensor: { identifier: "fixture", version: "1", config: {} }, refs: { session: null, transaction: null }, sensitivity: "synthetic_pseudonymous", signals: {
  signature_verified: { value: null, missingness: "not_observed", provenance: "not_observed", confidence: null },
  latency_ms: { value: 1, missingness: "observed", provenance: "source_record", confidence: null },
  browser_present: { value: null, missingness: "not_observed", provenance: "not_observed", confidence: null },
  vendor_verified: { value: null, missingness: "not_observed", provenance: "not_observed", confidence: null },
} });
describe("offline statistical artifact", () => {
  it("scores frozen evidence with training transforms and calibrated threshold", async () => {
    const adapter = logisticAdapter(artifact());
    const result = await classifyFrozen(evidence(), experiment(adapter, .6), adapter);
    expect(result.score).toBeCloseTo(.5);
    expect(result.class).toBe("HUMAN_OPERATED");
    expect(result.reason).toBe("SYNTHETIC_FIXTURE_MODEL_NOT_VALIDATED");
    expect(result.question).toContain("ai-directed-execution/1");
  });
  it("abstains without observed features; changing identifiers cannot alter prediction", async () => {
    const adapter = logisticAdapter(artifact()), config = experiment(adapter);
    const a = evidence(), b = evidence(); b.source_event_id = "AI_AGENT_BROWSER";
    expect((await classifyFrozen(a, config, adapter)).score).toBe((await classifyFrozen(b, config, adapter)).score);
    a.signals.latency_ms = { value: null, missingness: "error", provenance: "not_observed", confidence: null };
    expect((await classifyFrozen(a, config, adapter)).status).toBe("abstain");
  });
  it("pins artifact versions and rejects label features or malformed transforms", async () => {
    const first = logisticAdapter(artifact()); const changed = artifact(); changed.coefficients[0] = 3;
    expect((await classifyFrozen(evidence(), experiment(first), logisticAdapter(changed))).reason).toBe("ADAPTER_CONFIG_MISMATCH");
    expect(() => modelArtifact({ ...artifact(), feature_set: ["execution_class"] })).toThrow();
    expect(() => modelArtifact({ ...artifact(), scale: [0, 1, 1, 1] })).toThrow();
    expect(() => modelArtifact({ ...artifact(), provenance: "leaked truth" })).toThrow();
  });
});
