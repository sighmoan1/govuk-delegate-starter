import type { Constraints } from "./constraints";
import { prisma } from "./db";
import { DomainError } from "./requests";
import { consentPresentation, freshApprovalExplanation, riskExplanation } from "./consent-presentation";

export function approvalEvidence(input: {
  presentation: ReturnType<typeof consentPresentation>;
  selected: string[];
  constraints?: Constraints;
  principalRef: string;
  delegateId: string;
  serviceId: string;
  assurance: string;
  approvedAt: Date;
  validUntil: Date;
  method: "CITIZEN_BROWSER" | "SYNTHETIC_DEMO_API";
}) {
  const { presentation } = input;
  return {
    evidence_version: 1,
    principal_ref: input.principalRef,
    representative: { id: input.delegateId, ...presentation.delegate, assurance: input.assurance },
    service: { id: input.serviceId, ...presentation.service },
    catalogue: { ...presentation.catalogue },
    approved_at: input.approvedAt.toISOString(),
    valid_until: input.validUntil.toISOString(),
    approval_method: input.method,
    purpose: presentation.purpose,
    conditions: presentation.conditions,
    restrictions: Object.entries(input.constraints ?? {}).flatMap(([capability, fields])=>Object.entries(fields).map(([field, values])=>({capability, field, values: [...values]}))),
    authorisation_days: presentation.authorisation_days,
    request_expires_at: presentation.request_expires_at,
    capabilities: presentation.capabilities.filter(c => input.selected.includes(c.code)).map(c => ({ ...c, restrictions: input.constraints?.[c.code] ?? c.restrictions,
      risk_explanation: riskExplanation(c.risk),
      fresh_approval_explanation: freshApprovalExplanation(c.requires_step_up),
      identity_explanation: `The assistant must have ${c.minimum_assurance === "VERIFIED" ? "a verified identity" : c.minimum_assurance === "REGISTERED" ? "a registered identity" : "a declared identity"} to use this permission.`,
    })),
  };
}
export type ApprovalEvidence = ReturnType<typeof approvalEvidence>;

/** Citizen-only read boundary. No agent or service evidence endpoint exists. */
export async function loadConsentHistory(authorisationId: string, principalId: string) {
  const auth = await prisma.authorisation.findUnique({ where: { id: authorisationId }, select: { principalId: true } });
  if (!auth || auth.principalId !== principalId) throw new DomainError("NOT_FOUND", "Authority not found", 404);
  return prisma.$transaction(async tx => {
    const history = await tx.consentEvidence.findMany({ where: { authorisationId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
    await tx.consentEvidenceAccess.create({ data: { authorisationId, principalRef: principalId } });
    return history;
  });
}
