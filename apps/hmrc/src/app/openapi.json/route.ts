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
      "409": { description: "DUPLICATE_SUBMISSION, NEW_EVIDENCE_REQUIRED, IDEMPOTENCY_KEY_REUSED, or STEP_UP_IN_USE / STEP_UP_ALREADY_USED for approval-gated changes (retry-after says when to try again)" },
      "429": { description: "CAPACITY_EXCEEDED: the person's limit, shared by everyone acting for them" },
    },
  },
});

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Claim tax relief for your job expenses: agent API", version: "0.1", description: "For agents acting for a person with permission given through GOV.UK Delegate." },
    servers: [{ url: config.appUrl }],
    components: { securitySchemes: { agentToken: { type: "http", scheme: "bearer", description: `An agent token or delegation token from GOV.UK Delegate (${config.delegateUrl}).` } } },
    paths: {
      "/api/tax-code": action("View the person's tax code", "get"),
      "/api/job-expenses": action("Claim tax relief for working from home (more than once only with new evidence). Send an Idempotency-Key header (1 to 128 visible characters, a fresh one per claim) and retry safely: the same key with the same body returns the original reference with nothing made twice; the same key with a different body is 409 IDEMPOTENCY_KEY_REUSED. A new key is a new claim and meets the duplicate rules.", "post"),
      "/api/employment": action("Update employment details", "post"),
      "/api/refund-account": action("Change the bank account for refunds. Needs the person's approval of this one change. Send an Idempotency-Key header and the (made-up, demo) details: { account_name, sort_code, account_number }. Without approval you get 403 STEP_UP_REQUIRED with step_up.details and a code for the person. Their approval covers only these details, once, for a limited time (step_up.expires_at); different details or a new key need a new approval. Retrying the same request after it succeeded returns the original result.", "post"),
      "/api/address": action("Change address. Needs the person's approval of this one change, exactly as for /api/refund-account. Send an Idempotency-Key header and the (made-up, demo) details: { address_line_1, address_line_2?, town, postcode }.", "post"),
      "/api/claims": action("See the person's claims, their status, and anything HMRC has asked (open_queries)", "get"),
      "/api/claims/progress": action("Scheduled claim progress check: same as /api/claims, plus ?since=<ISO time> to see if anything changed. A few checks a day per person.", "get"),
      "/api/claims/respond": action("Answer a question HMRC asked about a claim. Body: { query_id, answer, confirmed_by_person? }. Check the wording with the person first and say so with confirmed_by_person: true. It is optional, but the person sees on GOV.UK what you sent and whether you said they agreed, and can say they did not.", "post"),
    },
  });
}
