// Scripted fallback: a deterministic assistant using the same tools as the LLM.
// It exists so the demo works with no API key, and so tests are repeatable.
import type { ConversationState } from "./conversation";
import { runTool, type ToolContext } from "./tools";
import { explainStep, labelList } from "./explain";

type Task = "relief" | "tax_code" | "bank" | "employment" | "address" | "reconnect";

export function intentOf(text: string): Task | null {
  const t = text.toLowerCase();
  if (/bank|refund account/.test(t)) return "bank";
  if (/address|moved/.test(t)) return "address";
  if (/employ|job|employer/.test(t) && !/expense|relief/.test(t)) return "employment";
  if (/relief|working from home|work from home|wfh|expense/.test(t)) return "relief";
  if (/tax code/.test(t)) return "tax_code";
  if (/reconnect|permission|connect|^yes|ask me/.test(t)) return "reconnect";
  return null;
}

const NEEDS: Record<Task, string[]> = {
  relief: ["view_tax_code", "claim_job_expenses", "update_employment"],
  tax_code: ["view_tax_code"],
  bank: ["change_refund_account"],
  employment: ["update_employment"],
  address: ["change_address"],
  reconnect: ["view_tax_code", "claim_job_expenses", "update_employment"],
};

const ACTIONS: Record<Task, string[]> = {
  relief: ["view_tax_code", "claim_job_expenses"],
  tax_code: ["view_tax_code"],
  bank: ["change_refund_account"],
  employment: ["update_employment"],
  address: ["change_address"],
  reconnect: [],
};

export type TurnResult = { pendingRequestId?: string };

async function ask(state: ConversationState, ctx: ToolContext, caps: string[], task: Task | null): Promise<TurnResult> {
  const out = await runTool("request_authority", { capabilities: caps, why: "" }, ctx);
  const requested = (out.display.kind === "consent" ? out.display.capabilities : caps);
  state.display.push({
    kind: "agent",
    text: `To do that I need your permission to act for you with HMRC. I’ll ask GOV.UK for: ${labelList(requested)}. You decide on GOV.UK, and you can change or remove it at any time.`,
  });
  state.display.push(out.display);
  state.pendingTask = task;
  return { pendingRequestId: out.pendingRequestId };
}

async function act(state: ConversationState, ctx: ToolContext, task: Task): Promise<TurnResult> {
  state.pendingTask = null;
  for (const cap of ACTIONS[task]) {
    const out = await runTool(cap, cap === "claim_job_expenses" ? { tax_year: "2026 to 2027" } : {}, ctx);
    state.display.push(out.display);
    if (out.display.kind !== "step") continue;
    state.display.push({ kind: "agent", text: explainStep({ ...out.display, result: (out.display.detail as { result?: unknown })?.result }) });
    if (out.display.decision === "DENY") {
      // Remember what was refused, so "yes, ask me" asks for exactly that.
      if (out.display.reason === "PERMISSION_MISSING") state.pendingTask = task;
      break;
    }
  }
  return {};
}

export async function scriptedUserTurn(state: ConversationState, ctx: ToolContext, text: string): Promise<TurnResult> {
  const task = intentOf(text);
  if (!task) {
    state.display.push({
      kind: "agent",
      text: "I can help with your tax through HMRC: check your tax code, claim tax relief for working from home, or update your details. What would you like to do?",
    });
    return {};
  }
  if (task === "reconnect") {
    const refused = (state.pendingTask ?? null) as Task | null;
    return ask(state, ctx, refused ? NEEDS[refused] : NEEDS.reconnect, refused);
  }
  // Not connected yet: ask first, then carry on once Sam has decided.
  if (!ctx.principalId) return ask(state, ctx, NEEDS[task], task);
  // Connected: just try. HMRC (via Delegate) decides, not the agent.
  return act(state, ctx, task);
}

/** Called after Sam returns from GOV.UK with a decision. */
export async function scriptedResume(state: ConversationState, ctx: ToolContext, approved: boolean): Promise<TurnResult> {
  const task = (state.pendingTask ?? null) as Task | null;
  state.pendingTask = null;
  if (!approved) {
    state.display.push({ kind: "agent", text: "Understood. You didn’t give me permission, so I won’t act for you with HMRC." });
    return {};
  }
  state.display.push({ kind: "agent", text: `Thanks. You’ve allowed me to: ${labelList(ctx.granted)}.` });
  if (task) return act(state, ctx, task);
  return {};
}
