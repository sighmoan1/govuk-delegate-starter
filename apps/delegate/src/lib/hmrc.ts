import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Lane, Reason } from "@/generated/prisma";
import { prisma } from "./db";
import { SERVICE_SLUG, LANE_LIMITS } from "./config";
import { bearer, verifyAgentToken } from "./agent-auth";
import { recordActivity } from "./activity";
import { checkRelationship } from "./delegate-client";
import { takeToken } from "./ratelimit";
import { principalFromRequest } from "./session";
import { CAPABILITY_COPY } from "./capabilities";

export type ServiceContext = {
  requestId: string;
  lane: Lane;
  principal: { id: string; displayName: string };
  body: Record<string, unknown>;
};

const STATUS: Record<string, number> = {
  UNKNOWN_DELEGATE: 401,
  INVALID_AGENT_AUTHENTICATION: 401,
  RATE_LIMITED: 429,
  PERMISSION_MISSING: 403,
  AUTHORISATION_REVOKED: 403,
  AUTHORISATION_EXPIRED: 403,
  NO_AUTHORISATION: 403,
};

function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function headers(lane: Lane, rl: { limit: number; remaining: number; resetSeconds: number }, requestId: string) {
  return {
    "x-trusted-lane": lane,
    "x-request-id": requestId,
    "x-ratelimit-limit": String(rl.limit),
    "x-ratelimit-remaining": String(rl.remaining),
    "x-ratelimit-reset": String(rl.resetSeconds),
  };
}

/**
 * Reusable middleware for the mock HMRC service. Business handlers never see
 * delegation logic: they run only if this has produced an ALLOW.
 *
 *   authenticate delegate → identify principal → ask Delegate (relationship,
 *   then capability) → write activity event → allow or reject.
 */
export function requireDelegatedAuthority(
  capability: string,
  handler: (ctx: ServiceContext) => Promise<Record<string, unknown>> | Record<string, unknown>,
) {
  return async function route(req: NextRequest): Promise<NextResponse> {
    const requestId = randomUUID();
    const service = await prisma.service.findUnique({ where: { slug: SERVICE_SLUG } });
    const base = { requestId, capability, serviceId: service?.id };

    const deny = async (
      lane: Lane,
      reason: Reason,
      extra: { principalId?: string | null; delegateId?: string | null; authorisationId?: string | null; presentedClientId?: string | null },
      rl: { limit: number; remaining: number; resetSeconds: number },
      structured: boolean,
    ) => {
      await recordActivity({ ...base, lane, decision: "DENY", reason, ...extra });
      const h = headers(lane, rl, requestId);
      if (!structured) {
        // Untrusted lane: no machine-readable error, deliberately.
        return new NextResponse("Request not accepted.\n", {
          status: STATUS[reason] ?? 403,
          headers: { ...h, "content-type": "text/plain; charset=utf-8", ...(reason === "RATE_LIMITED" ? { "retry-after": String(rl.resetSeconds) } : {}) },
        });
      }
      return NextResponse.json(
        { decision: "DENY", reason, lane, request_id: requestId, capability },
        { status: STATUS[reason] ?? 403, headers: reason === "RATE_LIMITED" ? { ...h, "retry-after": String(rl.resetSeconds) } : h },
      );
    };

    const allow = async (
      lane: Lane,
      reason: Reason,
      principal: { id: string; displayName: string },
      extra: { delegateId?: string | null; authorisationId?: string | null },
      rl: { limit: number; remaining: number; resetSeconds: number },
    ) => {
      await recordActivity({ ...base, lane, decision: "ALLOW", reason, principalId: principal.id, ...extra });
      let body: Record<string, unknown> = {};
      if (req.method !== "GET") body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const result = await handler({ requestId, lane, principal, body });
      return NextResponse.json(
        { decision: "ALLOW", reason, lane, request_id: requestId, capability, result },
        { status: 200, headers: headers(lane, rl, requestId) },
      );
    };

    const token = bearer(req);

    // ── No agent credentials: a signed-in person, or the untrusted lane.
    if (!token) {
      const human = await principalFromRequest(req);
      if (human) {
        const rl = takeToken(`human:${human.id}`, LANE_LIMITS.AUTHENTICATED_HUMAN);
        if (!rl.allowed) return deny("AUTHENTICATED_HUMAN", "RATE_LIMITED", { principalId: human.id }, rl, true);
        return allow("AUTHENTICATED_HUMAN", "HUMAN_SESSION", human, {}, rl);
      }
      const rl = takeToken(`anon:${clientKey(req)}`, LANE_LIMITS.UNTRUSTED);
      return deny("UNTRUSTED", rl.allowed ? "INVALID_AGENT_AUTHENTICATION" : "RATE_LIMITED", {}, rl, false);
    }

    // ── 1. Authenticate the delegate (separate from any principal identity).
    const claims = await verifyAgentToken(token);
    if (!claims) {
      const rl = takeToken(`anon:${clientKey(req)}`, LANE_LIMITS.UNTRUSTED);
      return deny("UNTRUSTED", rl.allowed ? "INVALID_AGENT_AUTHENTICATION" : "RATE_LIMITED", {}, rl, true);
    }
    const delegate = await prisma.delegate.findUnique({ where: { id: claims.delegateId } });
    if (!delegate || delegate.status !== "ACTIVE") {
      const rl = takeToken(`anon:${clientKey(req)}`, LANE_LIMITS.UNTRUSTED);
      return deny("UNTRUSTED", rl.allowed ? "UNKNOWN_DELEGATE" : "RATE_LIMITED", { presentedClientId: claims.clientId }, rl, true);
    }

    // Known delegate: the trusted lane's throughput applies.
    const rl = takeToken(`delegate:${delegate.id}`, LANE_LIMITS.AUTHORISED_AGENT);
    if (!rl.allowed) return deny("AUTHORISED_AGENT", "RATE_LIMITED", { delegateId: delegate.id }, rl, true);

    // ── 2. Which principal does it say it represents?
    const principalId = req.headers.get("x-principal-id") ?? "";
    const principal = principalId ? await prisma.principal.findUnique({ where: { id: principalId } }) : null;
    if (!principal) return deny("AUTHORISED_AGENT", "NO_AUTHORISATION", { delegateId: delegate.id }, rl, true);

    // ── 3 + 4. Ask GOV.UK Delegate: is the relationship live, and does it cover this capability?
    const check = await checkRelationship({
      principal_id: principal.id,
      delegate_id: delegate.id,
      service: SERVICE_SLUG,
      capability,
    });
    const extra = { delegateId: delegate.id, principalId: principal.id, authorisationId: check.authorisation_id ?? null };
    if (!check.authorised) {
      return deny("AUTHORISED_AGENT", (check.reason as Reason) ?? "NO_AUTHORISATION", extra, rl, true);
    }
    return allow("AUTHORISED_AGENT", "VALID_AUTHORISATION", principal, extra, rl);
  };
}

// ── Mock business logic: synthetic data only. No delegation logic in here. ──

const ref = (p: string) => `${p}-${randomUUID().slice(0, 8).toUpperCase()}`;
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : fallback);

export const hmrcActions = {
  view_tax_code: ({ principal }: ServiceContext) => ({
    taxpayer: principal.displayName,
    tax_year: "2026 to 2027",
    tax_code: "1257L",
    employer: "Northwind Analytics Ltd (synthetic)",
    synthetic: true,
  }),
  claim_job_expenses: ({ body }: ServiceContext) => ({
    claim_reference: ref("JE"),
    expense: "Working from home",
    tax_year: str(body.tax_year, "2026 to 2027"),
    relief: "£6 a week, from 6 April 2026",
    new_tax_code: "1288L",
    synthetic: true,
  }),
  update_employment: ({ body }: ServiceContext) => ({
    change_reference: ref("EM"),
    update: str(body.update, "Employment details updated"),
    synthetic: true,
  }),
  change_refund_account: () => ({ updated: true, note: "Mock only: no bank details exist.", synthetic: true }),
  change_address: () => ({ updated: true, note: "Mock only: no address was changed.", synthetic: true }),
};
