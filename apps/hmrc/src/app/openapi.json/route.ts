import { NextResponse } from "next/server";
import { config } from "@/lib/config";

const action = (summary: string, method: "get" | "post") => ({
  [method]: {
    summary,
    security: [{ agentToken: [] }],
    parameters: [{ name: "x-principal-id", in: "header", required: true, schema: { type: "string" }, description: "The person you act for, as GOV.UK Delegate told you when they approved." }],
    responses: {
      "200": { description: "Done. The body includes tell_the_person: pass it on. The person can review, and change or remove your access, on GOV.UK." },
      "403": { description: "Refused: PERMISSION_MISSING, AUTHORISATION_REVOKED, NO_AUTHORISATION, STEP_UP_REQUIRED (with step_up.user_code) or AGENT_NOT_AUTHORISED" },
      "400": { description: "INVALID_REQUEST or INVALID_IDEMPOTENCY_KEY: the request itself is wrong. kind is REQUEST_ERROR." },
      "404": { description: "QUERY_NOT_FOUND: HMRC has not asked this person that question. kind is BUSINESS_REFUSAL." },
      "409": { description: "A business refusal (kind BUSINESS_REFUSAL): DUPLICATE_SUBMISSION, NEW_EVIDENCE_REQUIRED, or CAPACITY_EXCEEDED (the person already has the most open cases, or just changed the refund account; provisional demo policy). Also IDEMPOTENCY_KEY_REUSED, and STEP_UP_IN_USE / STEP_UP_ALREADY_USED for approval-gated changes (Retry-After says when to try again). Waiting does not change these, and retrying will not help. They apply to the person however many agents act for them." },
      "429": { description: "RATE_LIMITED (kind TECHNICAL_THROTTLE): too much traffic, not a decision about anyone's entitlement and never a business refusal. Nothing was changed. Wait Retry-After seconds, then send the same request (with the same Idempotency-Key). The body says which scope (operator, principal or service) and cost class (read, status_poll, write, expensive_query) was limited, and entitlement_affected is false.", headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait before retrying" } } },
      "503": { description: "SERVICE_UNAVAILABLE or DELEGATE_UNAVAILABLE (kind UNAVAILABLE): HMRC or GOV.UK Delegate cannot take it just now. Nothing was done. Retry the same request after Retry-After seconds; with an Idempotency-Key a retry never duplicates anything.", headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait before retrying" } } },
    },
  },
});

/**
 * Claim progress is polled, never pushed (no webhooks or subscriptions). Send the last ETag as
 * If-None-Match to get 304 Not Modified when nothing has changed. Responses are private, no-store:
 * the ETag is for the caller's own conditional requests, not for any cache.
 */
const progressPath = () => {
  const base = action("Scheduled claim progress check: the same status as /api/claims, plus observed_at, a version, changed_since (with ?since=<ISO time>) and polling guidance. This is polling only: HMRC does not push or call webhooks. Send the ETag from your last response as If-None-Match and you get 304 Not Modified, with no body, while nothing has changed; a new reply, question, dispute, withdrawn answer, correction or claim gives a new ETag and the full status. Every response is Cache-Control: private, no-store, so the ETag is for your own conditional requests, not for any cache. There is a small number of checks a day per person, however many agents act for them (polling.limit); a 304 still counts as a check. Over that, 429 RATE_LIMITED with Retry-After: a limit on checks, not on the claim, and nothing is lost by waiting.", "get");
  const get = base.get as Record<string, unknown>;
  return {
    get: {
      ...get,
      parameters: [
        ...(get.parameters as unknown[]),
        { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" }, description: "An earlier observed_at. changed_since says whether anything changed after it." },
        { name: "If-None-Match", in: "header", required: false, schema: { type: "string" }, description: "The ETag of your last response. If the status is unchanged you get 304 with no body. Only ever matched against the version of the person you are acting for." },
      ],
      responses: {
        ...(get.responses as Record<string, unknown>),
        "200": {
          description: "The status, with observed_at (when HMRC looked), version (the ETag value), changed_since, and polling: suggested_next_poll_seconds, the limit and how to back off.",
          headers: {
            ETag: { schema: { type: "string" }, description: "Weak validator for the person's current claim status. Changes whenever any claim, question or answer changes." },
            "Cache-Control": { schema: { type: "string", enum: ["private, no-store"] }, description: "Personal data: do not store." },
            "X-Suggested-Poll-Interval": { schema: { type: "integer" }, description: "Seconds to wait before the next check that the limit allows evenly across a day. Guidance, not a promise of when anything will change." },
          },
        },
        "304": {
          description: "Not Modified: nothing has changed since the version in If-None-Match. No body. Repeat ETag, Cache-Control and X-Suggested-Poll-Interval headers. It counts as a check.",
          headers: {
            ETag: { schema: { type: "string" } },
            "Cache-Control": { schema: { type: "string", enum: ["private, no-store"] } },
            "X-Suggested-Poll-Interval": { schema: { type: "integer" } },
          },
        },
      },
    },
  };
};

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Claim tax relief for your job expenses: agent API", version: "0.1", description: "For agents acting for a person with permission given through GOV.UK Delegate." },
    servers: [{ url: config.appUrl }],
    components: { securitySchemes: { agentToken: { type: "http", scheme: "bearer", description: `An agent token or delegation token from GOV.UK Delegate (${config.delegateUrl}).` } } },
    paths: {
      "/api/tax-code": action("View the person's tax code (an expensive lookup: up to 60 an hour per person, however many agents ask; over that, 429 RATE_LIMITED with Retry-After)", "get"),
      "/api/job-expenses": action("Claim tax relief for working from home (more than once only with new evidence). Send an Idempotency-Key header (1 to 128 visible characters, a fresh one per claim) and retry safely: the same key with the same body returns the original reference with nothing made twice; the same key with a different body is 409 IDEMPOTENCY_KEY_REUSED. A new key is a new claim and meets the duplicate rules.", "post"),
      "/api/employment": action("Update employment details", "post"),
      "/api/refund-account": action("Change the bank account for refunds. Needs the person's approval of this one change. Send an Idempotency-Key header and the (made-up, demo) details: { account_name, sort_code, account_number }. Without approval you get 403 STEP_UP_REQUIRED with step_up.details and a code for the person. Their approval covers only these details, once, for a limited time (step_up.expires_at); different details or a new key need a new approval. Retrying the same request after it succeeded returns the original result.", "post"),
      "/api/address": action("Change address. Needs the person's approval of this one change, exactly as for /api/refund-account. Send an Idempotency-Key header and the (made-up, demo) details: { address_line_1, address_line_2?, town, postcode }.", "post"),
      "/api/claims": action("See the person's claims, their status, and anything HMRC has asked (open_queries)", "get"),
      "/api/claims/progress": progressPath(),
      "/api/claims/respond": action("Answer a question HMRC asked about a claim. Body: { query_id, answer, confirmed_by_person? }. Check the wording with the person first and say so with confirmed_by_person: true. It is optional, but the person sees on GOV.UK what you sent and whether you said they agreed, and can say they did not.", "post"),
    },
  });
}
