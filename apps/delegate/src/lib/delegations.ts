import { prisma } from "./db";
import { DomainError } from "./requests";
import { expireDueAuthorisations, rootDelegationFor } from "./authority";
import { signDelegationToken } from "./agent-auth";

type Parent = { kind: "agent"; delegateId: string } | { kind: "delegation"; delegationId: string };

/**
 * An agent passes part of its authority to a sub-agent. The child inherits the
 * mandate (and so the root principal), can't widen its parent's capabilities,
 * and can't go deeper than the mandate allows.
 */
export async function subDelegate(input: { parent: Parent; principalId: string; service: string; capabilities: string[]; label?: string }) {
  await expireDueAuthorisations();
  const service = await prisma.service.findUnique({ where: { slug: input.service } });
  if (!service) throw new DomainError("UNKNOWN_SERVICE", "Unknown service");

  let parent;
  if (input.parent.kind === "agent") {
    const mandate = await prisma.authorisation.findFirst({
      where: { principalId: input.principalId, delegateId: input.parent.delegateId, serviceId: service.id, status: "ACTIVE" },
      include: { permissions: { include: { capability: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!mandate) throw new DomainError("NO_AUTHORISATION", "No live permission from this person", 403);
    parent = await rootDelegationFor(mandate);
  } else {
    parent = await prisma.delegation.findUnique({ where: { id: input.parent.delegationId } });
    if (!parent || parent.status !== "ACTIVE") throw new DomainError("NO_AUTHORISATION", "Delegation not found or ended", 403);
  }
  const mandate = await prisma.authorisation.findUniqueOrThrow({ where: { id: parent.mandateId } });
  if (mandate.principalId !== input.principalId || mandate.serviceId !== service.id || mandate.status !== "ACTIVE") {
    throw new DomainError("NO_AUTHORISATION", "No live permission from this person", 403);
  }
  const depth = parent.depth + 1;
  if (depth > mandate.maxDepth) {
    throw new DomainError("DELEGATION_DEPTH_EXCEEDED", `This permission may be passed on at most ${mandate.maxDepth} level(s)`, 403);
  }
  const wanted = [...new Set(input.capabilities)];
  const widened = wanted.filter((c) => !parent.capabilities.includes(c));
  if (wanted.length === 0) throw new DomainError("NO_CAPABILITIES", "Pass on at least one capability");
  if (widened.length) throw new DomainError("PERMISSION_MISSING", `Can't pass on what you don't hold: ${widened.join(", ")}`, 403);

  const child = await prisma.delegation.create({
    data: {
      mandateId: mandate.id,
      delegateId: parent.delegateId,
      parentDelegationId: parent.id,
      depth,
      label: input.label?.slice(0, 80) || null,
      capabilities: wanted,
      assurance: parent.assurance,
    },
  });
  return { delegation: child, token: await signDelegationToken(child.id) };
}
