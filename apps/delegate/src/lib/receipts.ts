// Receipts: what a service says an agent did in a person's name, and the
// person's two answers to it: "that's fine", or "I didn't agree to that".
import { selectConstraints, type Constraints } from "./constraints";
import { prisma } from "./db";
import { DomainError } from "./requests";

/** Take one capability away from a live authority, leaving the rest. */
export async function narrowAuthorisation(authorisationId: string, principalId: string, capabilityCode: string) {
  const a = await prisma.authorisation.findUnique({ where: { id: authorisationId }, include: { permissions: { include: { capability: true } } } });
  if (!a || a.principalId !== principalId) throw new DomainError("NOT_FOUND", "Authority not found.", 404);
  if (a.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", "That access has already ended.", 409);
  const perm = a.permissions.find((p) => p.capability.code === capabilityCode);
  if (!perm) return;
  await prisma.$transaction(async (tx) => {
    // Serialise scope removal with revocation/replacement of this relationship.
    await tx.$queryRaw`SELECT id FROM authorisation WHERE id = ${authorisationId} FOR UPDATE`;
    const current = await tx.authorisation.findUnique({ where: { id: authorisationId }, select: { status: true, principalId: true, constraints:true } });
    if (!current || current.principalId !== principalId) throw new DomainError("NOT_FOUND", "Authority not found.", 404);
    if (current.status !== "ACTIVE") throw new DomainError("NOT_ACTIVE", "That access has already ended.", 409);
    const removed = await tx.authorisationPermission.deleteMany({ where: { authorisationId, capabilityId: perm.capabilityId } });
    if (removed.count === 0) return;
    const remaining=a.permissions.filter(p=>p.capability.code!==capabilityCode).map(p=>p.capability.code);
    await tx.authorisation.update({where:{id:authorisationId},data:{constraints:JSON.parse(JSON.stringify(selectConstraints((current.constraints ?? {}) as Constraints,remaining)))}});
    await tx.consentEvidence.create({ data: { authorisationId, kind: "SCOPE_REMOVED", payload: { principal_ref: principalId, capability: capabilityCode } } });
    const ds = await tx.delegation.findMany({ where: { mandateId: authorisationId } });
    for (const d of ds) {
      await tx.delegation.update({ where: { id: d.id }, data: { capabilities: d.capabilities.filter((c) => c !== capabilityCode), constraints: JSON.parse(JSON.stringify(selectConstraints((d.constraints ?? {}) as Constraints,remaining))) } });
    }
  });
}

/** "I didn't agree to this": mark the receipt, and stop the agent doing that again. */
export async function disputeReceipt(receiptId: string, principalId: string) {
  const r = await prisma.receipt.findUnique({ where: { id: receiptId } });
  if (!r || r.principalId !== principalId) throw new DomainError("NOT_FOUND", "Receipt not found.", 404);
  await prisma.receipt.update({ where: { id: r.id }, data: { status: "DISPUTED", disputedAt: new Date(), seenAt: r.seenAt ?? new Date() } });
  await narrowAuthorisation(r.mandateId, principalId, r.capability).catch((e) => {
    if (!(e instanceof DomainError)) throw e; // the authority may already be gone
  });
  return r.mandateId;
}
