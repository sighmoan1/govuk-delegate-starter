import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { taxpayerFromRequest } from "@/lib/session";
import { answerQuery } from "@/lib/taxpayers";
import { logEvent } from "@/lib/events";
import { withPrincipalCapacity } from "@/lib/capacity";
import { verifyAgentSignature } from "@/lib/agent-identity";

const CAPABILITY = "respond_to_query";

/**
 * A signed-in person answering HMRC's question on the website. Sending the
 * form is the person's agreement to the wording. Agents use /api/claims/respond.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl), 303);
  const sig = await verifyAgentSignature(req);
  const evidence = { path: "/query/reply", capability: CAPABILITY, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, signatureAgent: sig.verified ? sig.agent : sig.agent ?? null, signatureResult: sig.verified ? "verified" : sig.reason };
  const person = await taxpayerFromRequest(req);
  if (!person) return go("/sign-in?returnTo=/your-tax");
  if (sig.verified) {
    await logEvent({ ...evidence, lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "AGENT_NOT_AUTHORISED", agentName: sig.name, subject: person.oneLoginSubject, latencyMs: Date.now() - started });
    return go("/act-for-someone?from=/your-tax");
  }
  const form = await req.formData().catch(() => new FormData());
  const body = { query_id: String(form.get("query_id") ?? ""), answer: String(form.get("answer") ?? ""), confirmed_by_person: true };
  const run = await withPrincipalCapacity(person, CAPABILITY, body, () => answerQuery(person, { kind: "SELF" }, body));
  if (!run.ok) {
    await logEvent({ ...evidence, lane: "AUTHENTICATED_HUMAN", outcome: "REFUSED", reason: run.refusal.reason, subject: person.oneLoginSubject, rule: run.refusal.rule, latencyMs: Date.now() - started });
    return go("/your-tax?replyError=1");
  }
  await logEvent({ ...evidence, lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", subject: person.oneLoginSubject, rule: run.admitted.rule, latencyMs: Date.now() - started });
  return go("/your-tax?replied=1");
}
