import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { taxpayerFromRequest } from "@/lib/session";
import { answerQuery, findOrCreateTaxpayer } from "@/lib/taxpayers";
import { logEvent } from "@/lib/events";
import { runOperation } from "@/lib/operation";
import { refusalEventFields } from "@/lib/events";
import { formKey } from "@/lib/idempotency";
import { verifyAgentSignature } from "@/lib/agent-identity";
import { agentSessionFromRequest } from "@/lib/agent-session";
import { askDelegate, DelegateUnavailableError } from "@/lib/delegate-client";
import type { Actor } from "@/lib/delegated-authority";

const CAPABILITY = "respond_to_query";

/**
 * Answering HMRC's question from the website: the same business function and
 * rules as the agent API. A signed-in person sending the form is agreeing to
 * the wording. An approved agent is not blocked: GOV.UK Delegate is asked first,
 * and the person sees what it sent on GOV.UK, and can say they did not agree.
 */
export async function POST(req: Request) {
  try {
    return await reply(req);
  } catch (e) {
    if (!(e instanceof DelegateUnavailableError)) throw e;
    // Nothing was accepted: the question is still open for the agent to try again.
    await logEvent({ path: "/query/reply", capability: CAPABILITY, lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: "DELEGATE_UNAVAILABLE", latencyMs: 0 });
    return NextResponse.redirect(new URL("/your-tax?replyError=DELEGATE_UNAVAILABLE", config.appUrl), 303);
  }
}

async function reply(req: Request) {
  const started = Date.now();
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl), 303);
  const sig = await verifyAgentSignature(req);
  const evidence = { path: "/query/reply", capability: CAPABILITY, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, signatureAgent: sig.verified ? sig.agent : sig.agent ?? null, signatureResult: sig.verified ? "verified" : sig.reason };
  const form = await req.formData().catch(() => new FormData());
  const fields = { query_id: String(form.get("query_id") ?? ""), answer: String(form.get("answer") ?? "") };

  let taxpayer;
  let actor: Actor;
  let lane: "AUTHENTICATED_HUMAN" | "AUTHORISED_AGENT";
  let who: Record<string, unknown>;
  let body: Record<string, unknown>;

  const session = await agentSessionFromRequest(req);
  if (session) {
    if (session.signatureAgent && !(sig.verified && sig.agent === session.signatureAgent)) return go("/act-for-someone?ended=session");
    const check = await askDelegate({ agent_token: session.delegationToken, principal_id: session.principalId, capability: CAPABILITY });
    if (!check.authorised) {
      await logEvent({ ...evidence, lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: check.reason, agentName: session.agentName, subject: session.subject, delegateCheckId: check.check_id, latencyMs: Date.now() - started });
      return go(`/your-tax?replyError=${check.reason}`);
    }
    taxpayer = await findOrCreateTaxpayer(check.subject);
    actor = { kind: "AGENT", name: check.delegate.name, id: check.delegate.id, chain: check.chain };
    lane = "AUTHORISED_AGENT";
    body = { ...fields, confirmed_by_person: form.get("confirmed_by_person") === "yes" } // optional: recorded, not required;
    who = { agentName: actor.name, subject: taxpayer.oneLoginSubject, delegateCheckId: check.check_id, delegationId: check.chain.delegation_id, mandateId: check.chain.mandate_id, assurance: check.chain.assurance };
  } else {
    const person = await taxpayerFromRequest(req);
    if (!person) {
      await logEvent({ ...evidence, lane: "UNTRUSTED", outcome: "REFUSED", reason: "NOT_IDENTIFIED", latencyMs: Date.now() - started });
      return go("/sign-in?returnTo=/your-tax");
    }
    if (sig.verified) {
      await logEvent({ ...evidence, lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "AGENT_NOT_AUTHORISED", agentName: sig.name, subject: person.oneLoginSubject, latencyMs: Date.now() - started });
      return go("/act-for-someone?from=/your-tax");
    }
    taxpayer = person;
    actor = { kind: "SELF" };
    lane = "AUTHENTICATED_HUMAN";
    body = { ...fields, confirmed_by_person: true };
    who = { subject: person.oneLoginSubject };
  }

  const run = await runOperation(taxpayer, CAPABILITY, body, (_admitted, db) => answerQuery(taxpayer, actor, body, db), {
    idempotencyKey: formKey(form.get("submission_id")),
    operator: actor.kind === "AGENT" ? { kind: "agent", key: actor.id } : { kind: "human", key: taxpayer.id },
  });
  if (!run.ok) {
    await logEvent({ ...evidence, ...who, lane, ...refusalEventFields(run.refusal, run.costClass), authorisedCheck: lane === "AUTHORISED_AGENT", latencyMs: Date.now() - started });
    return go(`/your-tax?replyError=${run.refusal.reason}`);
  }
  await logEvent({ ...evidence, ...who, lane, outcome: "ALLOWED", costClass: run.costClass, authorisedCheck: lane === "AUTHORISED_AGENT", reason: run.replayed ? "IDEMPOTENT_REPLAY" : lane === "AUTHORISED_AGENT" ? "VALID_AUTHORISATION" : undefined, rule: run.admitted.rule, latencyMs: Date.now() - started });
  return go("/your-tax?replied=1");
}
