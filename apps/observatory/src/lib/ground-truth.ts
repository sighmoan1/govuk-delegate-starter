import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const EXECUTION_CLASSES = ["HUMAN_OPERATED", "HUMAN_AI_ASSISTED", "SCRIPTED_AUTOMATION", "AI_AGENT_BROWSER", "AI_AGENT_API"] as const;
export type ExecutionClass = typeof EXECUTION_CLASSES[number];
export class ResearchError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export const tokenHash = (s: string) => createHash("sha256").update(s).digest("hex");
export function gate(req: Request, kind: "evaluation" | "collection", env: Record<string, string | undefined> = process.env): number | null {
  if (env.PUBLIC_MODE === "true") return 503;
  if (env.OBSERVATORY_EVALUATION_KEY && env.OBSERVATORY_EVALUATION_KEY === env.OBSERVATORY_COLLECTION_KEY) return 503;
  const key = env[kind === "evaluation" ? "OBSERVATORY_EVALUATION_KEY" : "OBSERVATORY_COLLECTION_KEY"];
  if (!key || key.length < 32) return 503;
  const got = req.headers.get(kind === "evaluation" ? "x-evaluation-key" : "x-collection-key");
  return got && timingSafeEqual(Buffer.from(tokenHash(got)), Buffer.from(tokenHash(key))) ? null : 401;
}
export function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResearchError("INVALID_BODY"); return value as Record<string, unknown>; }
export function fields(v: Record<string, unknown>, allowed: string[]) { if (Object.keys(v).some(k => !allowed.includes(k))) throw new ResearchError("UNEXPECTED_FIELD"); }
export function text(v: unknown, max = 80): string { if (typeof v !== "string" || !v.trim() || v.length > max) throw new ResearchError("INVALID_TEXT"); return v; }
export function uuid(v: unknown): string { const s = text(v); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) throw new ResearchError("OPAQUE_UUID_REQUIRED"); return s; }
export function sha(v: unknown, length = 64): string { const s = text(v); if (!new RegExp(`^[0-9a-f]{${length}}$`).test(s)) throw new ResearchError("INVALID_DIGEST"); return s; }
export function runInput(value: unknown) {
  const v = object(value); fields(v, ["mode", "protocol_version", "source_commit", "seed", "study_owner", "evidence_digest"]);
  if (v.mode !== "CONTROLLED" && v.mode !== "MONITORING") throw new ResearchError("INVALID_MODE");
  return { id: randomUUID(), mode: v.mode, protocolVersion: text(v.protocol_version), sourceCommit: sha(v.source_commit, 40), seed: text(v.seed), studyOwner: text(v.study_owner), evidenceDigest: v.evidence_digest ? sha(v.evidence_digest) : null };
}
export function attemptInput(value: unknown, mode: string) {
  const v = object(value); fields(v, ["run_id", "intent_id"]);
  return { id: randomUUID(), runId: uuid(v.run_id), intentId: v.intent_id ? uuid(v.intent_id) : randomUUID(), status: mode === "MONITORING" ? "UNLABELLED" : "PLANNED" };
}
export function verifiedProvenance(value: unknown, mode: string) {
  if (mode !== "CONTROLLED") throw new ResearchError("MONITORING_HAS_NO_TRUTH");
  const v = object(value); fields(v, ["origin", "execution_class", "trace_digest", "observed_at", "runner", "source_commit", "observer_pseudonym", "consent_ref", "manual_operation_attested", "model_tool_version"]);
  if (!EXECUTION_CLASSES.includes(v.execution_class as ExecutionClass)) throw new ResearchError("INVALID_EXECUTION_CLASS");
  const executionClass = v.execution_class as ExecutionClass;
  sha(v.trace_digest); const observed = new Date(text(v.observed_at));
  if (!Number.isFinite(observed.getTime()) || observed > new Date()) throw new ResearchError("INVALID_OBSERVATION_TIME");
  if (executionClass === "HUMAN_OPERATED" || executionClass === "HUMAN_AI_ASSISTED") {
    if (v.origin !== "RESEARCH_OBSERVER" || v.manual_operation_attested !== true) throw new ResearchError("HUMAN_EXECUTION_EVIDENCE_REQUIRED");
    text(v.observer_pseudonym); sha(v.consent_ref);
    if (v.runner !== undefined || v.source_commit !== undefined) throw new ResearchError("RUNNER_CANNOT_ATTEST_HUMAN");
  } else if (executionClass === "SCRIPTED_AUTOMATION") {
    if (v.origin !== "CONTROLLED_RUNNER") throw new ResearchError("RUNNER_EVIDENCE_REQUIRED");
    text(v.runner); sha(v.source_commit, 40);
  } else {
    if (v.origin !== "AGENT_EXECUTION_TRACE") throw new ResearchError("AGENT_TRACE_REQUIRED");
    text(v.model_tool_version); sha(v.source_commit, 40);
  }
  return { executionClass, provenance: v, status: "VERIFIED", verifiedAt: new Date() };
}
export const EFFECT_CLASSES = ["REQUEST_ONLY", "UNIQUE_OPERATION", "REPLAY", "REFUSAL"] as const;
export function bindingInput(value: unknown) {
  const v = object(value); fields(v, ["attempt_id", "source_service", "source_event_id", "operation_id", "effect_class", "effect_evidence_digest"]);
  if (!['hmrc', 'delegate'].includes(String(v.source_service)) || !EFFECT_CLASSES.includes(v.effect_class as typeof EFFECT_CLASSES[number])) throw new ResearchError("INVALID_SOURCE_BINDING");
  if ((v.effect_class === "UNIQUE_OPERATION" || v.effect_class === "REPLAY") && !v.operation_id) throw new ResearchError("OPERATION_ID_REQUIRED");
  return { id: randomUUID(), attemptId: uuid(v.attempt_id), sourceService: String(v.source_service), sourceEventId: text(v.source_event_id, 120), operationId: v.operation_id ? uuid(v.operation_id) : null, effectClass: String(v.effect_class), effectEvidenceDigest: v.effect_evidence_digest ? sha(v.effect_evidence_digest) : null };
}
export function publicSession(s: { id: string; expiresAt: Date; attempt: { id: string; runId: string } }) {
  return { session_id: s.id, run_id: s.attempt.runId, attempt_id: s.attempt.id, expires_at: s.expiresAt.toISOString() };
}
export function counts(bindings: Array<{ sourceService: string; sourceEventId: string; effectClass: string; operationId: string | null; eventKind: string }>) {
  const uniqueEvents = [...new Map(bindings.map(b => [`${b.sourceService}:${b.sourceEventId}`, b])).values()];
  return { requests: uniqueEvents.filter(b => b.sourceService === 'hmrc' && b.eventKind === 'service_request').length, unique_service_operations: new Set(uniqueEvents.filter(b => b.sourceService === 'hmrc' && b.eventKind === 'service_request' && b.effectClass === 'UNIQUE_OPERATION').map(b => b.operationId)).size, replays: uniqueEvents.filter(b => b.sourceService === 'hmrc' && b.eventKind === 'service_request' && b.effectClass === 'REPLAY').length, refusals: uniqueEvents.filter(b => b.sourceService === 'hmrc' && b.eventKind === 'service_request' && b.effectClass === 'REFUSAL').length };
}

// Authority/signature evidence remains an observation, never an execution-class label.
export function validateBindingAgainstSource(binding: ReturnType<typeof bindingInput>, snapshot: unknown, attempt: {status: string; provenance: unknown}) {
  const event = object(snapshot), outcome = object(event.outcome), observed = object(event.observed);
  const sourceClass = object(outcome.outcome_class).value, cost = object(outcome.cost_class).value;
  if (event.source_service !== binding.sourceService || event.source_event_id !== binding.sourceEventId) throw new ResearchError("SOURCE_ID_MISMATCH", 409);
  const refused = ['DENY','REFUSED','THROTTLED','CHALLENGED'].includes(String(outcome.decision));
  const expected = binding.sourceService !== 'hmrc' ? 'REQUEST_ONLY' : refused ? 'REFUSAL' : sourceClass === 'REPLAY' ? 'REPLAY' : sourceClass === 'UNIQUE_OPERATION' && cost === 'write' ? 'UNIQUE_OPERATION' : 'REQUEST_ONLY';
  if (binding.effectClass !== expected) throw new ResearchError("SOURCE_EFFECT_CLASS_MISMATCH", 409);
  if (binding.effectClass === 'UNIQUE_OPERATION' || binding.effectClass === 'REPLAY') {
    const evidence = object(attempt.provenance);
    if (attempt.status !== 'VERIFIED' || !binding.effectEvidenceDigest || binding.effectEvidenceDigest !== evidence.trace_digest) throw new ResearchError("INDEPENDENT_EFFECT_EVIDENCE_REQUIRED", 409);
  }
  return { eventKind: String(event.event_kind), identityObservation: { lane: observed.lane, signature_verified: observed.signature_verified } };
}
