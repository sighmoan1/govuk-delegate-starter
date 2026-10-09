import { NextResponse } from "next/server";
import { config } from "@/lib/config";

// For AI agents and apps: how to act for a person with this service properly.
export function GET() {
  const base = config.appUrl;
  return NextResponse.json(
    {
      service: "Claim tax relief for your job expenses",
      policy:
        "Do not sign in as the person or use their password. Agents acting for someone must identify themselves and use permission the person gives through GOV.UK Delegate.",
      routes: {
        browser_agents: {
          description: "Agents using a browser: start here, say who you are, and give the person the code to approve on GOV.UK.",
          start: `${base}/act-for-someone`,
        },
        api_agents: {
          description: "Registered agents with GOV.UK Delegate credentials: ask the person for permission, then call the API with your token and the person's id.",
          delegate: config.delegateUrl,
          openapi: `${base}/openapi.json`,
        },
      },
      identification: {
        web_bot_auth: "Requests signed with Web Bot Auth (RFC 9421) by a recognised operator are identified automatically.",
        recognised_operators: ["https://chatgpt.com", "https://agent.bot.goog"],
      },
      receive_now_record_later: {
        description: "For claim_job_expenses only: send Prefer: respond-async with an Idempotency-Key and HMRC stores the claim, answers 202 with a transaction_id and a Location, and records it shortly after. 202 is a receipt, not a decision: nothing is approved or eligible until HMRC reviews it. Poll the Location (no more than you need; it is a cheap read) for QUEUED, PROCESSING, COMPLETED or FAILED. The receipt time is the prototype's, not a legal filing date. If HMRC cannot store the claim, 503 with Retry-After: send the same request again.",
        status: `${base}/api/transactions/{transaction_id}`,
        if_permission_is_removed: "You can send nothing new. A claim received while you had permission is still recorded, and the person can see it.",
      },
      limits: "What a person may do (one claim per tax year, one answer per question, open cases) applies to the person, however many agents act for them, and an agent never gets more than the person would. Separately, traffic limits protect the service: 429 RATE_LIMITED or 503 with Retry-After means wait and send the same request again; it is not a decision about entitlement.",
      errors: {
        technical: "429 RATE_LIMITED, 503 SERVICE_UNAVAILABLE or DELEGATE_UNAVAILABLE: kind TECHNICAL_THROTTLE or UNAVAILABLE, retryable, Retry-After header",
        business: "409 DUPLICATE_SUBMISSION, NEW_EVIDENCE_REQUIRED, CAPACITY_EXCEEDED, IDEMPOTENCY_KEY_REUSED; 404 QUERY_NOT_FOUND; 400 INVALID_REQUEST: kind BUSINESS_REFUSAL or REQUEST_ERROR, not retryable unchanged",
        identity_or_permission: "401 and 403: kind AUTHORITY_REFUSAL",
      },
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
