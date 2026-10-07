// Example AI's own conversation store. Not part of GOV.UK Delegate.
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";

/** What the chat shows. Both agent modes produce the same items. */
export type DisplayItem =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "notice"; text: string }
  | { kind: "consent"; url: string; capabilities: string[]; requestId: string }
  | {
      kind: "step";
      capability: string;
      status: number;
      decision: "ALLOW" | "DENY";
      reason: string | null;
      lane: string | null;
      detail: unknown;
    };

export type ConversationState = {
  display: DisplayItem[];
  /** Model-facing history (LLM mode). Append-only: thinking blocks must stay as returned. */
  llm: Anthropic.Beta.BetaMessageParam[];
  /** What the agent believes it may do (from Delegate on approval). */
  granted: string[];
  /** Scripted mode: the task to resume after Sam decides. */
  pendingTask?: string | null;
};

export const CONV_COOKIE = "exampleai_conv";

export async function loadConversation(id: string | undefined) {
  const row = id ? await prisma.agentConversation.findUnique({ where: { id } }) : null;
  if (!row) return null;
  return { ...row, state: normalise(row.messages) };
}

export async function createConversation() {
  const row = await prisma.agentConversation.create({ data: { messages: { display: [], llm: [], granted: [] } } });
  return { ...row, state: normalise(row.messages) };
}

export async function saveConversation(
  id: string,
  state: ConversationState,
  extra: { principalId?: string | null; pendingRequestId?: string | null } = {},
) {
  await prisma.agentConversation.update({
    where: { id },
    data: { messages: state as unknown as object, ...extra },
  });
}

function normalise(raw: unknown): ConversationState {
  const s = (raw ?? {}) as Partial<ConversationState>;
  return {
    display: Array.isArray(s.display) ? s.display : [],
    llm: Array.isArray(s.llm) ? s.llm : [],
    granted: Array.isArray(s.granted) ? s.granted : [],
    pendingTask: s.pendingTask ?? null,
  };
}
