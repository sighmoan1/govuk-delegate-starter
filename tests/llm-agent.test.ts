import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { prisma, newPrincipal } from "./helpers";
import { approveRequest } from "@/lib/requests";

// Exercises the real LLM agent loop (src/lib/agent/llm.ts) against a local stand-in
// for the Messages API. It checks OUR side: request shape, tool execution through
// Delegate/HMRC, stopping to wait for consent, resuming, append-only history.
// It is not a test of the model. With ANTHROPIC_API_KEY set, e2e/llm.spec.ts runs the real one.

type Body = { model: string; fallbacks?: unknown; tools: { name: string }[]; messages: { role: string; content: unknown }[]; thinking?: unknown; output_config?: unknown };
const seen: { body: Body; beta: string | undefined }[] = [];
let server: http.Server;
let n = 0;

const msg = (content: unknown[], stop_reason: string) => ({
  id: `msg_${++n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason,
  stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
});
const toolUse = (name: string, input: object) => ({ type: "tool_use", id: `toolu_${++n}`, name, input });
const text = (t: string) => ({ type: "text", text: t });

function reply(body: Body) {
  const last = body.messages.at(-1)!;
  const content = last.content;
  if (typeof content === "string") {
    if (content.startsWith("[Notice") && content.includes("approved"))
      return msg([toolUse("view_tax_code", {}), toolUse("claim_job_expenses", { tax_year: "2026 to 2027" })], "tool_use");
    if (/bank/.test(content)) return msg([toolUse("change_refund_account", { details: "new bank" })], "tool_use");
    return msg([{ type: "thinking", thinking: "", signature: "sig-1" }, text("I need your permission first."), toolUse("request_authority", { capabilities: ["view_tax_code", "claim_job_expenses"], why: "To claim your relief." })], "tool_use");
  }
  const results = (content as { type: string; content: string }[]).filter((b) => b.type === "tool_result").map((b) => JSON.parse(b.content));
  if (results.some((r) => r.status === "WAITING_FOR_PERSON")) return msg([text("I've asked GOV.UK. Come back when you've decided.")], "end_turn");
  if (results.every((r) => r.decision === "ALLOW")) return msg([text(`Done. New tax code ${results.at(-1).result.new_tax_code}.`)], "end_turn");
  return msg([text(`HMRC refused: ${results.find((r) => r.decision === "DENY").reason}.`)], "end_turn");
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as Body;
      seen.push({ body: structuredClone(body), beta: req.headers["anthropic-beta"] as string | undefined });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(reply(body)));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  delete process.env.AGENT_MODE;
});
afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

describe("LLM agent loop (mocked model, real Delegate + HMRC)", () => {
  it("asks for authority, waits, resumes after consent, acts, and reports refusals", async () => {
    const { createConversation, loadConversation } = await import("@/lib/agent/conversation");
    const { handleUserMessage, handleConsentReturn } = await import("@/lib/agent/agent");
    const sam = await newPrincipal();
    const conv = await createConversation();

    await handleUserMessage(conv.id, "Can you claim my working-from-home tax relief?");
    let c = (await loadConversation(conv.id))!;
    expect(c.pendingRequestId).toBeTruthy();
    expect(c.state.display.map((d) => d.kind)).toEqual(["user", "agent", "consent", "agent"]);

    // Request shape: default model, server-side fallbacks, no thinking override, our tools.
    const first = seen[0];
    expect(first.body.model).toBe("claude-opus-5-5");
    expect(first.body.fallbacks).toBe("default");
    expect(first.beta).toContain("server-side-fallback-2026-07-01");
    expect(first.body.thinking).toBeUndefined();
    expect(first.body.tools.map((t) => t.name)).toContain("request_authority");

    await approveRequest(c.pendingRequestId!, sam.id);
    await handleConsentReturn(conv.id, c.pendingRequestId!);
    c = (await loadConversation(conv.id))!;
    const steps = c.state.display.filter((d) => d.kind === "step");
    expect(steps.map((s) => s.kind === "step" && `${s.capability}:${s.decision}`)).toEqual(["view_tax_code:ALLOW", "claim_job_expenses:ALLOW"]);
    expect(c.state.display.at(-1)).toMatchObject({ kind: "agent", text: "Done. New tax code 1288L." });

    // Both parallel tool results went back in ONE user message.
    const toolResultMsgs = c.state.llm.filter((m) => Array.isArray(m.content) && (m.content as { type: string }[]).every((b) => b.type === "tool_result"));
    expect((toolResultMsgs.at(-1)!.content as unknown[]).length).toBe(2);

    await handleUserMessage(conv.id, "Also change my refund bank account");
    c = (await loadConversation(conv.id))!;
    expect(c.state.display.at(-1)).toMatchObject({ kind: "agent", text: "HMRC refused: PERMISSION_MISSING." });

    // Append-only history: every request's messages are a prefix of the next one's,
    // and the thinking block came back exactly as the model returned it.
    for (let i = 1; i < seen.length; i++) {
      const prev = seen[i - 1].body.messages;
      expect(seen[i].body.messages.slice(0, prev.length)).toEqual(prev);
    }
    expect(JSON.stringify(seen.at(-1)!.body.messages)).toContain('"signature":"sig-1"');
  });
});
