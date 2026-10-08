// What a service does with an approval: reserve it when it admits the specific
// operation, complete it after the service's own commit, release it if the
// operation did not happen.
//
// Delegate and the service have separate databases, so there is no atomic
// "commit the service's change and spend the approval". The protocol is built so
// that each failure leaves a state that is safe and recoverable:
//
//   APPROVED --reserve--> RESERVED --complete--> USED
//                            |  ^
//                  release /   \ lease lapses (holder presumed crashed)
//                            v   |
//                         APPROVED
//
// - RESERVE is the only gate. One conditional UPDATE: of any number of racing
//   callers exactly one flips APPROVED to RESERVED. It also requires the mandate
//   to be live and the proposal unexpired in the same statement, so a
//   revocation or expiry that lands first wins.
// - A reservation is a LEASE, not a spend. If the service crashes or loses the
//   reply, the lease lapses and the approval is available again for the same
//   proposal. It is bound to one Idempotency-Key and one content digest, and the
//   service's own idempotency record (written in the same transaction as its
//   commit) is what stops a second commit under that key. So "available again"
//   can never mean "a second action".
// - COMPLETE records a fact: the service has committed. It is idempotent, and it
//   is accepted even after the lease lapsed or the window closed, because
//   refusing to record something that happened would make the record wrong.
// - RELEASE hands the approval back when the service knows the operation did not
//   commit. Best effort: the lease is the backstop.
import { prisma } from "./db";
import { STEP_UP_RESERVATION_LEASE_SECONDS } from "./config";
import { checkAuthority, type CheckInput, type DenyReason } from "./authority";
import { viewOf, type StepUpState } from "./step-ups";

export type ReserveResult =
  | { ok: true; reservationId: string; leaseExpiresAt: Date; proposalId: string; proposalHash: string; replayed: boolean }
  | { ok: false; reason: DenyReason | "STEP_UP_NOT_APPROVED" | "STEP_UP_IN_USE" | "STEP_UP_ALREADY_USED" | "STEP_UP_NOT_REQUIRED"; state: StepUpState | null; retryAfterSeconds?: number; message: string };

const refused = (reason: Extract<ReserveResult, { ok: false }>["reason"], state: StepUpState | null, message: string, retryAfterSeconds?: number): ReserveResult =>
  ({ ok: false, reason, state, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });

/**
 * Reserve the approval for one operation. Re-runs the whole authority check, so
 * identity, a live mandate, the delegation chain, the capability, assurance and
 * the proposal's state are all current at this moment. `reservationId` is chosen
 * by the caller for this attempt, so re-delivering the same request after a lost
 * reply is recognised rather than refused.
 */
export async function reserveStepUp(input: CheckInput & { reservationId: string }, now = new Date()): Promise<ReserveResult> {
  const res = await checkAuthority(input, now);
  if (!res.authorised) {
    return refused(res.reason, res.stepUp?.state ?? null, res.stepUp?.message ?? "Not authorised.");
  }
  if (!res.stepUp) return refused("STEP_UP_NOT_REQUIRED", null, "This capability does not need an approval, so there is nothing to reserve.");

  const { proposalId, proposalHash } = res.stepUp;
  if (!proposalId || !proposalHash) return refused("STEP_UP_NOT_APPROVED", res.stepUp.state, res.stepUp.message);
  if (res.stepUp.state === "REDEEMED") return refused("STEP_UP_ALREADY_USED", "REDEEMED", "This approval has already been used for this change.");

  const leaseExpiresAt = new Date(now.getTime() + STEP_UP_RESERVATION_LEASE_SECONDS * 1000);
  const won = await prisma.stepUp.updateMany({
    where: {
      id: proposalId,
      expiresAt: { gt: now },
      mandate: { status: "ACTIVE", validFrom: { lte: now }, validUntil: { gt: now } },
      OR: [{ status: "APPROVED" }, { status: "RESERVED", reservationExpiresAt: { lte: now } }],
    },
    data: { status: "RESERVED", reservationId: input.reservationId, reservedAt: now, reservationExpiresAt: leaseExpiresAt },
  });
  if (won.count === 1) return { ok: true, reservationId: input.reservationId, leaseExpiresAt, proposalId, proposalHash, replayed: false };

  // Lost the race, or something changed between the check and now. Say which.
  const row = await prisma.stepUp.findUnique({ where: { id: proposalId }, include: { mandate: true } });
  if (!row) return refused("STEP_UP_NOT_APPROVED", null, "No such approval.");
  if (row.status === "RESERVED" && row.reservationId === input.reservationId && row.reservationExpiresAt && row.reservationExpiresAt > now) {
    return { ok: true, reservationId: row.reservationId, leaseExpiresAt: row.reservationExpiresAt, proposalId, proposalHash, replayed: true }; // the same attempt, delivered twice
  }
  const view = viewOf(row, now);
  if (view === "REDEEMED") return refused("STEP_UP_ALREADY_USED", "REDEEMED", "This approval has already been used for this change.");
  if (view === "IN_PROGRESS") {
    const wait = row.reservationExpiresAt ? Math.max(1, Math.ceil((row.reservationExpiresAt.getTime() - now.getTime()) / 1000)) : undefined;
    return refused("STEP_UP_IN_USE", "IN_PROGRESS", "Another operation is using this approval. If it does not finish, the approval becomes available again when its lease lapses.", wait);
  }
  if (!(row.mandate.status === "ACTIVE" && row.mandate.validUntil > now)) {
    return refused(row.mandate.status === "REVOKED" ? "AUTHORISATION_REVOKED" : "AUTHORISATION_EXPIRED", null, "The permission behind this approval has ended.");
  }
  return refused("STEP_UP_NOT_APPROVED", view === "EXPIRED" ? "EXPIRED" : "AWAITING_APPROVAL", "The approval is no longer available for this change.");
}

export type CompleteResult = { ok: true; duplicate: boolean; state: "USED" } | { ok: false; reason: "NOT_FOUND" | "NOT_APPROVED"; message: string };

/**
 * The service reports that it COMMITTED the operation this approval covers.
 * Idempotent: a second report (a retry, a duplicate callback, recovery after a
 * crash) changes nothing. Allowed from RESERVED, or APPROVED after a lapsed
 * lease, or EXPIRED once approved: the commit already happened, so the record
 * should say so. Never allowed for a proposal the person did not approve.
 */
export async function completeStepUp(a: { serviceId: string; proposalId: string; reference?: string | null }, now = new Date()): Promise<CompleteResult> {
  const row = await prisma.stepUp.findUnique({ where: { id: a.proposalId } });
  if (!row || row.serviceId !== a.serviceId) return { ok: false, reason: "NOT_FOUND", message: "No such approval for this service." };
  const won = await prisma.stepUp.updateMany({
    where: { id: row.id, approvedAt: { not: null }, status: { in: ["APPROVED", "RESERVED", "EXPIRED"] } },
    data: { status: "USED", usedAt: now, usedReference: a.reference ? a.reference.slice(0, 100) : null, reservationId: null, reservationExpiresAt: null },
  });
  if (won.count === 1) return { ok: true, duplicate: false, state: "USED" };
  const now2 = await prisma.stepUp.findUnique({ where: { id: row.id } });
  if (now2?.status === "USED") return { ok: true, duplicate: true, state: "USED" };
  return { ok: false, reason: "NOT_APPROVED", message: "The person has not approved this change, so it cannot be recorded as done under their approval." };
}

/**
 * The service did not commit. Give the approval back, but only if this
 * reservation still holds it: a late release from an attempt whose lease already
 * lapsed must not disturb a newer attempt.
 */
export async function releaseStepUp(a: { serviceId: string; proposalId: string; reservationId: string }): Promise<{ released: boolean }> {
  const won = await prisma.stepUp.updateMany({
    where: { id: a.proposalId, serviceId: a.serviceId, reservationId: a.reservationId, status: "RESERVED" },
    data: { status: "APPROVED", reservationId: null, reservedAt: null, reservationExpiresAt: null },
  });
  return { released: won.count === 1 };
}
