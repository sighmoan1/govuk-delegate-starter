import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const Source = z.enum(["hmrc", "delegate"]);
export type SourceService = z.infer<typeof Source>;
const text = z.string().max(128);
const observed = <T extends z.ZodType>(value: T) => z.object({
  value: value.nullable(), status: z.enum(["known", "inferred", "missing"]),
  provenance: z.enum(["source_record", "source_clock", "client_claim", "pseudonymised", "not_recorded"]),
}).strict().refine(v => { const field = v as unknown as { value: unknown; status: string }; return field.status === "missing" ? field.value === null : field.value !== null; }, "Missingness and value must agree");
export const Event = z.object({
  schema_version: z.literal(1), source_service: Source, source_event_id: text.min(1),
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
export type ResearchEvent = z.infer<typeof Event>;
export const Page = z.object({ schema_version: z.literal(1), source_service: Source,
  events: z.array(Event).max(200), next_cursor: z.string().max(1024).nullable() }).strict();
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
