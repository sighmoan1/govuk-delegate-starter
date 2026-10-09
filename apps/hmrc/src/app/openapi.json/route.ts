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

const ASYNC_NOTE =
  "Receive now, record later. Add `Prefer: respond-async` and an Idempotency-Key (required for this) and HMRC stores the claim before answering 202 Accepted: the body has result.transaction_id (opaque), result.status (QUEUED), and a Location header /api/transactions/{id} to check. 202 means HMRC has the claim safely, not that it is approved or eligible: nothing is decided, and the claim does not exist until a worker records it (COMPLETED). The same Idempotency-Key never queues a second job; a retry returns the same transaction_id with its current status. The received_at time is this prototype's receipt time, not proof of a statutory filing date. If HMRC cannot store the claim you get 503 with Retry-After, accepted: false and nothing was received: send the same request again. Revoking an agent stops it sending anything new; a claim it sent while permitted and that was already received is still recorded (Decision 25). Without the Prefer header the call is synchronous, as before.";

const withAccepted = (op: ReturnType<typeof action>) => {
  const post = (op as unknown as { post: { responses: Record<string, unknown> } }).post;
  post.responses = {
    "202": { description: "Received and stored; will be recorded shortly. Not a decision on the claim. Location points at the status endpoint. Only sent when the claim and its job are both committed.", headers: { Location: { schema: { type: "string" }, description: "/api/transactions/{id}" } } },
    ...post.responses,
  };
  return op;
};

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Claim tax relief for your job expenses: agent API", version: "0.1", description: "For agents acting for a person with permission given through GOV.UK Delegate." },
    servers: [{ url: config.appUrl }],
    components: { securitySchemes: { agentToken: { type: "http", scheme: "bearer", description: `An agent token or delegation token from GOV.UK Delegate (${config.delegateUrl}).` } } },
    paths: {
      "/api/tax-code": action("View the person's tax code (an expensive lookup: up to 60 an hour per person, however many agents ask; over that, 429 RATE_LIMITED with Retry-After)", "get"),
      "/api/job-expenses": withAccepted(action(`Claim tax relief for working from home (more than once only with new evidence). Send an Idempotency-Key header (1 to 128 visible characters, a fresh one per claim) and retry safely: the same key with the same body returns the original reference with nothing made twice; the same key with a different body is 409 IDEMPOTENCY_KEY_REUSED. A new key is a new claim and meets the duplicate rules. ${ASYNC_NOTE}`, "post")),
      "/api/transactions/{id}": {
        ...action("Where a claim HMRC has received has got to: QUEUED, PROCESSING, COMPLETED (recorded and being reviewed, with claim_reference) or FAILED (could not be recorded; nothing was claimed; submit again with a new Idempotency-Key). Needs the view_claim_status permission. You can only see this person's receipts: anyone else's id is the same 404 TRANSACTION_NOT_FOUND as one that does not exist. Checking is a cheap read and does not use the scheduled progress allowance.", "get"),
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "result.transaction_id from the 202 receipt" }],
      },
      "/api/employment": action("Update employment details", "post"),
      "/api/refund-account": action("Change the bank account for refunds. Needs the person's approval of this one change. Send an Idempotency-Key header and the (made-up, demo) details: { account_name, sort_code, account_number }. Without approval you get 403 STEP_UP_REQUIRED with step_up.details and a code for the person. Their approval covers only these details, once, for a limited time (step_up.expires_at); different details or a new key need a new approval. Retrying the same request after it succeeded returns the original result.", "post"),
      "/api/address": action("Change address. Needs the person's approval of this one change, exactly as for /api/refund-account. Send an Idempotency-Key header and the (made-up, demo) details: { address_line_1, address_line_2?, town, postcode }.", "post"),
      "/api/claims": action("See the person's claims, their status, and anything HMRC has asked (open_queries)", "get"),
      "/api/claims/progress": action("Scheduled claim progress check: same as /api/claims, plus ?since=<ISO time> to see if anything changed. A few checks a day per person; over that, 429 RATE_LIMITED with Retry-After, which is a polling limit, not a limit on the claim.", "get"),
      "/api/claims/respond": action("Answer a question HMRC asked about a claim. Body: { query_id, answer, confirmed_by_person? }. Check the wording with the person first and say so with confirmed_by_person: true. It is optional, but the person sees on GOV.UK what you sent and whether you said they agreed, and can say they did not.", "post"),
    },
  });
}
