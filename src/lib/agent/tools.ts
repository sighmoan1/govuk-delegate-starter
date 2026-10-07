// Tools available to the Example AI assistant. Both the LLM and the scripted
// agent call these; neither can do anything HMRC and Delegate would not allow.
import type Anthropic from "@anthropic-ai/sdk";
import { CAPABILITY_COPY } from "../capabilities";
import { config } from "../config";
import { callService, createAuthorisationRequest } from "./hmrc-client";
import type { DisplayItem } from "./conversation";

export const HMRC_TOOLS = ["view_tax_code", "claim_job_expenses", "update_employment", "change_refund_account", "change_address"] as const;

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = [
  {
    name: "request_authority",
    description:
      "Ask the person, through GOV.UK Delegate, for permission to act for them with HMRC. " +
      "Use before your first HMRC action, and again if HMRC refuses because a permission is missing. " +
      "Request only what the current task needs. The person is shown a button to a GOV.UK page where they decide; " +
      "you will be told the outcome later. Stop and wait after calling this.",
    input_schema: {
      type: "object",
      properties: {
        capabilities: {
          type: "array",
          items: { type: "string", enum: [...HMRC_TOOLS] },
          description: "The HMRC permissions to ask for.",
        },
        why: { type: "string", description: "One sentence, for the person, on why you need them." },
      },
      required: ["capabilities", "why"],
      additionalProperties: false,
    },
    strict: true,
  },
  ...HMRC_TOOLS.map((code): Anthropic.Beta.BetaTool => ({
    name: code,
    description:
      `HMRC: ${CAPABILITY_COPY[code].label}. Acts for the person and only succeeds if they gave you this permission ` +
      "through GOV.UK Delegate. Returns decision ALLOW or DENY with a reason code.",
    input_schema: {
      type: "object",
      properties:
        code === "claim_job_expenses"
          ? { tax_year: { type: "string", description: 'For example "2026 to 2027".' } }
          : code === "update_employment" || code === "change_address" || code === "change_refund_account"
            ? { details: { type: "string", description: "What to change, in plain words." } }
            : {},
      required: [],
      additionalProperties: false,
    },
  })),
];

export type ToolContext = { conversationId: string; principalId: string | null; granted: string[] };

export type ToolOutcome = {
  forModel: string; // JSON handed back to the model as the tool result
  display: DisplayItem; // what the chat shows
  pendingRequestId?: string; // set when the agent is now waiting for the person
};

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  if (name === "request_authority") {
    const wanted = (Array.isArray(input.capabilities) ? input.capabilities : []).map(String).filter((c) => c in CAPABILITY_COPY);
    // Approving a new request replaces the current relationship, so ask for what
    // the agent already holds as well as the new permissions.
    const caps = [...new Set([...ctx.granted, ...(wanted.length ? wanted : ["view_tax_code"])])];
    const req = await createAuthorisationRequest(caps, `${config.appUrl}/example-ai/callback?conv=${ctx.conversationId}`);
    return {
      forModel: JSON.stringify({ status: "WAITING_FOR_PERSON", request_id: req.id, requested: caps }),
      display: { kind: "consent", url: req.consent_url, capabilities: caps, requestId: req.id },
      pendingRequestId: req.id,
    };
  }
  if ((HMRC_TOOLS as readonly string[]).includes(name)) {
    const body = { tax_year: input.tax_year, update: input.details, details: input.details };
    const r = await callService(name, ctx.principalId, body);
    return {
      forModel: JSON.stringify({ status: r.status, decision: r.decision, reason: r.reason, result: r.result ?? null }),
      display: { kind: "step", capability: name, status: r.status, decision: r.decision, reason: r.reason, lane: r.lane, detail: r.raw },
    };
  }
  return {
    forModel: JSON.stringify({ error: `Unknown tool ${name}` }),
    display: { kind: "notice", text: `The assistant tried an unknown tool (${name}).` },
  };
}
