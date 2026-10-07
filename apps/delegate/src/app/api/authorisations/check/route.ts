import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkAuthority } from "@/lib/authority";
import { verifyAgentToken } from "@/lib/agent-auth";
import { recordActivity } from "@/lib/activity";
import { verifySecretCached } from "@/lib/secrets";
import { readJson } from "@/lib/http";

/**
 * The one call a government service makes before acting for someone on an
 * agent's say-so (HMRC-style relationship lookup).
 *
 *   POST /api/authorisations/check     x-service-key: <the service's own key>
 *   { agent_token, principal_id, service, capability }
 *
 * Delegate verifies the agent's identity, checks the relationship and the
 * capability, logs the attempt, and tells the service who the person is
 * (their One Login subject) only when the answer is yes.
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

  // 1. The agent proves who IT is. Failures are activity: they are attempts.
  const claims = await verifyAgentToken(String(b.agent_token ?? ""));
  if (!claims) {
    const ev = await recordActivity({ ...base, lane: "UNTRUSTED", decision: "DENY", reason: "INVALID_AGENT_AUTHENTICATION" });
    return NextResponse.json({ authorised: false, reason: "INVALID_AGENT_AUTHENTICATION", check_id: ev.id });
  }
  const delegate = await prisma.delegate.findUnique({ where: { id: claims.delegateId } });
  if (!delegate || delegate.status !== "ACTIVE") {
    const ev = await recordActivity({ ...base, lane: "UNTRUSTED", decision: "DENY", reason: "UNKNOWN_DELEGATE", presentedClientId: claims.clientId || null });
    return NextResponse.json({ authorised: false, reason: "UNKNOWN_DELEGATE", check_id: ev.id });
  }

  // 2 + 3. Is the relationship live, and does it cover this capability?
  const principal = principalId ? await prisma.principal.findUnique({ where: { id: principalId } }) : null;
  const result = await checkAuthority({ principalId, delegateId: delegate.id, service: slug, capability });
  const who = { delegateId: delegate.id, principalId: principal?.id ?? null };
  const delegateInfo = { id: delegate.id, name: delegate.name, provider: delegate.provider, type: delegate.type };

  if (!result.authorised) {
    const ev = await recordActivity({ ...base, ...who, lane: "AUTHORISED_AGENT", decision: "DENY", reason: result.reason, authorisationId: result.authorisationId ?? null });
    return NextResponse.json({
      authorised: false,
      reason: result.reason,
      status: result.status ?? null,
      authorisation_id: result.authorisationId ?? null,
      delegate: delegateInfo,
      check_id: ev.id,
    });
  }

  const ev = await recordActivity({ ...base, ...who, lane: "AUTHORISED_AGENT", decision: "ALLOW", reason: "VALID_AUTHORISATION", authorisationId: result.authorisationId });
  return NextResponse.json({
    authorised: true,
    status: "ACTIVE",
    authorisation_id: result.authorisationId,
    principal_id: principal!.id,
    // The join key: the same One Login subject the service saw when the person signed in.
    subject: principal!.oneLoginSubjectId,
    delegate: delegateInfo,
    check_id: ev.id,
  });
}
