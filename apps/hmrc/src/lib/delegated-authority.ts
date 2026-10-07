// What HMRC added to let authorised agents through: this file.
//
// Every API route is wrapped in requireDelegatedAuthority(capability, handler).
// It works out which lane the caller is in, asks GOV.UK Delegate one question
// when an agent is acting for someone, applies the person's capacity limits
// (whoever is acting), logs the outcome, and either runs the business handler
// or refuses with a machine-readable reason.
import { NextResponse } from "next/server";
import { askDelegate, type DelegateChain } from "./delegate-client";
import { takeToken, clientKey, sleep } from "./friction";
import { logEvent } from "./events";
import { taxpayerFromRequest } from "./session";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";
import { withPrincipalCapacity, REFUSAL_STATUS, type Admitted } from "./capacity";
import { config, UNTRUSTED_DELAY_MS } from "./config";

export type Actor =
  | { kind: "SELF" }
  | { kind: "AGENT"; name: string; id: string; chain: DelegateChain };
export type Handler = (ctx: { taxpayer: Taxpayer; actor: Actor; body: Record<string, unknown>; admitted: Admitted }) => Promise<Record<string, unknown>>;

const STATUS: Record<string, number> = {
  PERMISSION_MISSING: 403, AUTHORISATION_REVOKED: 403, AUTHORISATION_EXPIRED: 403, NO_AUTHORISATION: 403,
  STEP_UP_REQUIRED: 403, CAPACITY_EXCEEDED: 429, DELEGATION_DEPTH_EXCEEDED: 403,
};

export function requireDelegatedAuthority(capability: string, handler: Handler) {
  return async function route(req: Request): Promise<NextResponse> {
    const started = Date.now();
    const path = new URL(req.url).pathname;
    const evidence = { userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, runTag: req.headers.get("x-run-tag")?.slice(0, 80) ?? null };
    const log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs" | "capability">) =>
      logEvent({ ...evidence, ...e, path, capability, latencyMs: Date.now() - started });
    const body = await readBody(req);

    // Lane 1: a person signed in to HMRC, acting for themselves — or an agent
    // HMRC can't see, inside their browser. Either way, it's their capacity.
    const person = await taxpayerFromRequest(req);
    if (person) {
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

    // Lane 2: an agent presenting its own GOV.UK Delegate token (or a sub-agent's
    // delegation token) and the person it claims to act for.
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const principalId = req.headers.get("x-principal-id");
    if (token && principalId) {
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

    // Lane 3: nobody we can identify. Slower, tightly limited, and no structured API.
    const rl = takeToken(`anon:${clientKey(req)}`, "UNTRUSTED");
    if (!rl.allowed) {
      await log({ lane: "UNTRUSTED", outcome: "THROTTLED" });
      return new NextResponse("Too many requests.\n", { status: 429, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": String(rl.resetSeconds), "x-trusted-lane": "UNTRUSTED" } });
    }
    await sleep(UNTRUSTED_DELAY_MS);
    await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "NOT_IDENTIFIED" });
    return new NextResponse(
      `Not accepted. Sign in with GOV.UK One Login, or, if you are an agent acting for someone, register and get their permission at ${config.delegateUrl}\n`,
      { status: 401, headers: { "content-type": "text/plain; charset=utf-8", "x-trusted-lane": "UNTRUSTED", "x-ratelimit-limit": String(rl.limit) } },
    );
  };
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
