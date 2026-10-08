import { randomInt } from "node:crypto";
import type { Assurance, AuthorisationStatus, Reason } from "@/generated/prisma";
import { prisma } from "./db";
import { stepUpMaxAgeMs } from "./config";

/** Who is presenting: an agent signed in with its own credentials, or a sub-agent holding a delegation token. */
export type Presenter = { kind: "agent"; delegateId: string } | { kind: "delegation"; delegationId: string };

export type CheckInput = {
  principalId: string;
  presenter: Presenter;
  service: string; // slug
  capability: string;
};

export type Chain = {
  principalId: string;
  mandateId: string;
  delegationId: string;
  parentDelegationId: string | null;
  depth: number;
  label: string | null;
  assurance: Assurance;
  delegateId: string;
};

// CAPACITY_EXCEEDED stays in the Reason enum only so historical activity rows still read; Delegate no longer issues it.
export type DenyReason = Exclude<Reason, "VALID_AUTHORISATION" | "INVALID_AGENT_AUTHENTICATION" | "RATE_LIMITED" | "HUMAN_SESSION" | "CAPACITY_EXCEEDED">;

export type CheckResult =
  | { authorised: true; serviceId: string; chain: Chain }
  | {
      authorised: false;
      reason: DenyReason;
      status?: AuthorisationStatus;
      authorisationId?: string;
      serviceId?: string;
      chain?: Partial<Chain>;
      stepUp?: { userCode: string; stepUpId: string };
    };

/** Flip ACTIVE authorisations whose time has run out. Authoritative, server-side. */
export async function expireDueAuthorisations(now = new Date()) {
  await prisma.authorisation.updateMany({
    where: { status: "ACTIVE", validUntil: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

const live = (a: { status: AuthorisationStatus; validFrom: Date; validUntil: Date }, now: Date) =>
  a.status === "ACTIVE" && a.validFrom <= now && a.validUntil > now;

const endedReason = (status: AuthorisationStatus): DenyReason => (status === "REVOKED" ? "AUTHORISATION_REVOKED" : "AUTHORISATION_EXPIRED");

const assuranceFor = (identityType: string): Assurance =>
  identityType === "WEB_BOT_AUTH" ? "VERIFIED" : identityType === "DECLARED" ? "DECLARED" : "REGISTERED";

/** The root delegation for a mandate: the agent the person approved directly. Created if missing (older mandates). */
export async function rootDelegationFor(mandate: { id: string; delegateId: string; permissions: { capability: { code: string } }[] }) {
  const existing = await prisma.delegation.findFirst({ where: { mandateId: mandate.id, parentDelegationId: null }, include: { delegate: true } });
  if (existing) return existing;
  const delegate = await prisma.delegate.findUniqueOrThrow({ where: { id: mandate.delegateId } });
  return prisma.delegation.create({
    data: {
      mandateId: mandate.id,
      delegateId: mandate.delegateId,
      depth: 0,
      capabilities: mandate.permissions.map((p) => p.capability.code),
      assurance: assuranceFor(delegate.identityType),
    },
    include: { delegate: true },
  });
}

/**
 * Walk from a delegation up to the root mandate delegation, checking each
 * ancestor against its CURRENT state. Returns a deny reason, or null if the
 * whole chain is sound. Fails closed on cycles, cross-mandate parents, broken
 * depth numbering and depth beyond the mandate's limit.
 */
async function ancestorDenial(
  start: { id: string; mandateId: string; parentDelegationId: string | null; depth: number },
  mandate: { id: string; maxDepth: number },
  capability: string,
): Promise<{ reason: DenyReason; at: string } | null> {
  if (start.depth > mandate.maxDepth) return { reason: "DELEGATION_DEPTH_EXCEEDED", at: start.id };
  const seen = new Set<string>([start.id]);
  let child: { id: string; depth: number } = start;
  let parentId = start.parentDelegationId;
  if (parentId === null && start.depth !== 0) return { reason: "NO_AUTHORISATION", at: start.id };
  while (parentId !== null) {
    if (seen.has(parentId)) return { reason: "NO_AUTHORISATION", at: parentId }; // cycle
    seen.add(parentId);
    const parent = await prisma.delegation.findUnique({ where: { id: parentId }, include: { delegate: true } });
    if (!parent || parent.mandateId !== mandate.id || parent.depth !== child.depth - 1) return { reason: "NO_AUTHORISATION", at: parentId };
    if (parent.status !== "ACTIVE") return { reason: "AUTHORISATION_REVOKED", at: parent.id };
    if (parent.delegate.status !== "ACTIVE") return { reason: "UNKNOWN_DELEGATE", at: parent.id };
    // The child can only hold what every ancestor still holds.
    if (!parent.capabilities.includes(capability)) return { reason: "PERMISSION_MISSING", at: parent.id };
    child = parent;
    parentId = parent.parentDelegationId;
  }
  // The chain must end at the mandate's root (depth 0).
  if (child.depth !== 0) return { reason: "NO_AUTHORISATION", at: child.id };
  return null;
}

/**
 * The check — the heart of Delegate.
 *
 *   identity   → is the presenter a known, active agent?
 *   authority  → is there a live mandate from this person, and does the
 *                delegation chain cover this capability?
 *
 * A yes proves exactly that and nothing more. It is a lookup, not a
 * transaction: asking, and being told yes, spends nothing of the person's.
 * Business limits on what the person may then DO belong to the service that
 * performs the action (HMRC's capacity.ts), not to this check.
 */
export async function checkAuthority(input: CheckInput, now = new Date()): Promise<CheckResult> {
  const service = await prisma.service.findUnique({ where: { slug: input.service } });
  if (!service) return { authorised: false, reason: "NO_AUTHORISATION" };
  await expireDueAuthorisations(now);

  // ── Identity, and the mandate + delegation the presenter is acting under.
  let mandate;
  let delegation;
  if (input.presenter.kind === "agent") {
    const delegate = await prisma.delegate.findUnique({ where: { id: input.presenter.delegateId } });
    if (!delegate || delegate.status !== "ACTIVE") return { authorised: false, reason: "UNKNOWN_DELEGATE" };
    const rows = await prisma.authorisation.findMany({
      where: { principalId: input.principalId, delegateId: delegate.id, serviceId: service.id },
      include: { permissions: { include: { capability: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) return { authorised: false, reason: "NO_AUTHORISATION", serviceId: service.id };
    mandate = rows.find((a) => live(a, now));
    if (!mandate) {
      const latest = rows[0];
      return { authorised: false, reason: endedReason(latest.status), status: latest.status, authorisationId: latest.id, serviceId: service.id };
    }
    delegation = await rootDelegationFor(mandate);
  } else {
    const d = await prisma.delegation.findUnique({
      where: { id: input.presenter.delegationId },
      include: { delegate: true, mandate: { include: { permissions: { include: { capability: true } } } } },
    });
    if (!d || d.delegate.status !== "ACTIVE") return { authorised: false, reason: "UNKNOWN_DELEGATE" };
    // A delegation only ever acts for its mandate's person.
    if (d.mandate.principalId !== input.principalId || d.mandate.serviceId !== service.id) {
      return { authorised: false, reason: "NO_AUTHORISATION", serviceId: service.id };
    }
    mandate = d.mandate;
    if (!live(mandate, now)) {
      return { authorised: false, reason: endedReason(mandate.status), status: mandate.status, authorisationId: mandate.id, serviceId: service.id };
    }
    if (d.status !== "ACTIVE") return { authorised: false, reason: "AUTHORISATION_REVOKED", status: "REVOKED", authorisationId: mandate.id, serviceId: service.id };
    delegation = d;
  }

  const chain: Chain = {
    principalId: mandate.principalId,
    mandateId: mandate.id,
    delegationId: delegation.id,
    parentDelegationId: delegation.parentDelegationId,
    depth: delegation.depth,
    label: delegation.label,
    assurance: delegation.assurance,
    delegateId: delegation.delegateId,
  };
  const base = { status: "ACTIVE" as const, authorisationId: mandate.id, serviceId: service.id, chain };

  // ── Authority: the capability must be in the mandate and in this delegation.
  const capability = mandate.permissions.find((p) => p.capability.code === input.capability)?.capability;
  if (!capability || !delegation.capabilities.includes(input.capability)) {
    return { authorised: false, reason: "PERMISSION_MISSING", ...base };
  }

  // ── ...and in every ancestor, as they stand now (revoked or narrowed parents bind their descendants).
  const denial = await ancestorDenial(delegation, mandate, input.capability);
  if (denial) {
    console.warn(`[authority] chain refused: ${denial.reason} at ancestor ${denial.at} (delegation ${delegation.id}, mandate ${mandate.id}, depth ${delegation.depth})`);
    return { authorised: false, reason: denial.reason, ...base };
  }

  // ── Sensitive actions need an agent whose identity is verified or registered.
  // Assurance decides WHAT an agent may do.
  if (capability.riskLevel === "HIGH" && delegation.assurance === "DECLARED") {
    return { authorised: false, reason: "ASSURANCE_TOO_LOW", ...base };
  }

  // ── Consequential actions need the person's fresh approval, whoever asks.
  // One approval admits one positive check, and only while it is fresh (see
  // stepUpFreshSince). Consumption is a compare-and-set
  // (APPROVED -> USED in one UPDATE), so of any number of concurrent checks only
  // one can win a given approval. A loser tries any other approved step-up, and
  // otherwise gets the normal STEP_UP_REQUIRED refusal. This is not end-to-end
  // exactly-once: if the service then fails the action, the approval stays spent.
  if (capability.requiresStepUp) {
    let consumed = false;
    for (let attempt = 0; attempt < 5 && !consumed; attempt++) {
      const approved = await prisma.stepUp.findFirst({ where: { mandateId: mandate.id, capability: input.capability, status: "APPROVED", approvedAt: { gte: stepUpFreshSince(now) } }, orderBy: { approvedAt: "asc" } });
      if (!approved) break;
      const used = await prisma.stepUp.updateMany({ where: { id: approved.id, status: "APPROVED" }, data: { status: "USED", usedAt: now } });
      consumed = used.count === 1;
    }
    if (!consumed) return stepUpRequired(mandate.id, input.capability, base);
  }
  return { authorised: true, serviceId: service.id, chain };
}

/** Oldest `approvedAt` still usable at `now`. An approval exactly at the maximum age is still valid; older ones are refused as STEP_UP_REQUIRED. */
export function stepUpFreshSince(now: Date, maxAgeMs = stepUpMaxAgeMs()) {
  return new Date(now.getTime() - maxAgeMs);
}

async function stepUpRequired(mandateId: string, capability: string, base: { status: "ACTIVE"; authorisationId: string; serviceId: string; chain: Chain }): Promise<CheckResult> {
  const pending =
    (await prisma.stepUp.findFirst({ where: { mandateId, capability, status: "PENDING" } })) ??
    (await prisma.stepUp.create({ data: { mandateId, capability, userCode: userCode() } }));
  return { authorised: false, reason: "STEP_UP_REQUIRED", ...base, stepUp: { userCode: pending.userCode, stepUpId: pending.id } };
}

/** Short, unambiguous codes a person can type: KQ7M-42XD. */
export function userCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}
