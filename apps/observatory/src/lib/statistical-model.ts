import { readFileSync } from "node:fs";
import { digest, FEATURE_NAMES, type ClassifierAdapter, type FeatureName, type Signal, type Decision } from "./classification";

export type LogisticArtifact = {
  schema: "observatory-logistic/1"; target: "ai-directed-execution/1";
  feature_set: FeatureName[]; feature_names: string[]; coefficients: number[];
  intercept: number; mean: number[]; scale: number[]; threshold: number;
  mode: "synthetic_fixture" | "consented_study";
  seed: number; sklearn_version: string; corpus_digest: string;
  calibration: { method: string; false_positive_target: number; negative_n: number; observed_false_positives: number; target_substantiated: false };
  limitations: string[];
};
const states = ["not_observed", "not_configured", "error"] as const;
export function modelArtifact(input: unknown): LogisticArtifact {
  const a = input as LogisticArtifact;
  const keys = ["schema", "target", "feature_set", "feature_names", "coefficients", "intercept", "mean", "scale", "threshold", "mode", "seed", "sklearn_version", "corpus_digest", "calibration", "limitations"];
  if (!a || typeof a !== "object" || Object.keys(a).some(k => !keys.includes(k)) || a.schema !== "observatory-logistic/1" || a.target !== "ai-directed-execution/1" || !["synthetic_fixture", "consented_study"].includes(a.mode)) throw new Error("INVALID_MODEL_ARTIFACT");
  if (!Array.isArray(a.feature_set) || !a.feature_set.length || JSON.stringify(a.feature_set) !== JSON.stringify(FEATURE_NAMES.filter(f => a.feature_set.includes(f)))) throw new Error("INVALID_MODEL_FEATURES");
  const names = a.feature_set.flatMap(f => [f, ...states.map(s => `${f}/${s}`)]);
  if (JSON.stringify(a.feature_names) !== JSON.stringify(names) || [a.coefficients, a.mean, a.scale].some(v => !Array.isArray(v) || v.length !== names.length || v.some(x => typeof x !== "number" || !Number.isFinite(x))) || a.scale.some(x => x <= 0)) throw new Error("INVALID_MODEL_COEFFICIENTS");
  if (!Number.isFinite(a.intercept) || !Number.isFinite(a.threshold) || a.threshold < 0 || a.threshold > 1 || !/^[a-f0-9]{64}$/.test(a.corpus_digest) || !Number.isInteger(a.seed) || typeof a.sklearn_version !== "string" || !Array.isArray(a.limitations) || a.limitations.some(s => typeof s !== "string") || a.calibration?.target_substantiated !== false) throw new Error("INVALID_MODEL_METADATA");
  return structuredClone(a);
}
export function logisticAdapter(input: unknown): ClassifierAdapter {
  const a = modelArtifact(input);
  return {
    identifier: "logistic", version: `1-${digest(a)}`, schema: "observatory-classifier-config/1", model: `logistic/${digest(a)}`, feature_set: a.feature_set,
    async classify(signals, config) {
      const abstain = (reason: string): Decision => ({ status: "abstain", class: null, score: null, reason, raw_result_ref: null, estimated_cost: { amount: 0, currency: "USD" } });
      if (!a.feature_set.some(f => signals[f]?.missingness === "observed")) return abstain("NO_OBSERVED_FEATURES");
      const x = a.feature_set.flatMap(f => {
        const s: Signal = signals[f] ?? { value: null, missingness: "not_observed", provenance: "not_observed", confidence: null };
        const value = s.missingness === "observed" ? Number(s.value) : 0;
        return [f === "latency_ms" ? Math.log1p(value) : value, ...states.map(state => Number(s.missingness === state))];
      });
      const z = a.intercept + x.reduce((sum, v, i) => sum + a.coefficients[i] * (v - a.mean[i]) / a.scale[i], 0);
      const score = 1 / (1 + Math.exp(-Math.max(-700, Math.min(700, z))));
      return { status: "classified", class: score >= config.threshold ? "AI_DIRECTED" : "HUMAN_OPERATED", score, reason: a.mode === "synthetic_fixture" ? "SYNTHETIC_FIXTURE_MODEL_NOT_VALIDATED" : "EXPERIMENTAL_STATISTICAL_PREDICTION", raw_result_ref: null, estimated_cost: { amount: 0, currency: "USD" } };
    },
  };
}
export function configuredLogistic() {
  const path = process.env.OBSERVATORY_MODEL_FILE;
  if (!path) throw new Error("STATISTICAL_MODEL_NOT_CONFIGURED");
  const text = readFileSync(path, "utf8");
  if (text.length > 256_000) throw new Error("MODEL_TOO_LARGE");
  const a = modelArtifact(JSON.parse(text));
  return { adapter: logisticAdapter(a), threshold: a.threshold };
}
