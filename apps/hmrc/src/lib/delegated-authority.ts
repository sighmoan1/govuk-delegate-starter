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
import { randomUUID } from "node:crypto";
import { askDelegate, reportOutcome, reserveStepUp, recordStepUpDone, giveBackStepUp, DelegateUnavailableError, type DelegateChain } from "./delegate-client";
import { STEP_UP_CAPABILITIES, buildProposal } from "./proposals";
import { takeToken, clientKey, sleep } from "./friction";
import { logEvent, refusalEventFields } from "./events";
import { retryHeaders } from "./throughput";
import { taxpayerFromRequest } from "./session";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";
import { runOperation, REFUSAL_STATUS, type Admitted, type Refusal, type Tx } from "./operation";
import { verifyAgentSignature } from "./agent-identity";
import { agentSessionFromRequest } from "./agent-session";
import { config, UNTRUSTED_DELAY_MS } from "./config";
import { ASYNC_OPERATIONS } from "./transaction-queue";
import { freshReceipt, isReceipt, statusUrl } from "./transactions";
import { isStorageFailure, prefersAsync } from "./acceptance";

export type Actor =
  | { kind: "SELF" }
  | { kind: "AGENT"; name: string; id: string; chain: DelegateChain };
/**
 * `async` is true when the caller asked for the claim to be received now and processed later (Prefer: respond-async)
 * on an operation that has that path; `checkId` is GOV.UK Delegate's check for this request (agents only).
 */
export type Handler = (ctx: { taxpayer: Taxpayer; actor: Actor; body: Record<string, unknown>; admitted: Admitted; db: Tx; req: Request; async: boolean; checkId: string | null }) => Promise<Record<string, unknown>>;

/** What the wrapper knows about this request, for the handler and for the answer when durable acceptance fails. */
type Rc = { req: Request; async: boolean; trace: { lane?: "AUTHENTICATED_HUMAN" | "AUTHORISED_AGENT"; subject?: string; agentName?: string; agentId?: string } };


const STATUS: Record<string, number> = {
  MANDATE_CONSTRAINT_REFUSED:403, CONSTRAINTS_INVALID:403, CATALOGUE_INCOMPATIBLE:403,
  PERMISSION_MISSING: 403, AUTHORISATION_REVOKED: 403, AUTHORISATION_EXPIRED: 403, NO_AUTHORISATION: 403,
  STEP_UP_REQUIRED: 403, STEP_UP_NOT_APPROVED: 403, STEP_UP_IN_USE: 409, STEP_UP_ALREADY_USED: 409, IDEMPOTENCY_KEY_REQUIRED: 400, DELEGATION_DEPTH_EXCEEDED: 403, ASSURANCE_TOO_LOW: 403, AGENT_NOT_AUTHORISED: 403, AGENT_SESSION_NOT_BOUND: 401,
};

type Log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs" | "capability">) => Promise<unknown>;

export function requireDelegatedAuthority(capability: string, handler: Handler, options: { extraBody?: (req: Request) => Record<string, unknown> } = {}) {
  return async function route(req: Request): Promise<NextResponse> {
    const rc: Rc = { req, async: ASYNC_OPERATIONS.has(capability) && prefersAsync(req), trace: {} };
    try {
      return await handle(req, rc);
    } catch (e) {
      // A request to be processed later is only ever answered 202 once it is durably stored. If the store itself
      // failed we cannot know whether it committed; either way the client's retry (same Idempotency-Key) is safe.
      if (rc.async && isStorageFailure(e)) return acceptanceUnavailable(req, capability, rc);
      throw e;
    }
  };

  async function handle(req: Request, rc: Rc): Promise<NextResponse> {
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
    const body = { ...(await readBody(req)), ...options.extraBody?.(req) };
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? null;

    // An agent acting in a browser, after the person approved it on GOV.UK.
    const agentSession = await agentSessionFromRequest(req);
    if (agentSession) {
      // A session given to a signing agent only works with that agent's signature.
      if (agentSession.signatureAgent && !(sig.verified && sig.agent === agentSession.signatureAgent)) {
        await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "AGENT_SESSION_NOT_BOUND", agentName: agentSession.agentName, subject: agentSession.subject });
        return refusal("AGENT_SESSION_NOT_BOUND", "UNTRUSTED", { message: "This session belongs to a different agent." });
      }
      return actAsAgent(agentSession.delegationToken, agentSession.principalId, capability, body, handler, log, idempotencyKey, rc);
    }

    // An agent presenting its own GOV.UK Delegate token (or a sub-agent's delegation token).
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const principalId = req.headers.get("x-principal-id");
    if (token && principalId) return actAsAgent(token, principalId, capability, body, handler, log, idempotencyKey, rc);

    // A person signed in to HMRC.
    const person = await taxpayerFromRequest(req);
    if (person) {
      // ...unless the browser signs its requests as an AI agent: that's an agent
      // using the person's own session or password, not the person.
      if (sig.verified) return declaredAgent(sig.name, req, log, person.oneLoginSubject);
      // An agent HMRC can't see would look exactly like this. It draws on this
      // person's business rules and this person's traffic budget, because both
      // are keyed to the person.
      rc.trace.lane = "AUTHENTICATED_HUMAN";
      rc.trace.subject = person.oneLoginSubject;
      const run = await runOperation(person, capability, body, (admitted, db) => handler({ taxpayer: person, actor: { kind: "SELF" }, body, admitted, db, req, async: rc.async, checkId: null }), { idempotencyKey, operator: { kind: "human", key: person.id }, requireKey: rc.async });
      if (!run.ok) {
        const f = run.refusal;
        await log({ lane: "AUTHENTICATED_HUMAN", subject: person.oneLoginSubject, ...refusalEventFields(f, run.costClass) });
        return refuseRun(f, "AUTHENTICATED_HUMAN");
      }
      await log({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", ...allowReason(run), costClass: run.costClass, subject: person.oneLoginSubject, rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit });
      return allow(run, (result) => ({ decision: "ALLOW", lane: "AUTHENTICATED_HUMAN", result, capacity: capacityJson(run.admitted), ...replayJson(run.replayed) }), replayHeaders(run.replayed));
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
  }
}

async function actAsAgent(token: string, principalId: string, capability: string, body: Record<string, unknown>, handler: Handler, log: Log, idempotencyKey: string | null, rc: Rc) {
  try {
    return await actAsAgentChecked(token, principalId, capability, body, handler, log, idempotencyKey, rc);
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

/** Delegate's approval for this change could not be used to start it. Thrown inside the transaction so nothing is written. */
class StepUpRefused extends Error {
  constructor(readonly reason: string, readonly extra: Record<string, unknown>) { super(reason); }
}

async function actAsAgentChecked(token: string, principalId: string, capability: string, body: Record<string, unknown>, handler: Handler, log: Log, idempotencyKey: string | null, rc: Rc) {
  // High-risk changes: the person approves THIS change. Tell Delegate exactly what it is.
  const built = STEP_UP_CAPABILITIES.has(capability) ? buildProposal(capability, body, idempotencyKey) : null;
  const proposal = built?.ok ? built.proposal : undefined;
  const check = await askDelegate({ agent_token: token, principal_id: principalId, capability, constraint_context:body, ...(proposal ? { proposal } : {}) });
  const chainLog = check.chain
    ? { mandateId: check.chain.mandate_id, delegationId: check.chain.delegation_id, parentDelegationId: check.chain.parent_delegation_id, depth: check.chain.depth, agentLabel: check.chain.label, assurance: check.chain.assurance }
    : {};
  const agent = check.delegate ? { agentName: check.delegate.name, agentId: check.delegate.id } : {};
  if (!check.authorised) {
    const lane = check.delegate ? "AUTHORISED_AGENT" : "UNTRUSTED";
    // Permitted in principle, but the request itself is not one the person could be asked to approve.
    const malformed = check.step_up?.state === "PROPOSAL_REQUIRED" && built && !built.ok ? built : null;
    const keyReused = check.step_up?.state === "KEY_USED_FOR_OTHER_TRANSACTION";
    const reason = malformed ? malformed.reason : keyReused ? "IDEMPOTENCY_KEY_REUSED" : check.reason;
    await log({
      lane, outcome: "REFUSED", reason, ...agent, ...chainLog, delegateCheckId: check.check_id,
    });
    return refusal(reason, lane, {
      delegate_check_id: check.check_id,
      ...(malformed ? { message: malformed.message } : {}),
      ...(keyReused ? { message: check.step_up?.message } : {}),
      ...(check.step_up && !malformed && !keyReused ? { step_up: check.step_up } : {}),
    });
  }
  // The One Login subject Delegate returned is the same one HMRC saw when the person signed in.
  const taxpayer = await findOrCreateTaxpayer(check.subject);
  const actor: Actor = { kind: "AGENT", name: check.delegate.name, id: check.delegate.id, chain: check.chain };
  Object.assign(rc.trace, { lane: "AUTHORISED_AGENT", subject: check.subject, agentName: check.delegate.name, agentId: check.delegate.id });
  // Delegate's check said yes, and it spends nothing. Traffic and business rules are HMRC's, and are applied now (operation.ts).
  // For a change the person had to approve, the approval is only ever reserved here, inside the same transaction as the
  // change, after throughput and the business rules have admitted it (so a refusal spends nothing), and never for a replay.
  const approval = check.step_up;
  const held: { reservationId?: string } = {};
  let run;
  try {
    run = await runOperation(taxpayer, capability, body, async (admitted, db) => {
      if (approval) {
        // runOperation has already answered a retry of a change HMRC made from its stored result,
        // without getting here. Reaching here means this would be a NEW change.
        if (!proposal || !approval.proposal_id) throw new StepUpRefused("STEP_UP_NOT_APPROVED", { message: "There is no approval for this change." });
        if (approval.state === "REDEEMED") {
          throw new StepUpRefused("STEP_UP_ALREADY_USED", { message: "The person's approval for this change was already used, and HMRC holds no result for it. Ask for a new approval with a new Idempotency-Key." });
        }
        const reservationId = randomUUID();
        const r = await reserveStepUp({ agent_token: token, principal_id: principalId, capability, proposal, reservation_id: reservationId });
        if (!r.reserved) {
          throw new StepUpRefused(r.reason, { message: r.message, ...(r.state ? { step_up_state: r.state } : {}), ...(r.retryAfterSeconds ? { retry_after_seconds: r.retryAfterSeconds } : {}) });
        }
        held.reservationId = reservationId;
      }
      return handler({ taxpayer, actor, body, admitted, db, req: rc.req, async: rc.async, checkId: check.check_id });
    }, { idempotencyKey, operator: { kind: "agent", key: check.delegate.id }, requireKey: rc.async });
  } catch (e) {
    // Rolled back: no change was made. Hand the approval back (Delegate's lease is the backstop if this call is lost).
    if (held.reservationId && approval?.proposal_id) await giveBackStepUp({ proposal_id: approval.proposal_id, reservation_id: held.reservationId });
    if (e instanceof StepUpRefused) {
      await reportOutcome({ check_id: check.check_id, status: "FAILED", reason: e.reason });
      await log({ lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: e.reason, ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id, costClass: "write", authorisedCheck: true });
      return refusal(e.reason, "AUTHORISED_AGENT", { ...e.extra, delegate_check_id: check.check_id });
    }
    await reportOutcome({ check_id: check.check_id, status: "FAILED", reason: "HANDLER_ERROR" });
    throw e;
  }
  if (!run.ok) {
    const f = run.refusal;
    await reportOutcome({ check_id: check.check_id, status: "FAILED", reason: f.reason });
    await log({ lane: "AUTHORISED_AGENT", ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id, authorisedCheck: true, ...refusalEventFields(f, run.costClass) });
    return refuseRun(f, "AUTHORISED_AGENT", { delegate_check_id: check.check_id });
  }
  const res = run.result as Record<string, unknown>;
  const reference = [res.claim_reference, res.change_reference].find((v) => typeof v === "string") as string | undefined;
  // Received for later processing is ACCEPTED, not COMPLETED; the worker reports how it ended (worker.ts).
  if (isReceipt(res)) await reportOutcome({ check_id: check.check_id, status: "ACCEPTED", reference: res.transaction_id });
  else await reportOutcome({ check_id: check.check_id, status: "COMPLETED", reference: reference ?? null });
  // The change exists: spend the approval. Also done when answering a retry from the stored result, which finishes
  // what a crash between HMRC's own write and this call may have left. Failure here changes nothing for the caller:
  // the approval is bound to this Idempotency-Key, and HMRC's stored result answers any further attempt with it.
  if (approval?.proposal_id && (held.reservationId || (run.replayed && approval.state !== "REDEEMED"))) {
    if (!(await recordStepUpDone({ proposal_id: approval.proposal_id, reference: reference ?? null }))) console.warn(`[step-up] could not record the use of ${approval.proposal_id}; a retry with the same Idempotency-Key will`);
  }
  await log({
    lane: "AUTHORISED_AGENT", outcome: "ALLOWED", reason: run.replayed ? "IDEMPOTENT_REPLAY" : isReceipt(run.result) ? "ACCEPTED_FOR_PROCESSING" : "VALID_AUTHORISATION", ...agent, ...chainLog, subject: check.subject, delegateCheckId: check.check_id,
    rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit, costClass: run.costClass, authorisedCheck: true,
  });
  return allow(
    run,
    (result) => ({ decision: "ALLOW", lane: "AUTHORISED_AGENT", acting_for: taxpayer.name, tell_the_person: `Tell ${taxpayer.name} what you just did. They can see it, and change or remove your access, at ${config.delegateUrl}/account/delegates`, delegate_check_id: check.check_id, result, capacity: capacityJson(run.admitted), ...replayJson(run.replayed) }),
    { ...replayHeaders(run.replayed), "x-trusted-lane": "AUTHORISED_AGENT" },
  );
}

const allowReason = (run: { replayed: boolean; result: unknown }) => (run.replayed ? { reason: "IDEMPOTENT_REPLAY" } : isReceipt(run.result) ? { reason: "ACCEPTED_FOR_PROCESSING" } : {});

/**
 * 200 with the result, or 202 with a Location when the result is a receipt for a claim to be processed later.
 * A retry of a receipt is answered with where the claim has got to now.
 */
async function allow(run: { result: unknown; replayed: boolean }, build: (result: unknown) => Record<string, unknown>, headers: Record<string, string>) {
  if (!isReceipt(run.result)) return NextResponse.json(build(run.result), { headers });
  const receipt = run.replayed ? await freshReceipt(run.result) : run.result;
  return NextResponse.json(build(receipt), { status: 202, headers: { ...headers, location: statusUrl(receipt.transaction_id), "preference-applied": "respond-async" } });
}

/** The claim could not be stored, so it was not received. Nothing was accepted; the same request can be sent again. */
async function acceptanceUnavailable(req: Request, capability: string, rc: Rc) {
  const retryAfterSeconds = 30;
  const t = rc.trace;
  if (t.lane) {
    // Best effort: the store that just failed is the one the log is in.
    await logEvent({ lane: t.lane, outcome: "REFUSED", reason: "SERVICE_UNAVAILABLE", path: new URL(req.url).pathname, capability, subject: t.subject ?? null, agentName: t.agentName ?? null, agentId: t.agentId ?? null, latencyMs: 0, retryAfterSeconds, costClass: "write" }).catch(() => undefined);
  }
  return NextResponse.json(
    {
      decision: "DENY", reason: "SERVICE_UNAVAILABLE", kind: "UNAVAILABLE", lane: t.lane ?? "UNKNOWN", retryable: true, retry_after_seconds: retryAfterSeconds, accepted: false, entitlement_affected: false,
      message: "HMRC could not safely store your claim, so it has not been received. Nothing has been decided. Send the same request again, with the same Idempotency-Key, after the Retry-After time; if it was in fact stored, you will get the original receipt back and nothing will be made twice.",
    },
    { status: 503, headers: { "retry-after": String(retryAfterSeconds), ...(t.lane ? { "x-trusted-lane": t.lane } : {}) } },
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
  const wait: Record<string, string> = typeof extra.retry_after_seconds === "number" ? { "retry-after": String(extra.retry_after_seconds) } : {};
  return NextResponse.json(
    { decision: "DENY", reason, kind: "AUTHORITY_REFUSAL", lane, ...extra },
    { status: REFUSAL_STATUS[reason] ?? STATUS[reason] ?? 401, headers: { "x-trusted-lane": lane, ...wait } },
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
