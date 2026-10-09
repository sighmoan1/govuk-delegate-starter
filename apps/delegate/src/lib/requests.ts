import { validateConstraints, narrowConstraints, selectConstraints, type Constraints } from "./constraints";
import type { CatalogueCapability } from "./catalogues";
import { approvalEvidence } from "./consent-evidence";
import { consentPresentation } from "./consent-presentation";
import { currentCapabilities } from "./catalogues";
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
  constraints?: unknown;
  catalogueVersion?: unknown;
}) {
  const delegate = await prisma.delegate.findUniqueOrThrow({ where: { id: input.delegateId } });
  if (input.returnUrl && !isRegisteredReturnUrl(input.returnUrl, delegate.redirectUris)) {
    throw new DomainError("UNREGISTERED_RETURN_URL", "return_url is not registered for this delegate");
  }
  const service = await prisma.service.findUnique({ where: { slug: input.service }, include: { capabilities: true } });
  if (!service) throw new DomainError("UNKNOWN_SERVICE", "Unknown service");
  const wanted = [...new Set(input.capabilities)];
  if (wanted.length === 0) throw new DomainError("NO_CAPABILITIES", "Request at least one capability");
  if(input.catalogueVersion!==undefined && (!Number.isSafeInteger(input.catalogueVersion) || Number(input.catalogueVersion)<1)) throw new DomainError("CATALOGUE_INCOMPATIBLE","Invalid catalogue version");
  const publication=input.catalogueVersion===undefined?null:await prisma.serviceCatalogue.findUnique({where:{serviceId_version:{serviceId:service.id,version:Number(input.catalogueVersion)}}});
  if(input.catalogueVersion!==undefined && !publication) throw new DomainError("CATALOGUE_INCOMPATIBLE","Unknown catalogue version");
  const available=publication?await prisma.capability.findMany({where:{serviceId:service.id,catalogueId:publication.id},orderBy:{sortOrder:"asc"}}):await currentCapabilities(service.id);
  const caps = available.filter((c) => wanted.includes(c.code));
  if (caps.length !== wanted.length) throw new DomainError("UNKNOWN_CAPABILITY", "Unknown capability for this service");

  const constraints = validateConstraints(input.constraints, caps.map(c=>c.metadata as unknown as CatalogueCapability));
  return prisma.authorisationRequest.create({
    data: {
      constraints: JSON.parse(JSON.stringify(constraints)),
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
  permissions: { include: { capability: { include: { catalogue: true } } }, orderBy: { capability: { sortOrder: "asc" as const } } },
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
export async function approveRequest(id: string, principalId: string, capabilityCodes?: string[], method: "CITIZEN_BROWSER" | "SYNTHETIC_DEMO_API" = "SYNTHETIC_DEMO_API", approvedConstraints?: unknown) {
  const req = await pendingOrThrow(id, principalId);
  // Approval must validate the same pinned service definitions shown to the person.
  const presentation = consentPresentation(req);
  const requested = req.permissions.map((p) => p.capability);
  const chosen = capabilityCodes ? requested.filter((c) => capabilityCodes.includes(c.code)) : requested;
  if (capabilityCodes && capabilityCodes.some((c) => !requested.some((r) => r.code === c))) {
    throw new DomainError("NOT_REQUESTED", "You can only approve permissions that were requested");
  }
  if (chosen.length === 0) throw new DomainError("NO_PERMISSIONS", "Choose at least one permission, or reject the request");

  const definitions = requested.map(c=>c.metadata as unknown as CatalogueCapability);
  const proposed = validateConstraints(req.constraints, definitions);
  const constraints = narrowConstraints(proposed, validateConstraints(approvedConstraints ?? selectConstraints(proposed, chosen.map(c=>c.code)), definitions), chosen.map(c=>c.code));
  if(Object.keys(constraints).some(c=>!chosen.some(x=>x.code===c))) throw new DomainError("CONSTRAINTS_INVALID", "Restrictions must belong to selected permissions");
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    // Serialise every approval for this principal/delegate/service, so two requests
    // replacing the same relationship cannot interleave. Released at commit/rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${principalId}:${req.delegateId}:${req.serviceId}`}, 0))`;
    // Single-use: compare-and-set PENDING -> APPROVED. Only one concurrent caller
    // matches; the rest see count 0 and abort before touching any relationship.
    const claimed = await tx.authorisationRequest.updateMany({
      where: {
        id,
        status: "PENDING",
        expiresAt: { gt: now },
        OR: [{ principalId: null }, { principalId }],
      },
      data: { status: "APPROVED", principalId, respondedAt: now },
    });
    if (claimed.count !== 1) {
      const current = await tx.authorisationRequest.findUnique({ where: { id }, select: { status: true } });
      throw new DomainError("NOT_PENDING", `Request is ${current?.status ?? "unavailable"}`, 409);
    }
    // One live relationship per principal/delegate/service: a new approval replaces the old.
    const replaced = await tx.authorisation.findMany({ where: { principalId, delegateId: req.delegateId, serviceId: req.serviceId, status: "ACTIVE" }, select: { id: true } });
    for (const old of replaced) {
      const removed = await tx.authorisation.updateMany({ where: { id: old.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
      if (removed.count) await tx.consentEvidence.create({ data: { authorisationId: old.id, kind: "REVOKED", occurredAt: now, payload: { principal_ref: principalId, reason: "REPLACED_BY_NEW_APPROVAL" } } });
    }
    const auth = await tx.authorisation.create({
      data: {
        constraints: JSON.parse(JSON.stringify(constraints)),
        principalId,
        delegateId: req.delegateId,
        serviceId: req.serviceId,
        validFrom: now,
        validUntil: new Date(now.getTime() + AUTHORISATION_DAYS * DAY),
        permissions: { create: chosen.map((c) => ({ capabilityId: c.id })) },
      },
    });
    await tx.consentEvidence.create({ data: { authorisationId: auth.id, kind: "APPROVED", occurredAt: now,
      payload: approvalEvidence({ presentation, selected: chosen.map(c => c.code), principalRef: principalId,
        delegateId: req.delegateId, serviceId: req.serviceId,
        assurance: req.delegate.identityType === "WEB_BOT_AUTH" ? "VERIFIED" : req.delegate.identityType === "DECLARED" ? "DECLARED" : "REGISTERED",
        constraints, approvedAt: now, validUntil: auth.validUntil, method }) } });
    // The agent the person approved is the root of the delegation chain.
    await tx.delegation.create({
      data: {
        constraints: JSON.parse(JSON.stringify(constraints)),
        mandateId: auth.id,
        delegateId: req.delegateId,
        depth: 0,
        capabilities: chosen.map((c) => c.code),
        assurance: req.delegate.identityType === "WEB_BOT_AUTH" ? "VERIFIED" : req.delegate.identityType === "DECLARED" ? "DECLARED" : "REGISTERED",
      },
    });
    await tx.authorisationRequest.update({ where: { id }, data: { authorisationId: auth.id } });
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
  return prisma.$transaction(async tx => {
    const now = new Date();
    const changed = await tx.authorisation.updateMany({ where: { id, principalId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: now } });
    if (changed.count !== 1) throw new DomainError("NOT_ACTIVE", "That access has already ended", 409);
    await tx.consentEvidence.create({ data: { authorisationId: id, kind: "REVOKED", occurredAt: now, payload: { principal_ref: principalId, reason: "CITIZEN_REMOVED_ACCESS" } } });
    return tx.authorisation.findUniqueOrThrow({ where: { id } });
  });
}

export function requestJson(r: NonNullable<Awaited<ReturnType<typeof loadRequest>>>) {
  return {
    id: r.id,
    status: r.status,
    delegate_id: r.delegateId,
    service: r.service.slug,
    capabilities: r.permissions.map((p) => p.capability.code),
    constraints: r.constraints ?? {},
    created_at: r.createdAt,
    expires_at: r.expiresAt,
    responded_at: r.respondedAt,
    // Only revealed to the requesting delegate once the principal has approved.
    ...(r.status === "APPROVED"
      ? {
          principal_id: r.principalId,
          authorisation_id: r.authorisationId,
          granted_constraints: r.authorisation?.constraints ?? {},
          granted_capabilities: r.authorisation?.permissions.map((p) => p.capability.code) ?? [],
        }
      : {}),
  };
}
