import { NextResponse } from "next/server";
import { config } from "@/lib/config";

const action = (summary: string, method: "get" | "post") => ({
  [method]: {
    summary,
    security: [{ agentToken: [] }],
    parameters: [{ name: "x-principal-id", in: "header", required: true, schema: { type: "string" }, description: "The person you act for, as GOV.UK Delegate told you when they approved." }],
    responses: {
      "200": { description: "Done" },
      "403": { description: "Refused: PERMISSION_MISSING, AUTHORISATION_REVOKED, NO_AUTHORISATION, STEP_UP_REQUIRED (with step_up.user_code) or AGENT_NOT_AUTHORISED" },
      "409": { description: "DUPLICATE_SUBMISSION or NEW_EVIDENCE_REQUIRED" },
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
      "/api/job-expenses": action("Claim tax relief for working from home (more than once only with new evidence)", "post"),
      "/api/employment": action("Update employment details", "post"),
      "/api/refund-account": action("Change the bank account for refunds (needs the person's approval each time)", "post"),
      "/api/address": action("Change address", "post"),
    },
  });
}
