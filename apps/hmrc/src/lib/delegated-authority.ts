// What HMRC added to let authorised agents through: this file.
//
// Every API route is wrapped in requireDelegatedAuthority(capability, handler).
// It works out who is on the other end (a person, an authorised agent, an
// agent without permission, or nobody it can identify), asks GOV.UK Delegate
// one question when an agent is acting for someone, admits the request
// (throughput.ts: traffic limits), checks the transaction is permissible
// (domain-policy.ts: the person's business rules, whoever is acting), logs the
// outcome, and either runs the business handler or refuses with a
// machine-readable reason.
//
// Three kinds of "no" stay apart in the response (`kind`) and in the log:
// identity/permission (401/403), business refusal (409/404/400) and technical
// throttle or unavailability (429/503, with Retry-After).
//
// Detection (the agent's signature) is evidence, not the boundary: the
// business rules are keyed to the person, so they hold even when HMRC can't
// see the agent.
import { NextResponse } from "next/server";
import { askDelegate, reportOutcome, DelegateUnavailableError, type DelegateChain } from "./delegate-client";
import { takeToken, clientKey, sleep } from "./friction";
import { logEvent, refusalEventFields } from "./events";
import { retryHeaders } from "./throughput";
import { taxpayerFromRequest } from "./session";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";
import { runOperation, REFUSAL_STATUS, type Admitted, type Refusal, type Tx } from "./operation";
import { verifyAgentSignature } from "./agent-identity";
import { agentSessionFromRequest } from "./agent-session";
import { config, UNTRUSTED_DELAY_MS } from "./config";

export type Actor =
  | { kind: "SELF" }
  | { kind: "AGENT"; name: string; id: string; chain: DelegateChain };
export type Handler = (ctx: { taxpayer: Taxpayer; actor: Actor; body: Record<string, unknown>; admitted: Admitted; db: Tx }) => Promise<Record<string, unknown>>;

const STATUS: Record<string, number> = {
  PERMISSION_MISSING: 403, AUTHORISATION_REVOKED: 403, AUTHORISATION_EXPIRED: 403, NO_AUTHORISATION: 403,
  STEP_UP_REQUIRED: 403, DELEGATION_DEPTH_EXCEEDED: 403, ASSURANCE_TOO_LOW: 403, AGENT_NOT_AUTHORISED: 403, AGENT_SESSION_NOT_BOUND: 401,
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
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;

    // An agent acting in a browser, after the person approved it on GOV.UK.
    const agentSession = await agentSessionFromRequest(req);
    if (agentSession) {
      // A session given to a signing agent only works with that agent's signature.
      if (agentSession.signatureAgent && !(sig.verified && sig.agent === agentSession.signatureAgent)) {
        await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "AGENT_SESSION_NOT_BOUND", agentName: agentSession.agentName, subject: agentSession.subject });
        return refusal("AGENT_SESSION_NOT_BOUND", "UNTRUSTED", { message: "This session belongs to a different agent." });
      }
      return actAsAgent(agentSession.delegationToken, agentSession.principalId, capability, body, handler, log, idempotencyKey);
    }

    // An agent presenting its own GOV.UK Delegate token (or a sub-agent's delegation token).
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const principalId = req.headers.get("x-principal-id");
    if (token && principalId) return actAsAgent(token, principalId, capability, body, handler, log, idempotencyKey);

    // A person signed in to HMRC.
    const person = await taxpayerFromRequest(req);
    if (person) {
      // ...unless the browser signs its requests as an AI agent: that's an agent
      // using the person's own session or password, not the person.
      if (sig.verified) return declaredAgent(sig.name, req, log, person.oneLoginSubject);
      // An agent HMRC can't see would look exactly like this. It draws on this
      // person's business rules and this person's traffic budget, because both
      // are keyed to the person.
      const run = await runOperation(person, capability, body, (admitted, db) => handler({ taxpayer: person, actor: { kind: "SELF" }, body, admitted, db }), { idempotencyKey, operator: { kind: "human", key: person.id } });
      if (!run.ok) {
        const f = run.refusal;
        await log({ lane: "AUTHENTICATED_HUMAN", subject: person.oneLoginSubject, ...refusalEventFields(f, run.costClass) });
        return refuseRun(f, "AUTHENTICATED_HUMAN");
      }
      await log({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", ...(run.replayed ? { reason: "IDEMPOTENT_REPLAY" } : {}), costClass: run.costClass, subject: person.oneLoginSubject, rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit });
      return NextResponse.json({ decision: "ALLOW", lane: "AUTHENTICATED_HUMAN", result: run.result, capacity: capacityJson(run.admitted), ...replayJson(run.replayed) }, { headers: replayHeaders(run.replayed) });
    }

    // A known agent with no permission: show it the proper route. Better than
    // the treatment for traffic that won't say what it is.
    if (sig.verified) return declaredAgent(sig.name, req, log, null);

    // Nobody we can identify. Slower, tightly limited, and no structured API.
    const rl = takeToken(`anon:${clientKey(req)}`, "UNTRUSTED");
    if (!rl.allowed) {
      await log({ lane: "UNTRUSTED", outcome: "THROTTLED", reason: "RATE_LIMITED", throttleScope: "operator", retryAfterSeconds: rl.resetSeconds });
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

async function actAsAgent(token: string, principalId: string, capability: string, body: Record<string, unknown>, handler: Handler, log: Log, idempotencyKey: string | null) {
  try {
    return await actAsAgentChecked(token, principalId, capability, body, handler, log, idempotencyKey);
  } catch (e) {
    if (!(e instanceof DelegateUnavailableError)) throw e;
    // Delegate couldn't answer, or couldn't record the receipt. That is not a "no" and not a "yes": nothing was accepted.
    await log({ lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: "DELEGATE_UNAVAILABLE", retryAfterSeconds: 30 });
    return NextResponse.json(
      { decision: "DENY", reason: "DELEGATE_UNAVAILABLE", kind: "UNAVAILABLE", lane: "AUTHORISED_AGENT", retryable: true, retry_after_seconds: 30, message: "GOV.UK Delegate is not available, so nothing was done. Try the same request again shortly; retries will not duplicate anything." },
      { status: 503, headers: { "retry-after": "30", "x-trusted-lane": "AUTHORISED_AGENT" } },
    );
  }
}

async function actAsAgentChecked(token: string, principalId: string, capability: string, body: Record<string, unknown>, handler: Handler, log: Log, idempotencyKey: string | null) {
  const check = await askDelegate({ agent_token: token, principal_id: principalId, capability });
  const chainLog = check.chain
    ? { mandateId: check.chain.mandate_id, delegationId: check.chain.delegation_id, parentDelegationId: check.chain.parent_delegation_id, depth: check.chain.depth, agentLabel: check.chain.label, assurance: check.chain.assurance }
    : {};
  const agent = check.delegate ? { agentName: check.delegate.name, agentId: check.delegate.id } : {};
  if (!check.authorised) {
    const lane = check.delegate ? "AUTHORISED_AGENT" : "UNTRUSTED";
    await log({
      lane, outcome: "REFUSED", reason: check.reason, ...agent, ...chainLog, delegateCheckId: check.check_id,
    });
    return refusal(check.reason, lane, {
      delegate_check_id: check.check_id,
      ...(check.step_up ? { step_up: check.step_up } : {}),
    });
  }
  // The One Login subject Delegate returned is the same one HMRC saw when the person signed in.
  const taxpayer = await findOrCreateTaxpayer(check.subject);
  const actor: Actor = { kind: "AGENT", name: check.delegate.name, id: check.delegate.id, chain: check.chain };
  // Delegate's check said yes, and it spends nothing. Traffic and business rules are HMRC's, and are applied now.
  const run = await runOperation(taxpayer, capability, body, (admitted, db) => handler({ taxpayer, actor, body, admitted, db }), { idempotencyKey, operator: { kind: "agent", key: check.delegate.id } }).catch(async (e) => {
    await reportOutcome({ check_id: check.check_id, status: "FAILED", reason: "HANDLER_ERROR" });
    throw e;
  });
  if (!run.ok) {
    const f = run.refusal;
    await reportOutcome({ check_id: check.check_id, status: "FAILED", reason: f.reason });
    await log({ lane: "AUTHORISED_AGENT", ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id, authorisedCheck: true, ...refusalEventFields(f, run.costClass) });
    return refuseRun(f, "AUTHORISED_AGENT", { delegate_check_id: check.check_id });
  }
  const res = run.result as Record<string, unknown>;
  const reference = [res.claim_reference, res.change_reference].find((v) => typeof v === "string") as string | undefined;
  await reportOutcome({ check_id: check.check_id, status: "COMPLETED", reference: reference ?? null });
  await log({
    lane: "AUTHORISED_AGENT", outcome: "ALLOWED", reason: run.replayed ? "IDEMPOTENT_REPLAY" : "VALID_AUTHORISATION", ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id,
    rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit, costClass: run.costClass, authorisedCheck: true,
  });
  return NextResponse.json(
    { decision: "ALLOW", lane: "AUTHORISED_AGENT", acting_for: taxpayer.name, tell_the_person: `Tell ${taxpayer.name} what you just did. They can see it, and change or remove your access, at ${config.delegateUrl}/account/delegates`, delegate_check_id: check.check_id, result: run.result, capacity: capacityJson(run.admitted), ...replayJson(run.replayed) },
    { headers: { ...replayHeaders(run.replayed), "x-trusted-lane": "AUTHORISED_AGENT" } },
  );
}

/** A known agent without permission: a clear, structured way to the proper route. No slowdown. */
async function declaredAgent(name: string, req: Request, log: Log, subject: string | null) {
  const rl = takeToken(`declared:${clientKey(req)}`, "DECLARED_AGENT");
  if (!rl.allowed) {
    await log({ lane: "DECLARED_AGENT", outcome: "THROTTLED", reason: "RATE_LIMITED", throttleScope: "operator", retryAfterSeconds: rl.resetSeconds, agentName: name, subject });
    return NextResponse.json(
      { decision: "DENY", reason: "RATE_LIMITED", kind: "TECHNICAL_THROTTLE", lane: "DECLARED_AGENT", retryable: true, retry_after_seconds: rl.resetSeconds, scope: "operator", entitlement_affected: false },
      { status: 429, headers: { "retry-after": String(rl.resetSeconds), "x-ratelimit-limit": String(rl.limit) } },
    );
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
// A retry answered from the first attempt's stored outcome: same result and reference, nothing run again.
const replayJson = (replayed: boolean) => (replayed ? { idempotent_replay: true } : {});
const replayHeaders = (replayed: boolean): Record<string, string> => (replayed ? { "idempotent-replayed": "true" } : {});

/** Identity or permission refused (401/403) is the default `kind`. Business, throttle and unavailable answers set their own. */
function refusal(reason: string, lane: string, extra: Record<string, unknown>) {
  return NextResponse.json(
    { decision: "DENY", reason, kind: "AUTHORITY_REFUSAL", lane, ...extra },
    { status: REFUSAL_STATUS[reason] ?? STATUS[reason] ?? 401, headers: { "x-trusted-lane": lane } },
  );
}

/** The response for a refusal from runOperation: 429 or 503 with Retry-After, or a business 409/404/400. */
function refuseRun(f: Refusal, lane: string, extra: Record<string, unknown> = {}) {
  if (f.kind === "TECHNICAL_THROTTLE") {
    return NextResponse.json(
      {
        decision: "DENY", reason: f.reason, kind: f.kind, lane, retryable: true, retry_after_seconds: f.retryAfterSeconds, scope: f.scope, cost_class: f.costClass, operation: f.operation,
        rule: f.rule, limit: f.limit, window_seconds: f.windowSeconds, resets_at: f.resetsAt, entitlement_affected: false, message: f.message, ...extra,
      },
      { status: 429, headers: { ...retryHeaders(f), "x-trusted-lane": lane } },
    );
  }
  if (f.kind === "UNAVAILABLE") {
    return NextResponse.json(
      { decision: "DENY", reason: f.reason, kind: f.kind, lane, retryable: true, retry_after_seconds: f.retryAfterSeconds, cost_class: f.costClass, operation: f.operation, entitlement_affected: false, message: f.message, ...extra },
      { status: 503, headers: { ...retryHeaders(f), "x-trusted-lane": lane } },
    );
  }
  return refusal(f.reason, lane, { kind: f.kind, retryable: false, rule: f.rule, limit: f.limit, used: f.used, resets_at: f.resetsAt, message: f.message, ...extra });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams); // e.g. ?since=
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}
