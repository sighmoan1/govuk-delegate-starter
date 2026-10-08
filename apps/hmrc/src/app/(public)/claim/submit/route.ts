import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { taxpayerFromRequest } from "@/lib/session";
import { claimJobExpenses, findOrCreateTaxpayer } from "@/lib/taxpayers";
import { logEvent } from "@/lib/events";
import { withPrincipalCapacity } from "@/lib/capacity";
import { verifyAgentSignature } from "@/lib/agent-identity";
import { agentSessionFromRequest } from "@/lib/agent-session";
import { askDelegate } from "@/lib/delegate-client";
import type { Actor } from "@/lib/delegated-authority";

const CAPABILITY = "claim_job_expenses";

/**
 * Submitting the claim from the website. The same business function, and the
 * same per-person limits, as the agent API, for a person, for an agent the
 * person approved, and for an agent HMRC can't see in the person's browser.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl), 303);
  const sig = await verifyAgentSignature(req);
  const evidence = {
    path: "/claim/submit", capability: CAPABILITY,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    signatureAgent: sig.verified ? sig.agent : sig.agent ?? null,
    signatureResult: sig.verified ? "verified" : sig.reason,
  };
  const form = await req.formData().catch(() => new FormData());
  const body = { evidence: String(form.get("evidence") ?? "") || undefined };

  let taxpayer;
  let actor: Actor;
  let lane: "AUTHENTICATED_HUMAN" | "AUTHORISED_AGENT";
  let checkId: string | null = null;
  const session = await agentSessionFromRequest(req);
  if (session) {
    if (session.signatureAgent && !(sig.verified && sig.agent === session.signatureAgent)) return go("/act-for-someone?ended=session");
    const check = await askDelegate({ agent_token: session.delegationToken, principal_id: session.principalId, capability: CAPABILITY });
    if (!check.authorised) {
      await logEvent({ ...evidence, lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: check.reason, agentName: session.agentName, subject: session.subject, delegateCheckId: check.check_id, latencyMs: Date.now() - started });
      return go(`/your-tax?refused=${check.reason}`);
    }
    taxpayer = await findOrCreateTaxpayer(check.subject);
    actor = { kind: "AGENT", name: check.delegate.name, id: check.delegate.id, chain: check.chain };
    lane = "AUTHORISED_AGENT";
    checkId = check.check_id;
  } else {
    const person = await taxpayerFromRequest(req);
    if (!person) return go("/sign-in?returnTo=/claim");
    if (sig.verified) {
      await logEvent({ ...evidence, lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "AGENT_NOT_AUTHORISED", agentName: sig.name, subject: person.oneLoginSubject, latencyMs: Date.now() - started });
      return go("/act-for-someone?from=/claim");
    }
    taxpayer = person;
    actor = { kind: "SELF" };
    lane = "AUTHENTICATED_HUMAN";
  }

  const who = { agentName: actor.kind === "AGENT" ? actor.name : null, subject: taxpayer.oneLoginSubject, delegateCheckId: checkId, ...(actor.kind === "AGENT" ? { delegationId: actor.chain.delegation_id, mandateId: actor.chain.mandate_id, assurance: actor.chain.assurance } : {}) };
  const run = await withPrincipalCapacity(taxpayer, CAPABILITY, body, (admitted) => claimJobExpenses(taxpayer, actor, admitted));
  if (!run.ok) {
    await logEvent({ ...evidence, ...who, lane, outcome: "REFUSED", reason: run.refusal.reason, rule: run.refusal.rule, capacityUsed: run.refusal.used, capacityLimit: run.refusal.limit, latencyMs: Date.now() - started });
    return go(`/your-tax?refused=${run.refusal.reason}`);
  }
  await logEvent({ ...evidence, ...who, lane, outcome: "ALLOWED", rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit, latencyMs: Date.now() - started });
  return go(`/your-tax?claimed=${encodeURIComponent(run.result.claim_reference)}`);
}
