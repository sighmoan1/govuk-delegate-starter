// Example AI's orchestration: one place that picks the brain (LLM or scripted),
// keeps the agent's view of Sam's authority, and persists the conversation.
import { config } from "../config";
import { loadConversation, saveConversation } from "./conversation";
import { getAuthorisationRequest } from "./hmrc-client";
import { llmTurn } from "./llm";
import { scriptedResume, scriptedUserTurn } from "./scripted";
import { labelList } from "./explain";

export async function handleUserMessage(conversationId: string, text: string) {
  const conv = await loadConversation(conversationId);
  if (!conv) throw new Error("No conversation");
  const state = conv.state;
  const clean = text.trim().slice(0, 1000);
  if (!clean) return;
  state.display.push({ kind: "user", text: clean });
  const ctx = { conversationId, principalId: conv.principalId, granted: state.granted };
  const r = config.agentMode === "llm" ? await llmTurn(state, ctx, clean) : await scriptedUserTurn(state, ctx, clean);
  await saveConversation(conversationId, state, r.pendingRequestId ? { pendingRequestId: r.pendingRequestId } : {});
}

/** Sam has come back from GOV.UK. The agent checks the outcome with Delegate itself — it does not trust the URL. */
export async function handleConsentReturn(conversationId: string, requestId: string) {
  const conv = await loadConversation(conversationId);
  if (!conv || conv.pendingRequestId !== requestId) return;
  const req = await getAuthorisationRequest(requestId);
  if (!req || req.status === "PENDING") return;

  const state = conv.state;
  const approved = req.status === "APPROVED" && !!req.principal_id;
  let principalId = conv.principalId;
  if (approved) {
    principalId = req.principal_id!;
    state.granted = req.granted_capabilities ?? req.capabilities;
    state.display.push({ kind: "notice", text: `You gave Example AI assistant permission on GOV.UK to: ${labelList(state.granted)}.` });
  } else {
    state.display.push({ kind: "notice", text: "You did not give permission on GOV.UK." });
  }
  const ctx = { conversationId, principalId, granted: state.granted };

  let pending: string | undefined;
  if (config.agentMode === "llm") {
    const notRequestedButAsked = req.capabilities.filter((c) => !state.granted.includes(c));
    const notice = approved
      ? `[Notice from the Example AI app, not typed by Sam] Sam approved your request on GOV.UK. Granted: ${state.granted.join(", ")}.` +
        (notRequestedButAsked.length ? ` Not granted: ${notRequestedButAsked.join(", ")}.` : "") +
        " Carry on with what Sam asked."
      : "[Notice from the Example AI app, not typed by Sam] Sam rejected your request on GOV.UK. Do not act for them with HMRC.";
    pending = (await llmTurn(state, ctx, notice)).pendingRequestId;
  } else {
    pending = (await scriptedResume(state, ctx, approved)).pendingRequestId;
  }
  await saveConversation(conversationId, state, { principalId, pendingRequestId: pending ?? null });
}
