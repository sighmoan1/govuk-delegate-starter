import { NextResponse } from "next/server";
import { verifyPresenterToken } from "@/lib/agent-auth";
import { serviceFromRequest } from "@/lib/service-auth";
import { reserveStepUp } from "@/lib/step-up-redeem";
import { proposalFrom } from "@/lib/step-up-json";
import { readJson } from "@/lib/http";

/**
 * A service reserves the person's approval for ONE operation it is about to commit.
 *
 *   POST /api/step-ups/reserve     x-service-key
 *   { service, agent_token, principal_id, capability, proposal: { idempotency_key, payload }, reservation_id }
 *
 * This re-runs the whole authority check, then flips the approval from APPROVED
 * to RESERVED in one conditional update. Of any number of concurrent callers one
 * wins. The reservation is a lease; the service reports the commit with /complete
 * or gives it back with /release. reservation_id is chosen by the caller for this
 * attempt: sending the same one again (a lost reply) returns the same reservation.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await serviceFromRequest(req, String(b.service ?? ""));
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });

  const reservationId = String(b.reservation_id ?? "");
  const proposal = proposalFrom(b.proposal);
  if (!/^[0-9a-fA-F-]{16,64}$/.test(reservationId) || !proposal) return NextResponse.json({ error: "INVALID_REQUEST", message: "Send reservation_id and proposal." }, { status: 400 });

  const presenter = await verifyPresenterToken(String(b.agent_token ?? ""));
  if (!presenter) return NextResponse.json({ reserved: false, reason: "INVALID_AGENT_AUTHENTICATION" }, { status: 401 });

  const r = await reserveStepUp({
    principalId: String(b.principal_id ?? ""),
    catalogueVersion: typeof b.catalogue_version === "number" ? b.catalogue_version : undefined,
    presenter: presenter.kind === "agent" ? { kind: "agent", delegateId: presenter.delegateId } : { kind: "delegation", delegationId: presenter.delegationId },
    service: service.slug,
    capability: String(b.capability ?? ""),
    proposal,
    reservationId,
  });
  if (r.ok) {
    return NextResponse.json({
      reserved: true, reservation_id: r.reservationId, lease_expires_at: r.leaseExpiresAt.toISOString(), proposal_id: r.proposalId, proposal_hash: r.proposalHash, duplicate: r.replayed,
    });
  }
  const status = r.reason === "STEP_UP_IN_USE" || r.reason === "STEP_UP_ALREADY_USED" ? 409 : r.reason === "STEP_UP_NOT_REQUIRED" ? 400 : 403;
  return NextResponse.json(
    { reserved: false, reason: r.reason, state: r.state, message: r.message, ...(r.retryAfterSeconds ? { retry_after_seconds: r.retryAfterSeconds } : {}) },
    { status, headers: r.retryAfterSeconds ? { "retry-after": String(r.retryAfterSeconds) } : {} },
  );
}
