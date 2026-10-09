import { createHash } from "node:crypto";
import { Event, type ResearchEvent } from "@prototype/research-feed";

export const EVIDENCE_SCHEMA = "observatory-evidence/1" as const;
export const FEATURE_NAMES = ["signature_verified", "latency_ms", "browser_present", "vendor_verified"] as const;
export type FeatureName = typeof FEATURE_NAMES[number];
export type Signal = { value: boolean | number | null; missingness: "observed" | "not_observed" | "not_configured" | "error"; provenance: string; confidence: number | null };
export type EvidenceRecord = { schema: typeof EVIDENCE_SCHEMA; source: "hmrc" | "delegate"; source_event_id: string; collection_method: string; observed_at: string; sensor: { identifier: string; version: string; config: Record<string, string> }; refs: { session: string | null; transaction: string | null }; sensitivity: "synthetic_pseudonymous"; signals: Record<FeatureName, Signal> };
export type ExperimentConfig = { schema: "observatory-classifier-config/1"; adapter: string; version: string; model: string; question: string; prompt: string | null; threshold: number; feature_set: FeatureName[]; parameters: Record<string, string> };
export type Decision = { status: "classified" | "abstain" | "error"; class: string | null; score: number | null; reason: string; raw_result_ref: string | null; estimated_cost: { amount: number | null; currency: "USD" } };
export type ClassificationResult = Decision & { schema: "observatory-classification/1"; source: string; source_version: string; question: string; prompt: string | null; threshold: number; feature_set: FeatureName[]; missingness: Partial<Record<FeatureName, Signal["missingness"]>>; latency_ms: number; model: string; config_digest: string; input_digest: string };
export interface SensorAdapter { identifier: string; version: string; schema: typeof EVIDENCE_SCHEMA; config: Record<string, string>; collect(event: ResearchEvent): Promise<EvidenceRecord> }
export interface ClassifierAdapter { identifier: string; version: string; schema: "observatory-classifier-config/1"; model: string; feature_set: FeatureName[]; classify(signals: Partial<Record<FeatureName, Signal>>, config: Readonly<ExperimentConfig>): Promise<Decision> }

// Canonical JSON hashes permit independently comparing exact frozen inputs/configs.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const signal = (value: boolean | number | null, missingness: Signal["missingness"], provenance: string): Signal => ({ value, missingness, provenance, confidence: null });
export const mockSensor: SensorAdapter = {
  identifier: "source-observation", version: "1.0.0", schema: EVIDENCE_SCHEMA, config: { mapping: "allowlisted-source-fields/1" },
  async collect(input) {
    const e = Event.parse(input); const b = e.browser_sensor;
    const missingness = b.status === "not_run" ? "not_configured" : b.status === "error" ? "error" : "not_observed";
    const record: EvidenceRecord = { schema: EVIDENCE_SCHEMA, source: e.source_service, source_event_id: e.source_event_id, collection_method: "immutable_source_feed", observed_at: e.occurred_at.value,
      sensor: { identifier: this.identifier, version: this.version, config: { ...this.config } },
      refs: { session: e.correlation.session_id.value, transaction: e.correlation.transaction_id.value }, sensitivity: "synthetic_pseudonymous",
      signals: { signature_verified: signal(e.observed.signature_verified.value, e.observed.signature_verified.value === null ? "not_observed" : "observed", e.observed.signature_verified.provenance),
        latency_ms: signal(e.observed.latency_ms.value, e.observed.latency_ms.value === null ? "not_observed" : "observed", e.observed.latency_ms.provenance),
        browser_present: signal(b.status === "identified" ? true : null, b.status === "identified" ? "observed" : missingness, b.provenance),
        vendor_verified: signal(b.status === "identified" ? b.provenance === "vendor_verified" : null, b.status === "identified" ? "observed" : missingness, b.provenance) } };
    return record;
  },
};
const abstain = (reason: string): Decision => ({ status: "abstain", class: null, score: null, reason, raw_result_ref: null, estimated_cost: { amount: 0, currency: "USD" } });
export const stubRule: ClassifierAdapter = {
  identifier: "stub-rule", version: "1.0.0", schema: "observatory-classifier-config/1", model: "verified-signature-observation-v1", feature_set: ["signature_verified"],
  async classify(signals, config) {
    const s = signals.signature_verified;
    if (!s || s.missingness !== "observed") return abstain("SIGNATURE_NOT_OBSERVED");
    if (s.value !== true) return abstain("NO_VERIFIED_AGENT_IDENTITY");
    if (config.threshold > 1) return abstain("BELOW_THRESHOLD");
    return { status: "classified", class: "VERIFIED_SIGNATURE", score: 1, reason: "SOURCE_RECORDED_SIGNATURE_VERIFIED", raw_result_ref: null, estimated_cost: { amount: 0, currency: "USD" } };
  },
};
export const unavailablePaid: ClassifierAdapter = {
  identifier: "unavailable-paid", version: "1.0.0", schema: "observatory-classifier-config/1", model: "unconfigured-paid-detector", feature_set: [...FEATURE_NAMES],
  async classify() { return { ...abstain("DETECTOR_NOT_CONFIGURED"), estimated_cost: { amount: null, currency: "USD" } }; },
};
export function experiment(adapter: ClassifierAdapter, threshold = 0.5): ExperimentConfig {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("INVALID_THRESHOLD");
  return { schema: adapter.schema, adapter: adapter.identifier, version: adapter.version, model: adapter.model, question: "Is a verified agent signature recorded in the selected source observation?", prompt: null, threshold, feature_set: [...adapter.feature_set], parameters: { interpretation: "identity_observation_only_not_execution_truth" } };
}
function validSignals(record: EvidenceRecord) {
  if (record.schema !== EVIDENCE_SCHEMA || Object.keys(record.signals).some(k => !FEATURE_NAMES.includes(k as FeatureName))) return false;
  return FEATURE_NAMES.every(k => {
    const s = record.signals[k]; if (!s || !["observed","not_observed","not_configured","error"].includes(s.missingness)) return false;
    if (s.missingness !== "observed") return s.value === null;
    return k === "latency_ms" ? typeof s.value === "number" && Number.isFinite(s.value) && s.value >= 0 : typeof s.value === "boolean";
  });
}
export async function classifyFrozen(record: EvidenceRecord, config: ExperimentConfig, adapter: ClassifierAdapter): Promise<ClassificationResult> {
  const start = performance.now(); const selected: Partial<Record<FeatureName, Signal>> = {};
  // This is the ONLY adapter input. No IDs, lane/outcomes, run tags, evaluator data or generation prompts.
  for (const k of config.feature_set) if (FEATURE_NAMES.includes(k)) selected[k] = structuredClone(record.signals[k]);
  const baseline = { schema: "observatory-classification/1" as const, source: adapter.identifier, source_version: adapter.version, question: config.question, prompt: config.prompt, threshold: config.threshold, feature_set: [...config.feature_set], missingness: Object.fromEntries(Object.entries(selected).map(([k,s]) => [k,s?.missingness ?? "not_observed"])), model: adapter.model, config_digest: digest(config), input_digest: digest(record) };
  let decision: Decision;
  try {
    if (!validSignals(record)) decision = { ...abstain("INCONSISTENT_SIGNALS"), status: "error" };
    else if (config.adapter !== adapter.identifier || config.version !== adapter.version || config.model !== adapter.model || config.schema !== adapter.schema || canonical(config.feature_set) !== canonical(adapter.feature_set) || !Number.isFinite(config.threshold) || config.threshold < 0 || config.threshold > 1) decision = { ...abstain("ADAPTER_CONFIG_MISMATCH"), status: "error" };
    else {
      decision = await adapter.classify(Object.freeze(selected), Object.freeze(structuredClone(config)));
      if (!["classified","abstain","error"].includes(decision.status) || (decision.status === "classified" ? !decision.class || decision.score === null || !Number.isFinite(decision.score) || decision.score < 0 || decision.score > 1 : decision.class !== null || decision.score !== null)) throw new Error("INVALID_ADAPTER_RESULT");
    }
  } catch { decision = { ...abstain("ADAPTER_ERROR"), status: "error" }; }
  return { ...baseline, ...decision, latency_ms: Math.max(0, performance.now() - start) };
}
