// Server-only research boundary. Do not import this module from client code.
import { createHmac, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { cookieFromHeader } from "./session";
import type { SensorSample } from "./fingerprint-coverage";

export const RESEARCH_COOKIE = "hmrc_fingerprint_research";
export type ResearchBinding = { session_id: string; run_id: string; attempt_id: string; expires_at: string; nonce: string; issued_at: number };
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function researchEnabled() { return process.env.FINGERPRINT_RESEARCH_ENABLED === "true" && process.env.PUBLIC_MODE !== "true"; }
export function sameResearchOrigin(req: Request) { return req.headers.get("origin") === new URL(config.appUrl).origin; }

async function observatory(path: string, method = "GET", body?: unknown) {
  const url = process.env.OBSERVATORY_INTERNAL_URL;
  const key = process.env.OBSERVATORY_COLLECTION_KEY;
  if (!url || !key) throw new Error("RESEARCH_NOT_CONFIGURED");
  const credentials: Record<string, string> = path === "/api/research/observations" ? { authorization: `Bearer ${key}` } : { "x-collection-key": key };
  return fetch(new URL(path, url), { method, headers: { "content-type": "application/json", ...credentials },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000), cache: "no-store" });
}

export async function enrolResearch(enrollment_token: string): Promise<ResearchBinding> {
  const res = await observatory("/api/research/enrolments/claim", "POST", { enrollment_token });
  if (!res.ok) throw new Error("ENROLMENT_REFUSED");
  const data = await res.json();
  const expires = Date.parse(data.expires_at);
  if (!uuid(data.session_id) || !uuid(data.run_id) || !uuid(data.attempt_id) || !Number.isFinite(expires) || expires <= Date.now()) throw new Error("INVALID_BINDING");
  return { session_id: data.session_id, run_id: data.run_id, attempt_id: data.attempt_id,
    expires_at: new Date(Math.min(expires, Date.now() + 60 * 60_000)).toISOString(), nonce: randomUUID(), issued_at: Date.now() };
}

export async function signResearch(binding: ResearchBinding) {
  return new SignJWT({ ...binding, typ: "fingerprint-research" }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("hmrc-fingerprint-research").setIssuedAt().setExpirationTime(Math.floor(Date.parse(binding.expires_at) / 1000)).sign(config.sessionSecret);
}

export async function readResearch(req: Request): Promise<ResearchBinding | null> {
  const token = cookieFromHeader(req.headers.get("cookie"), RESEARCH_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { issuer: "hmrc-fingerprint-research" });
    if (payload.typ !== "fingerprint-research" || !uuid(payload.session_id) || !uuid(payload.run_id) || !uuid(payload.attempt_id) || !uuid(payload.nonce)) return null;
    return payload as unknown as ResearchBinding;
  } catch { return null; }
}

export async function activeResearch(binding: ResearchBinding) {
  const res = await observatory(`/api/research/sessions/${binding.session_id}`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.session_id === binding.session_id && data.run_id === binding.run_id && data.attempt_id === binding.attempt_id && Date.parse(data.expires_at) > Date.now();
}

export async function verifyVendor(sample: SensorSample, binding: ResearchBinding): Promise<"unverified_client_claim" | "vendor_verified" | "verification_failed" | "verification_unavailable"> {
  const secret = process.env.FINGERPRINT_SERVER_API_KEY;
  if (!secret || sample.state !== "identified") return "unverified_client_claim";
  try {
    const response = await fetch(`https://eu.api.fpjs.io/v4/events/${encodeURIComponent(sample.event_id!)}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return response.status === 404 ? "verification_failed" : "verification_unavailable";
    const data = await response.json();
    // Existence alone is insufficient: bind the vendor's server-held linked ID
    // and event time to this enrolled browser session, and compare any visitor claim.
    return data.event_id === sample.event_id && data.linked_id === binding.session_id &&
      typeof data.timestamp === "number" && data.timestamp >= binding.issued_at - 5000 &&
      data.timestamp <= Math.min(Date.now() + 5000, Date.parse(binding.expires_at)) &&
      (!sample.visitor_id || data.identification?.visitor_id === sample.visitor_id) ? "vendor_verified" : "verification_failed";
  } catch { return "verification_unavailable"; }
}

export async function appendSensor(sample: SensorSample, binding: ResearchBinding, verification: string) {
  const key = process.env.RESEARCH_PSEUDONYM_KEY;
  if (!key || key.length < 32) throw new Error("PSEUDONYM_KEY_REQUIRED");
  const known = <T>(value: T) => ({ value, status: "known", provenance: "source_record" });
  const missing = () => ({ value: null, status: "missing", provenance: "not_recorded" });
  const pseudo = (namespace: string, value: string) => ({ value: createHmac("sha256", key).update(`hmrc:${namespace}:${value}`).digest("hex"), status: "inferred", provenance: "pseudonymised" });
  // A separate immutable observation, not an update to the service event. No
  // taxpayer identifier, raw visitor ID, client-selected run ID or truth label.
  const event = {
    schema_version: 1, source_service: "hmrc", source_event_id: `sensor:${randomUUID()}`, event_kind: "browser_sensor",
    occurred_at: { value: new Date().toISOString(), status: "known", provenance: "source_clock" }, run_id: known(binding.run_id),
    correlation: { request_id: known(randomUUID()), transaction_id: missing(), session_id: known(binding.session_id), delegate_check_id: missing() },
    observed: { lane: "UNKNOWN", signature_verified: missing(), latency_ms: missing() },
    outcome: { decision: "OBSERVED", outcome_class: missing(), cost_class: missing() },
    browser_sensor: { status: sample.state, provenance: verification === "vendor_verified" ? "vendor_verified" : sample.state === "not_run" ? "not_collected" : "unverified_client_claim",
      ...(sample.event_id ? { event_id: pseudo("fingerprint-event", sample.event_id) } : {}),
      ...(sample.visitor_id ? { visitor_id: pseudo("fingerprint-visitor", sample.visitor_id) } : {}) },
  };
  const response = await observatory("/api/research/observations", "POST", event);
  if (!response.ok) throw new Error("COLLECTION_UNAVAILABLE");
  return event.source_event_id;
}
