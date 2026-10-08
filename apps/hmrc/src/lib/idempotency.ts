// Transport idempotency for HMRC's mutating submissions.
//
// Three different things can look like "the same request twice":
//   1. a retry of the same attempt (same Idempotency-Key, same content):
//      answered from the stored first outcome, nothing runs again;
//   2. an equivalent claim under a different key: not a retry at all, so it meets
//      HMRC's business-duplicate rules in capacity.ts exactly as before;
//   3. a genuine amendment (new evidence): a new key and a new fingerprint.
//
// The record is written in the same database transaction as the claim or answer
// (see withPrincipalCapacity). There is no PENDING state to get stuck: a crash,
// timeout or error rolls the whole attempt back, and the retry is a first try.
import { createHash } from "node:crypto";

/** A fingerprint of the evidence; a resubmission needs a different one. */
export const fingerprint = (evidence: unknown) =>
  typeof evidence === "string" && evidence.trim() ? createHash("sha256").update(evidence.trim().toLowerCase()).digest("hex").slice(0, 32) : null;

/** Capabilities whose Idempotency-Key is honoured. Others ignore the header. */
export const IDEMPOTENT_CAPABILITIES: ReadonlySet<string> = new Set(["claim_job_expenses", "respond_to_query"]);

const KEY_PATTERN = /^[\x21-\x7e]{1,128}$/; // visible ASCII, no spaces, up to 128 characters

export const isValidKey = (key: string) => KEY_PATTERN.test(key);

/** A website form's stable submission identifier, as a key. Namespaced so it can't collide with an API client's key. */
export function formKey(submissionId: unknown): string | null {
  return typeof submissionId === "string" && /^[0-9a-fA-F-]{16,64}$/.test(submissionId) ? `form:${submissionId.toLowerCase()}` : null;
}

/** The parts of the request that give it meaning, reduced to what HMRC would treat as the same request. */
export function normalisePayload(capability: string, body: Record<string, unknown>): Record<string, unknown> {
  if (capability === "claim_job_expenses") return { evidence: fingerprint(body.evidence) };
  if (capability === "respond_to_query") {
    return {
      query_id: typeof body.query_id === "string" ? body.query_id : null,
      answer: typeof body.answer === "string" ? body.answer.trim() : null,
      confirmed_by_person: body.confirmed_by_person === true,
    };
  }
  return body;
}

const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v ?? null);

export const payloadDigest = (capability: string, body: Record<string, unknown>) =>
  createHash("sha256").update(canonical({ operation: capability, payload: normalisePayload(capability, body) })).digest("hex");
