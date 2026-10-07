// What HMRC added to let authorised agents through: this file.
//
// Every API route is wrapped in requireDelegatedAuthority(capability, handler).
// It works out which lane the caller is in, asks GOV.UK Delegate one question
// when an agent is acting for someone, logs the outcome, and either runs the
// business handler or refuses with a machine-readable reason.
import { NextResponse } from "next/server";
import { askDelegate } from "./delegate-client";
import { takeToken, clientKey, sleep } from "./friction";
import { logEvent } from "./events";
import { taxpayerFromRequest } from "./session";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";
import { config, UNTRUSTED_DELAY_MS } from "./config";

export type Actor = { kind: "SELF" } | { kind: "AGENT"; name: string; id: string };
export type Handler = (ctx: { taxpayer: Taxpayer; actor: Actor; body: Record<string, unknown> }) => Promise<Record<string, unknown>>;

const STATUS: Record<string, number> = { PERMISSION_MISSING: 403, AUTHORISATION_REVOKED: 403, AUTHORISATION_EXPIRED: 403, NO_AUTHORISATION: 403 };

export function requireDelegatedAuthority(capability: string, handler: Handler) {
  return async function route(req: Request): Promise<NextResponse> {
    const started = Date.now();
    const path = new URL(req.url).pathname;
    const log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs" | "capability">) =>
      logEvent({ ...e, path, capability, latencyMs: Date.now() - started });

    // Lane 1: a person signed in to HMRC, acting for themselves.
    const person = await taxpayerFromRequest(req);
    if (person) {
      const rl = takeToken(`human:${person.id}`, "AUTHENTICATED_HUMAN");
      if (!rl.allowed) {
        await log({ lane: "AUTHENTICATED_HUMAN", outcome: "THROTTLED", subject: person.oneLoginSubject });
        return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(rl.resetSeconds) } });
      }
      const result = await handler({ taxpayer: person, actor: { kind: "SELF" }, body: await readBody(req) });
      await log({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", subject: person.oneLoginSubject });
      return NextResponse.json({ decision: "ALLOW", lane: "AUTHENTICATED_HUMAN", result });
    }

    // Lane 2: an agent presenting its own GOV.UK Delegate token and the person it claims to act for.
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const principalId = req.headers.get("x-principal-id");
    if (token && principalId) {
      const check = await askDelegate({ agent_token: token, principal_id: principalId, capability });
      const agent = check.delegate ? { agentName: check.delegate.name, agentId: check.delegate.id } : {};
      if (!check.authorised) {
        const lane = check.delegate ? "AUTHORISED_AGENT" : "UNTRUSTED";
        await log({ lane, outcome: "REFUSED", reason: check.reason, ...agent, delegateCheckId: check.check_id });
        return NextResponse.json({ decision: "DENY", reason: check.reason, lane, delegate_check_id: check.check_id }, { status: STATUS[check.reason] ?? 401, headers: { "x-trusted-lane": lane } });
      }
      const rl = takeToken(`agent:${check.delegate.id}`, "AUTHORISED_AGENT");
      if (!rl.allowed) {
        await log({ lane: "AUTHORISED_AGENT", outcome: "THROTTLED", ...agent, subject: check.subject });
        return NextResponse.json({ decision: "DENY", reason: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(rl.resetSeconds) } });
      }
      // The One Login subject Delegate returned is the same one HMRC saw when the person signed in.
      const taxpayer = await findOrCreateTaxpayer(check.subject);
      const result = await handler({ taxpayer, actor: { kind: "AGENT", name: check.delegate.name, id: check.delegate.id }, body: await readBody(req) });
      await log({ lane: "AUTHORISED_AGENT", outcome: "ALLOWED", reason: "VALID_AUTHORISATION", ...agent, subject: check.subject, delegateCheckId: check.check_id });
      return NextResponse.json(
        { decision: "ALLOW", lane: "AUTHORISED_AGENT", acting_for: taxpayer.name, delegate_check_id: check.check_id, result },
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

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") return {};
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}
