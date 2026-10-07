import type { Reason, AuthorisationStatus } from "@/generated/prisma";
import { prisma } from "./db";

export type CheckInput = {
  principalId: string;
  delegateId: string;
  service: string; // slug
  capability: string;
};

export type CheckResult =
  | { authorised: true; authorisationId: string; status: "ACTIVE"; principalId: string; delegateId: string; serviceId: string }
  | {
      authorised: false;
      reason: Exclude<Reason, "VALID_AUTHORISATION" | "INVALID_AGENT_AUTHENTICATION" | "RATE_LIMITED" | "HUMAN_SESSION">;
      status?: AuthorisationStatus;
      authorisationId?: string;
      serviceId?: string;
    };

/** Flip ACTIVE authorisations whose time has run out. Authoritative, server-side. */
export async function expireDueAuthorisations(now = new Date()) {
  await prisma.authorisation.updateMany({
    where: { status: "ACTIVE", validUntil: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

/**
 * The relationship check — the heart of Delegate.
 * Order: delegate known → relationship exists → relationship live → capability granted.
 */
export async function checkAuthority(input: CheckInput, now = new Date()): Promise<CheckResult> {
  const delegate = await prisma.delegate.findUnique({ where: { id: input.delegateId } });
  if (!delegate || delegate.status !== "ACTIVE") return { authorised: false, reason: "UNKNOWN_DELEGATE" };

  const service = await prisma.service.findUnique({
    where: { slug: input.service },
    include: { capabilities: true },
  });
  if (!service) return { authorised: false, reason: "NO_AUTHORISATION" };

  await expireDueAuthorisations(now);

  const rows = await prisma.authorisation.findMany({
    where: { principalId: input.principalId, delegateId: input.delegateId, serviceId: service.id },
    include: { permissions: { include: { capability: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return { authorised: false, reason: "NO_AUTHORISATION", serviceId: service.id };

  const live = rows.find((a) => a.status === "ACTIVE" && a.validFrom <= now && a.validUntil > now);
  if (!live) {
    const latest = rows[0];
    const reason = latest.status === "REVOKED" ? "AUTHORISATION_REVOKED" : "AUTHORISATION_EXPIRED";
    return { authorised: false, reason, status: latest.status, authorisationId: latest.id, serviceId: service.id };
  }

  // Capability must exist in the service catalogue AND have been granted.
  const granted = live.permissions.some((p) => p.capability.code === input.capability);
  if (!granted) {
    return { authorised: false, reason: "PERMISSION_MISSING", status: "ACTIVE", authorisationId: live.id, serviceId: service.id };
  }
  return {
    authorised: true,
    authorisationId: live.id,
    status: "ACTIVE",
    principalId: live.principalId,
    delegateId: live.delegateId,
    serviceId: service.id,
  };
}
