import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAuthority } from "@/lib/authority";
import { verifyPresenterToken } from "@/lib/agent-auth";
import { recordActivity } from "@/lib/activity";
import { verifySecretCached } from "@/lib/secrets";
import { readJson } from "@/lib/http";
import { config } from "@/lib/config";

/**
 * The one call a government service makes before acting for someone on an
 * agent's say-so (HMRC-style relationship lookup).
 *
 *   POST /api/authorisations/check     x-service-key: <the service's own key>
 *   { agent_token, principal_id, service, capability }
 *
 * Identity: Delegate verifies the agent (or sub-agent) token itself.
 * Authority: a live mandate from the person, and a delegation chain covering the capability.
 * Capacity: one budget per person per service, shared by every agent acting for them.
 * The person's One Login subject is returned only when the answer is yes.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const slug = String(b.service ?? "");
  const service = slug ? await prisma.service.findUnique({ where: { slug } }) : null;
  const key = req.headers.get("x-service-key") ?? "";
  if (!service || !key || !verifySecretCached(key, service.apiKeyHash)) {
    return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  }

  const capability = String(b.capability ?? "");
  const principalId = String(b.principal_id ?? "");
  const base = { serviceId: service.id, capability: capability || null };

  // ── Identity
  const presenter = await verifyPresenterToken(String(b.agent_token ?? ""));
  if (!presenter) {
    const ev = await recordActivity({ ...base, lane: "UNTRUSTED", decision: "DENY", reason: "INVALID_AGENT_AUTHENTICATION" });
    return NextResponse.json({ authorised: false, reason: "INVALID_AGENT_AUTHENTICATION", check_id: ev.id });
  }
  if (presenter.kind === "agent") {
    const d = await prisma.delegate.findUnique({ where: { id: presenter.delegateId } });
    if (!d || d.status !== "ACTIVE") {
      const ev = await recordActivity({ ...base, lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE", presentedClientId: presenter.clientId || null });
      return NextResponse.json({ authorised: false, reason: "UNKNOWN_DELEGATE", check_id: ev.id });
    }
  }

  // ── Authority and capacity
  const principal = principalId ? await prisma.principal.findUnique({ where: { id: principalId } }) : null;
  const result = await checkAuthority({
    principalId,
    presenter: presenter.kind === "agent" ? { kind: "agent", delegateId: presenter.delegateId } : { kind: "delegation", delegationId: presenter.delegationId },
    service: slug,
    capability,
  });
  if (!result.authorised && result.reason === "UNKNOWN_DELEGATE") {
    const ev = await recordActivity({ ...base, lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE" });
    return NextResponse.json({ authorised: false, reason: "UNKNOWN_DELEGATE", check_id: ev.id });
  }
  const chain = result.chain;
  const delegateId = chain?.delegateId ?? (presenter.kind === "agent" ? presenter.delegateId : null);
  const delegate = delegateId ? await prisma.delegate.findUnique({ where: { id: delegateId } }) : null;
  const delegateInfo = delegate ? { id: delegate.id, name: delegate.name, provider: delegate.provider, type: delegate.type } : undefined;
  const chainJson = chain && {
    mandate_id: chain.mandateId,
    delegation_id: chain.delegationId,
    parent_delegation_id: chain.parentDelegationId ?? null,
    depth: chain.depth,
    label: chain.label ?? null,
    assurance: chain.assurance,
  };
  const capacityJson = result.capacity && {
    rule: result.capacity.rule,
    limit: result.capacity.limit,
    used: result.capacity.used,
    remaining: result.capacity.remaining,
    resets_at: result.capacity.resetsAt,
  };
  const logged = {
    ...base,
    lane: "AUTHORISED_AGENT" as const,
    delegateId,
    principalId: principal?.id ?? null,
    authorisationId: chain?.mandateId ?? (result.authorised ? null : result.authorisationId ?? null),
    delegationId: chain?.delegationId ?? null,
    parentDelegationId: chain?.parentDelegationId ?? null,
    depth: chain?.depth ?? null,
    assurance: chain?.assurance ?? null,
    capacityUsed: result.capacity?.used ?? null,
    capacityLimit: result.capacity?.limit ?? null,
  };

  if (!result.authorised) {
    const ev = await recordActivity({ ...logged, decision: "DENY", reason: result.reason });
    return NextResponse.json({
      authorised: false,
      reason: result.reason,
      status: result.status ?? null,
      authorisation_id: result.authorisationId ?? null,
      delegate: delegateInfo,
      chain: chainJson ?? null,
      capacity: capacityJson ?? null,
      ...(result.stepUp ? { step_up: { user_code: result.stepUp.userCode, approve_url: `${config.appUrl}/approve?code=${result.stepUp.userCode}` } } : {}),
      check_id: ev.id,
    });
  }

  const ev = await recordActivity({ ...logged, decision: "ALLOW", reason: "VALID_AUTHORISATION" });
  return NextResponse.json({
    authorised: true,
    status: "ACTIVE",
    authorisation_id: result.chain.mandateId,
    principal_id: principal!.id,
    // The join key: the same One Login subject the service saw when the person signed in.
    subject: principal!.oneLoginSubjectId,
    delegate: delegateInfo,
    chain: chainJson,
    capacity: capacityJson,
    check_id: ev.id,
  });
}
