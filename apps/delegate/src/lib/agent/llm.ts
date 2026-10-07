// The real agent: Claude with tool use, in a manual loop. The loop is manual
// because it must stop when the agent hands the person a consent link and wait
// for a human decision on another site.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { ConversationState } from "./conversation";
import { TOOL_DEFINITIONS, runTool, type ToolContext } from "./tools";

const SYSTEM = `You are Example AI assistant, a personal AI assistant helping Sam with their tax.

You can act for Sam with HMRC only through the tools provided, and only with permission Sam gives through GOV.UK Delegate.
- Before your first HMRC action, call request_authority for the smallest set of permissions the task needs, then stop and wait. Sam decides on GOV.UK.
- If a tool returns decision DENY, tell Sam plainly what happened, using the reason:
  PERMISSION_MISSING: Sam has not allowed that action. Offer to ask for that permission (request_authority) or suggest Sam does it themselves on GOV.UK. Never retry without new permission.
  AUTHORISATION_REVOKED: Sam removed your access. Do not try other actions; offer to reconnect.
  AUTHORISATION_EXPIRED: the permission has run out. Offer to renew.
  NO_AUTHORISATION: you are not connected yet. Ask for permission.
- Never claim an action succeeded unless the tool returned decision ALLOW.
- All data is synthetic and this is a prototype; do not mention that unless asked.
Keep replies short: two or three sentences, plain English, no markdown headings.`;

const MAX_STEPS = 8;

export type TurnResult = { pendingRequestId?: string };

/** Append one user message (typed by Sam, or an app notice) and run the agent until it ends its turn. */
export async function llmTurn(state: ConversationState, ctx: ToolContext, userContent: string): Promise<TurnResult> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  state.llm.push({ role: "user", content: userContent });
  let pendingRequestId: string | undefined;

  for (let step = 0; step < MAX_STEPS; step++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: config.anthropicModel,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOL_DEFINITIONS,
        messages: state.llm,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}` : String(e);
      console.error("agent model call failed", msg);
      state.display.push({ kind: "notice", text: "The assistant could not reach its AI model just now. Try again." });
      return { pendingRequestId };
    }

    if (response.stop_reason === "refusal") {
      state.display.push({ kind: "notice", text: "The assistant declined to continue with that request." });
      return { pendingRequestId };
    }

    // Append exactly what came back (thinking blocks included): history is append-only.
    state.llm.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) state.display.push({ kind: "agent", text: block.text.trim() });
    }

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      // Once the agent is waiting for Sam, it may not act further this turn.
      if (pendingRequestId) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ error: "WAITING_FOR_PERSON: wait for Sam's decision before doing anything else." }), is_error: true });
        continue;
      }
      try {
        const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, ctx);
        state.display.push(out.display);
        if (out.pendingRequestId) pendingRequestId = out.pendingRequestId;
        results.push({ type: "tool_result", tool_use_id: block.id, content: out.forModel });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ error: String(e) }), is_error: true });
      }
    }
    // All results for one assistant turn go back in a single user message.
    state.llm.push({ role: "user", content: results });
  }
  return { pendingRequestId };
}
