import { prisma } from "./db";
import { AUTHORISATION_DAYS, REQUEST_DAYS } from "./config";

export class DomainError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
  }
}

const DAY = 86_400_000;

export async function createRequest(input: {
  delegateId: string;
  service: string;
  capabilities: string[];
  principalHint?: string;
  returnUrl?: string;
}) {
  const delegate = await prisma.delegate.findUniqueOrThrow({ where: { id: input.delegateId } });
  if (input.returnUrl && !isRegisteredReturnUrl(input.returnUrl, delegate.redirectUris)) {
    throw new DomainError("UNREGISTERED_RETURN_URL", "return_url is not registered for this delegate");
  }
  const service = await prisma.service.findUnique({ where: { slug: input.service }, include: { capabilities: true } });
  if (!service) throw new DomainError("UNKNOWN_SERVICE", "Unknown service");
  const wanted = [...new Set(input.capabilities)];
  if (wanted.length === 0) throw new DomainError("NO_CAPABILITIES", "Request at least one capability");
  const caps = service.capabilities.filter((c) => wanted.includes(c.code));
  if (caps.length !== wanted.length) throw new DomainError("UNKNOWN_CAPABILITY", "Unknown capability for this service");

  return prisma.authorisationRequest.create({
    data: {
      delegateId: input.delegateId,
      serviceId: service.id,
      principalHint: input.principalHint?.slice(0, 200) || null,
      returnUrl: input.returnUrl ?? null,
      expiresAt: new Date(Date.now() + REQUEST_DAYS * DAY),
      permissions: { create: caps.map((c) => ({ capabilityId: c.id })) },
    },
    include: requestInclude,
  });
}

/** Same origin and path as a registered URI; the query string is the agent's own business. */
export function isRegisteredReturnUrl(candidate: string, registered: string[]): boolean {
  let u: URL;
  try { u = new URL(candidate); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return registered.some((r) => {
    try { const x = new URL(r); return x.origin === u.origin && x.pathname === u.pathname; } catch { return false; }
  });
}

/** Where to send the person after they decide, carrying the outcome back to the agent. */
export function returnTo(req: { id: string; returnUrl: string | null }, status: "approved" | "rejected"): string | null {
  if (!req.returnUrl) return null;
  const u = new URL(req.returnUrl);
  u.searchParams.set("request_id", req.id);
  u.searchParams.set("status", status);
  return u.toString();
}

export const requestInclude = {
  delegate: true,
  service: true,
  permissions: { include: { capability: true }, orderBy: { capability: { sortOrder: "asc" as const } } },
  authorisation: { include: { permissions: { include: { capability: true } } } },
};

export async function loadRequest(id: string) {
  const req = await prisma.authorisationRequest.findUnique({ where: { id }, include: requestInclude });
  if (req && req.status === "PENDING" && req.expiresAt <= new Date()) {
    return prisma.authorisationRequest.update({ where: { id }, data: { status: "EXPIRED" }, include: requestInclude });
  }
  return req;
}

async function pendingOrThrow(id: string, principalId?: string) {
  const req = await loadRequest(id);
  if (!req) throw new DomainError("NOT_FOUND", "Request not found", 404);
  if (principalId && req.principalId && req.principalId !== principalId) {
    throw new DomainError("NOT_FOUND", "Request not found", 404);
  }
  if (req.status !== "PENDING") throw new DomainError("NOT_PENDING", `Request is ${req.status}`, 409);
  return req;
}

/** Principal approves, optionally narrowing the permissions. Creates the active relationship. */
export async function approveRequest(id: string, principalId: string, capabilityCodes?: string[]) {
  const req = await pendingOrThrow(id, principalId);
  const requested = req.permissions.map((p) => p.capability);
  const chosen = capabilityCodes ? requested.filter((c) => capabilityCodes.includes(c.code)) : requested;
  if (capabilityCodes && capabilityCodes.some((c) => !requested.some((r) => r.code === c))) {
    throw new DomainError("NOT_REQUESTED", "You can only approve permissions that were requested");
  }
  if (chosen.length === 0) throw new DomainError("NO_PERMISSIONS", "Choose at least one permission, or reject the request");

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // One live relationship per principal/delegate/service: a new approval replaces the old.
    await tx.authorisation.updateMany({
      where: { principalId, delegateId: req.delegateId, serviceId: req.serviceId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    const auth = await tx.authorisation.create({
      data: {
        principalId,
        delegateId: req.delegateId,
        serviceId: req.serviceId,
        validFrom: now,
        validUntil: new Date(now.getTime() + AUTHORISATION_DAYS * DAY),
        permissions: { create: chosen.map((c) => ({ capabilityId: c.id })) },
      },
    });
    // The agent the person approved is the root of the delegation chain.
    await tx.delegation.create({
      data: {
        mandateId: auth.id,
        delegateId: req.delegateId,
        depth: 0,
        capabilities: chosen.map((c) => c.code),
        assurance: req.delegate.identityType === "WEB_BOT_AUTH" ? "VERIFIED" : req.delegate.identityType === "DECLARED" ? "DECLARED" : "REGISTERED",
      },
    });
    await tx.authorisationRequest.update({
      where: { id },
      data: { status: "APPROVED", principalId, respondedAt: now, authorisationId: auth.id },
    });
    return auth;
  });
}

export async function rejectRequest(id: string, principalId: string) {
  await pendingOrThrow(id, principalId);
  return prisma.authorisationRequest.update({
    where: { id },
    data: { status: "REJECTED", principalId, respondedAt: new Date() },
  });
}

/** Delegate withdraws its own pending request. */
export async function cancelRequest(id: string, delegateId: string) {
  const req = await pendingOrThrow(id);
  if (req.delegateId !== delegateId) throw new DomainError("NOT_FOUND", "Request not found", 404);
  return prisma.authorisationRequest.update({ where: { id }, data: { status: "CANCELLED", respondedAt: new Date() } });
}

/** Principal removes authority. Takes effect on the very next relationship check. */
export async function revokeAuthorisation(id: string, principalId: string) {
  const auth = await prisma.authorisation.findUnique({ where: { id } });
  if (!auth || auth.principalId !== principalId) throw new DomainError("NOT_FOUND", "Authorisation not found", 404);
  if (auth.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", `Authorisation is ${auth.status}`, 409);
  return prisma.authorisation.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
}

export function requestJson(r: NonNullable<Awaited<ReturnType<typeof loadRequest>>>) {
  return {
    id: r.id,
    status: r.status,
    delegate_id: r.delegateId,
    service: r.service.slug,
    capabilities: r.permissions.map((p) => p.capability.code),
    created_at: r.createdAt,
    expires_at: r.expiresAt,
    responded_at: r.respondedAt,
    // Only revealed to the requesting delegate once the principal has approved.
    ...(r.status === "APPROVED"
      ? {
          principal_id: r.principalId,
          authorisation_id: r.authorisationId,
          granted_capabilities: r.authorisation?.permissions.map((p) => p.capability.code) ?? [],
        }
      : {}),
  };
}
