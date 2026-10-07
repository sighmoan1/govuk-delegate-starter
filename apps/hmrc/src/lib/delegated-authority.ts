// What HMRC added to let authorised agents through: this file.
//
// Every API route is wrapped in requireDelegatedAuthority(capability, handler).
// It works out who is on the other end (a person, an authorised agent, an
// agent without permission, or nobody it can identify), asks GOV.UK Delegate
// one question when an agent is acting for someone, applies the person's
// capacity limits (whoever is acting), logs the outcome, and either runs the
// business handler or refuses with a machine-readable reason.
//
// Detection (the agent's signature) is evidence, not the boundary: capacity
// is keyed to the person, so it holds even when HMRC can't see the agent.
import { NextResponse } from "next/server";
import { askDelegate, type DelegateChain } from "./delegate-client";
import { takeToken, clientKey, sleep } from "./friction";
import { logEvent } from "./events";
import { taxpayerFromRequest } from "./session";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";
import { withPrincipalCapacity, REFUSAL_STATUS, type Admitted } from "./capacity";
import { verifyAgentSignature } from "./agent-identity";
import { agentSessionFromRequest } from "./agent-session";
import { config, UNTRUSTED_DELAY_MS } from "./config";

export type Actor =
  | { kind: "SELF" }
  | { kind: "AGENT"; name: string; id: string; chain: DelegateChain };
export type Handler = (ctx: { taxpayer: Taxpayer; actor: Actor; body: Record<string, unknown>; admitted: Admitted }) => Promise<Record<string, unknown>>;

const STATUS: Record<string, number> = {
  PERMISSION_MISSING: 403, AUTHORISATION_REVOKED: 403, AUTHORISATION_EXPIRED: 403, NO_AUTHORISATION: 403,
  STEP_UP_REQUIRED: 403, CAPACITY_EXCEEDED: 429, DELEGATION_DEPTH_EXCEEDED: 403, ASSURANCE_TOO_LOW: 403, AGENT_NOT_AUTHORISED: 403, AGENT_SESSION_NOT_BOUND: 401,
};

type Log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs" | "capability">) => Promise<unknown>;

export function requireDelegatedAuthority(capability: string, handler: Handler) {
  return async function route(req: Request): Promise<NextResponse> {
    const started = Date.now();
    const path = new URL(req.url).pathname;
    const sig = await verifyAgentSignature(req);
    const evidence = {
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      runTag: req.headers.get("x-run-tag")?.slice(0, 80) ?? null,
      signatureAgent: sig.verified ? sig.agent : sig.agent ?? null,
      signatureResult: sig.verified ? "verified" : sig.reason,
    };
    const log: Log = (e) => logEvent({ ...evidence, ...e, path, capability, latencyMs: Date.now() - started });
    const body = await readBody(req);

    // An agent acting in a browser, after the person approved it on GOV.UK.
    const agentSession = await agentSessionFromRequest(req);
    if (agentSession) {
      // A session given to a signing agent only works with that agent's signature.
      if (agentSession.signatureAgent && !(sig.verified && sig.agent === agentSession.signatureAgent)) {
        await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "AGENT_SESSION_NOT_BOUND", agentName: agentSession.agentName, subject: agentSession.subject });
        return refusal("AGENT_SESSION_NOT_BOUND", "UNTRUSTED", { message: "This session belongs to a different agent." });
      }
      return actAsAgent(agentSession.delegationToken, agentSession.principalId, capability, body, handler, log);
    }

    // An agent presenting its own GOV.UK Delegate token (or a sub-agent's delegation token).
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const principalId = req.headers.get("x-principal-id");
    if (token && principalId) return actAsAgent(token, principalId, capability, body, handler, log);

    // A person signed in to HMRC.
    const person = await taxpayerFromRequest(req);
    if (person) {
      // ...unless the browser signs its requests as an AI agent: that's an agent
      // using the person's own session or password, not the person.
      if (sig.verified) return declaredAgent(sig.name, req, log, person.oneLoginSubject);
      // An agent HMRC can't see would look exactly like this. It still spends
      // this person's capacity, because capacity is keyed to the person.
      const rl = takeToken(`human:${person.id}`, "AUTHENTICATED_HUMAN");
      if (!rl.allowed) {
        await log({ lane: "AUTHENTICATED_HUMAN", outcome: "THROTTLED", subject: person.oneLoginSubject });
        return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(rl.resetSeconds) } });
      }
      const run = await withPrincipalCapacity(person, capability, body, (admitted) => handler({ taxpayer: person, actor: { kind: "SELF" }, body, admitted }));
      if (!run.ok) {
        const f = run.refusal;
        await log({ lane: "AUTHENTICATED_HUMAN", outcome: "REFUSED", reason: f.reason, subject: person.oneLoginSubject, rule: f.rule, capacityUsed: f.used, capacityLimit: f.limit });
        return refusal(f.reason, "AUTHENTICATED_HUMAN", { rule: f.rule, limit: f.limit, used: f.used, resets_at: f.resetsAt, message: f.message });
      }
      await log({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", subject: person.oneLoginSubject, rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit });
      return NextResponse.json({ decision: "ALLOW", lane: "AUTHENTICATED_HUMAN", result: run.result, capacity: capacityJson(run.admitted) });
    }

    // A known agent with no permission: show it the proper route. Better than
    // the treatment for traffic that won't say what it is.
    if (sig.verified) return declaredAgent(sig.name, req, log, null);

    // Nobody we can identify. Slower, tightly limited, and no structured API.
    const rl = takeToken(`anon:${clientKey(req)}`, "UNTRUSTED");
    if (!rl.allowed) {
      await log({ lane: "UNTRUSTED", outcome: "THROTTLED" });
      return new NextResponse("Too many requests.\n", { status: 429, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": String(rl.resetSeconds), "x-trusted-lane": "UNTRUSTED" } });
    }
    await sleep(UNTRUSTED_DELAY_MS);
    await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "NOT_IDENTIFIED" });
    return new NextResponse(
      `Not accepted. Sign in with GOV.UK One Login, or, if you are an agent acting for someone, see ${config.appUrl}/.well-known/agent-access.json\n`,
      { status: 401, headers: { "content-type": "text/plain; charset=utf-8", "x-trusted-lane": "UNTRUSTED", "x-ratelimit-limit": String(rl.limit) } },
    );
  };
}

async function actAsAgent(token: string, principalId: string, capability: string, body: Record<string, unknown>, handler: Handler, log: Log) {
  const check = await askDelegate({ agent_token: token, principal_id: principalId, capability });
  const chainLog = check.chain
    ? { mandateId: check.chain.mandate_id, delegationId: check.chain.delegation_id, parentDelegationId: check.chain.parent_delegation_id, depth: check.chain.depth, agentLabel: check.chain.label, assurance: check.chain.assurance }
    : {};
  const agent = check.delegate ? { agentName: check.delegate.name, agentId: check.delegate.id } : {};
  if (!check.authorised) {
    const lane = check.delegate ? "AUTHORISED_AGENT" : "UNTRUSTED";
    await log({
      lane, outcome: "REFUSED", reason: check.reason, ...agent, ...chainLog, delegateCheckId: check.check_id,
      ...(check.capacity ? { rule: `delegate:${check.capacity.rule}`, capacityUsed: check.capacity.used, capacityLimit: check.capacity.limit } : {}),
    });
    return refusal(check.reason, lane, {
      delegate_check_id: check.check_id,
      ...(check.capacity ? { rule: check.capacity.rule, limit: check.capacity.limit, used: check.capacity.used, resets_at: check.capacity.resets_at } : {}),
      ...(check.step_up ? { step_up: check.step_up } : {}),
    });
  }
  const rl = takeToken(`agent:${check.delegate.id}`, "AUTHORISED_AGENT");
  if (!rl.allowed) {
    await log({ lane: "AUTHORISED_AGENT", outcome: "THROTTLED", ...agent, ...chainLog, subject: check.subject });
    return NextResponse.json({ decision: "DENY", reason: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(rl.resetSeconds) } });
  }
  // The One Login subject Delegate returned is the same one HMRC saw when the person signed in.
  const taxpayer = await findOrCreateTaxpayer(check.subject);
  const actor: Actor = { kind: "AGENT", name: check.delegate.name, id: check.delegate.id, chain: check.chain };
  const run = await withPrincipalCapacity(taxpayer, capability, body, (admitted) => handler({ taxpayer, actor, body, admitted }));
  if (!run.ok) {
    const f = run.refusal;
    await log({ lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: f.reason, ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id, rule: f.rule, capacityUsed: f.used, capacityLimit: f.limit });
    return refusal(f.reason, "AUTHORISED_AGENT", { rule: f.rule, limit: f.limit, used: f.used, resets_at: f.resetsAt, message: f.message, delegate_check_id: check.check_id });
  }
  await log({
    lane: "AUTHORISED_AGENT", outcome: "ALLOWED", reason: "VALID_AUTHORISATION", ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id,
    rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit,
  });
  return NextResponse.json(
    { decision: "ALLOW", lane: "AUTHORISED_AGENT", acting_for: taxpayer.name, delegate_check_id: check.check_id, result: run.result, capacity: capacityJson(run.admitted), delegate_capacity: check.capacity },
    { headers: { "x-trusted-lane": "AUTHORISED_AGENT", "x-ratelimit-limit": String(rl.limit), "x-ratelimit-remaining": String(rl.remaining) } },
  );
}

/** A known agent without permission: a clear, structured way to the proper route. No slowdown. */
async function declaredAgent(name: string, req: Request, log: Log, subject: string | null) {
  const rl = takeToken(`declared:${clientKey(req)}`, "DECLARED_AGENT");
  if (!rl.allowed) {
    await log({ lane: "DECLARED_AGENT", outcome: "THROTTLED", agentName: name, subject });
    return NextResponse.json({ decision: "DENY", reason: "RATE_LIMITED", lane: "DECLARED_AGENT" }, { status: 429 });
  }
  await log({ lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "AGENT_NOT_AUTHORISED", agentName: name, subject });
  return refusal("AGENT_NOT_AUTHORISED", "DECLARED_AGENT", {
    agent: name,
    message: subject
      ? `${name} can't act as the person, even with their sign-in. Ask them to give you permission instead.`
      : `${name} needs the person's permission to act for them.`,
    next: { act_for_someone: `${config.appUrl}/act-for-someone`, agent_access: `${config.appUrl}/.well-known/agent-access.json` },
  });
}

const capacityJson = (a: Admitted) => (a.rule ? { rule: a.rule, limit: a.limit, used: a.used } : null);

function refusal(reason: string, lane: string, extra: Record<string, unknown>) {
  return NextResponse.json(
    { decision: "DENY", reason, lane, ...extra },
    { status: REFUSAL_STATUS[reason as keyof typeof REFUSAL_STATUS] ?? STATUS[reason] ?? 401, headers: { "x-trusted-lane": lane } },
  );
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") return {};
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}
