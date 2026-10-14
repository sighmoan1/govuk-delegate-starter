import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const Source = z.enum(["hmrc", "delegate", "whenisbins_connector"]);
export type SourceService = z.infer<typeof Source>;
const text = z.string().max(128);
const observed = <T extends z.ZodType>(value: T) => z.object({
  value: value.nullable(), status: z.enum(["known", "inferred", "missing"]),
  provenance: z.enum(["source_record", "source_clock", "client_claim", "pseudonymised", "not_recorded"]),
}).strict().refine(v => { const field = v as unknown as { value: unknown; status: string }; return field.status === "missing" ? field.value === null : field.value !== null; }, "Missingness and value must agree");
export const LegacyEvent = z.object({
  schema_version: z.literal(1), source_service: z.enum(["hmrc", "delegate"]), source_event_id: text.min(1),
  event_kind: z.enum(["service_request", "authority_check", "browser_sensor"]).default("service_request"),
  occurred_at: z.object({ value: z.iso.datetime(), status: z.literal("known"), provenance: z.literal("source_clock") }).strict(), run_id: observed(text),
  correlation: z.object({ request_id: observed(text), transaction_id: observed(text),
    session_id: observed(text), delegate_check_id: observed(text) }).strict(),
  observed: z.object({ lane: z.enum(["AUTHENTICATED_HUMAN", "AUTHORISED_AGENT", "DECLARED_AGENT", "UNTRUSTED", "UNKNOWN"]),
    signature_verified: observed(z.boolean()), latency_ms: observed(z.number().finite().nonnegative()) }).strict(),
  outcome: z.object({ decision: z.enum(["ALLOW", "DENY", "ALLOWED", "REFUSED", "THROTTLED", "CHALLENGED", "OBSERVED"]),
    outcome_class: observed(z.enum(["UNIQUE_OPERATION", "REPLAY", "BUSINESS_REFUSAL", "INVALID_REQUEST", "TECHNICAL_THROTTLE", "UNAVAILABLE", "AUTHORITY_REFUSAL"])),
    cost_class: observed(z.enum(["read", "status_poll", "write", "expensive_query"])) }).strict(),
  browser_sensor: z.object({ status: z.enum(["not_run", "blocked", "error", "missing", "identified"]),
    provenance: z.enum(["not_collected", "unverified_client_claim", "vendor_verified"]),
    event_id: observed(z.string().regex(/^[0-9a-f]{64}$/)).optional(),
    visitor_id: observed(z.string().regex(/^[0-9a-f]{64}$/)).optional() }).strict().superRefine((sensor, ctx) => {
      const hasEvent = sensor.event_id?.value != null;
      const hasVisitor = sensor.visitor_id?.value != null;
      if (sensor.status === "identified" && (!hasEvent || sensor.provenance === "not_collected"))
        ctx.addIssue({ code: "custom", message: "Identified sensor needs observed event evidence" });
      if (sensor.provenance === "vendor_verified" && (sensor.status !== "identified" || !hasEvent))
        ctx.addIssue({ code: "custom", message: "Verified vendor evidence needs identified event" });
      if (["missing", "not_run"].includes(sensor.status) && (hasEvent || hasVisitor))
        ctx.addIssue({ code: "custom", message: "Missing sensor cannot contain identifiers" });
      for (const field of [sensor.event_id, sensor.visitor_id]) if (field?.value != null && (field.status !== "inferred" || field.provenance !== "pseudonymised"))
        ctx.addIssue({ code: "custom", message: "Vendor identifiers must be marked derived pseudonyms" });
    }),
}).strict();
// V2 is deliberately limited to our connector, never upstream WhenIsBins telemetry.
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const opaque = observed(digest).superRefine((field, ctx) => {
  if (field.value !== null && (field.status !== "inferred" || field.provenance !== "pseudonymised"))
    ctx.addIssue({ code: "custom", message: "Correlation requires derived source pseudonyms" });
});
export const WhenIsBinsEvidence = z.object({
  action: z.enum(["lookup", "email_signup", "email_cancel", "schedule"]),
  stage: z.enum(["admitted", "lookup_completed", "subscription_pending", "subscription_confirmed", "mail_delivery_observed", "cancellation_confirmed", "schedule_registered", "scheduled_occurrence", "refused", "replay", "provider_unavailable"]),
  task_id: opaque, occurrence_id: opaque, outbound_call_id: opaque, effect_id: opaque,
  upstream_agent_declared: observed(z.boolean()),
}).strict();
export const WhenIsBinsEvent = LegacyEvent.extend({
  schema_version: z.literal(2), source_service: z.literal("whenisbins_connector"),
  source_event_id: z.union([digest, z.uuid()]),
  run_id: observed(z.union([digest, z.uuid()])),
  correlation: z.object({ request_id: opaque, transaction_id: opaque, session_id: opaque, delegate_check_id: opaque }).strict(),
  whenisbins: WhenIsBinsEvidence,
}).strict().superRefine((event, ctx) => {
  if (event.browser_sensor.status !== "not_run" || event.browser_sensor.provenance !== "not_collected")
    ctx.addIssue({ code: "custom", message: "Connector cannot assert upstream browser evidence" });
  if (event.whenisbins.stage === "refused" && !["DENY", "REFUSED", "THROTTLED", "CHALLENGED"].includes(event.outcome.decision))
    ctx.addIssue({ code: "custom", message: "Refusal stage requires refused decision" });
});
export const AuxiliarySensorEvent = LegacyEvent.extend({
  schema_version: z.literal(3), source_service: z.literal('hmrc'), event_kind: z.literal('browser_sensor'),
  auxiliary_sensor: z.object({
    botd: z.object({ status: z.enum(['observed', 'not_run', 'blocked', 'error']), value: z.boolean().nullable(), provenance: z.literal('client_claim'), version: z.literal('2.0.0') }).strict().refine(s => s.status === 'observed' ? s.value !== null : s.value === null),
    http: z.object({ sample_requests_in_window: z.number().int().min(1).max(100000), window_seconds: z.literal(60), counter_scope: z.literal('process_local_study_sample_posts'), sec_fetch_same_origin: z.boolean().nullable(), provenance: z.literal('server_observed_headers_and_counter') }).strict(),
    smart_signals: z.object({ status: z.literal('not_requested'), reason: z.literal('PAID_ENTITLEMENT_NOT_VALIDATED') }).strict(),
  }).strict(),
}).strict();
export const Event = z.union([LegacyEvent, WhenIsBinsEvent, AuxiliarySensorEvent]);
export type ResearchEvent = z.infer<typeof Event>;
export type WhenIsBinsResearchEvent = z.infer<typeof WhenIsBinsEvent>;
export const Page = z.union([
  z.object({ schema_version: z.literal(1), source_service: z.enum(["hmrc", "delegate"]), events: z.array(LegacyEvent).max(200), next_cursor: z.string().max(1024).nullable() }).strict(),
  z.object({ schema_version: z.literal(2), source_service: z.literal("whenisbins_connector"), events: z.array(WhenIsBinsEvent).max(200), next_cursor: z.string().max(1024).nullable() }).strict(),
]);
export type ResearchPage = z.infer<typeof Page>;
export const missing = () => ({ value: null, status: "missing" as const, provenance: "not_recorded" as const });
export const known = <T>(value: T) => value == null ? missing() : ({ value, status: "known" as const, provenance: "source_record" as const });
export function pseudonym(source: SourceService, namespace: string, value: string | null | undefined, key: string) {
  return value ? { value: createHmac("sha256", key).update(`${source}:${namespace}:${value}`).digest("hex"), status: "inferred" as const, provenance: "pseudonymised" as const } : missing();
}
export function runId(source: SourceService, value: string | null | undefined, key: string) {
  // Even a UUID is only a caller claim; the protected ledger performs the join.
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? { value, status: "inferred" as const, provenance: "client_claim" as const }
    : pseudonym(source, "run", value, key);
}
export function feedAccess(req: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.RESEARCH_FEED_KEY, hashKey = env.RESEARCH_PSEUDONYM_KEY;
  if (env.RESEARCH_FEED_ENABLED !== "true" || env.PUBLIC_MODE === "true" || !key || !hashKey) return false;
  return bearerMatches(req, key);
}
export function bearerMatches(req: Request, key: string | undefined): boolean {
  if (!key) return false;
  const presented = req.headers.get("authorization") ?? "";
  const a = Buffer.from(presented), b = Buffer.from(`Bearer ${key}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function feedQuery(req: Request, source: SourceService) {
  const params = new URL(req.url).searchParams;
  const size = params.get("limit") ?? "100";
  if (!/^[0-9]+$/.test(size) || Number(size) < 1 || Number(size) > 200) throw new Error("INVALID_QUERY");
  const cursor = params.get("cursor");
  let after: string | undefined;
  if (cursor) {
    if (cursor.length > 1024) throw new Error("INVALID_CURSOR");
    const decoded = z.object({ version: z.literal(1), source: Source, after: text.min(1) }).strict()
      .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    if (decoded.source !== source) throw new Error("INVALID_CURSOR");
    after = decoded.after;
  }
  return { after, limit: Number(size) };
}
export function nextCursor(source: SourceService, lastId: string) {
  return Buffer.from(JSON.stringify({ version: 1, source, after: lastId })).toString("base64url");
}

export interface WhenIsBinsObservationInput {
  sourceEventId: string; occurredAt: string; action: z.infer<typeof WhenIsBinsEvidence>["action"];
  stage: z.infer<typeof WhenIsBinsEvidence>["stage"]; decision: ResearchEvent["outcome"]["decision"];
  requestId?: string | null; delegateCheckId?: string | null; taskId?: string | null;
  occurrenceId?: string | null; outboundCallId?: string | null; effectId?: string | null;
  runId?: string | null; authorityVerified?: boolean | null; signatureVerified?: boolean | null; upstreamAgentDeclared?: boolean | null;
  latencyMs?: number | null; outcomeClass?: ResearchEvent["outcome"]["outcome_class"]["value"];
  costClass?: ResearchEvent["outcome"]["cost_class"]["value"];
}
export function whenisbinsObservation(input: WhenIsBinsObservationInput, pseudonymKey: string): WhenIsBinsResearchEvent {
  if (!pseudonymKey) throw new Error("PSEUDONYM_KEY_REQUIRED");
  const p = (namespace: string, value: string | null | undefined) => pseudonym("whenisbins_connector", namespace, value, pseudonymKey);
  return WhenIsBinsEvent.parse({ schema_version: 2, source_service: "whenisbins_connector", source_event_id: input.sourceEventId,
    occurred_at: { value: input.occurredAt, status: "known", provenance: "source_clock" }, run_id: runId("whenisbins_connector", input.runId, pseudonymKey),
    correlation: { request_id: p("request", input.requestId), transaction_id: p("effect", input.effectId), session_id: missing(), delegate_check_id: p("check", input.delegateCheckId) },
    observed: { lane: input.authorityVerified === true ? "AUTHORISED_AGENT" : input.signatureVerified === true ? "DECLARED_AGENT" : "UNKNOWN", signature_verified: known(input.signatureVerified), latency_ms: known(input.latencyMs) },
    outcome: { decision: input.decision, outcome_class: known(input.outcomeClass), cost_class: known(input.costClass) },
    browser_sensor: { status: "not_run", provenance: "not_collected" },
    whenisbins: { action: input.action, stage: input.stage, task_id: p("task", input.taskId), occurrence_id: p("occurrence", input.occurrenceId),
      outbound_call_id: p("outbound", input.outboundCallId), effect_id: p("effect", input.effectId), upstream_agent_declared: known(input.upstreamAgentDeclared) },
  });
}
