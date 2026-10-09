import { validateConstraints, type Constraints } from "./constraints";
import { catalogueDigest, validateCatalogue, type CatalogueCapability } from "./catalogues";
import { AUTHORISATION_DAYS } from "./config";
import { DomainError } from "./requests";

// Plain JSON interface for the evidence snapshot in #31. Resolve ONLY the
// immutable publication pinned by this request, never today's latest catalogue.
export type ConsentCapability = Pick<CatalogueCapability, "code" | "name" | "description" | "risk" | "requires_step_up" | "minimum_assurance"> & { id: string; restrictions?: Record<string,string[]>; constraint_labels?:Record<string,string> };
type Publication = { id: string; serviceId: string; version: number; digest: string; document: unknown };
type ConsentRequest = {
  constraints?: unknown;
  serviceId: string;
  service: { slug: string; name: string };
  delegate: { name: string; provider: string };
  expiresAt: Date;
  permissions: { capability: { id: string; serviceId: string; catalogueId: string | null; code: string; name: string; riskLevel: string; requiresStepUp: boolean; metadata: unknown; catalogue: Publication | null } }[];
};
export const riskExplanation = (risk: ConsentCapability["risk"]) => ({
  LOW: "The service classifies this as a lower-risk permission.",
  MEDIUM: "This permission can affect your records or requests. Read the description before allowing it.",
  HIGH: "The service classifies this as a sensitive action. Only allow it if you are sure.",
})[risk];
export const freshApprovalExplanation = (required: boolean) => required
  ? "You must approve the details of each proposed action separately before it can go ahead."
  : "The assistant can use this permission without asking you to approve each action separately.";
export const CONSENT_UNAVAILABLE = "We cannot verify the permissions in this request. Ask the assistant to make a new request, or reject this one.";

export function consentPresentation(req: ConsentRequest) {
  const unavailable = (): never => { throw new DomainError("CONSENT_UNAVAILABLE", CONSENT_UNAVAILABLE, 409); };
  const publication = req.permissions[0]?.capability.catalogue;
  if (!publication || publication.serviceId !== req.serviceId) return unavailable();
  let catalogue;
  try { catalogue = validateCatalogue(publication.document, req.service.slug); } catch { return unavailable(); }
  if (catalogue.version !== publication.version || catalogueDigest(catalogue) !== publication.digest) return unavailable();
  const restrictions = validateConstraints(req.constraints, catalogue.capabilities);
  if(Object.keys(restrictions).some(code=>!req.permissions.some(p=>p.capability.code===code))) return unavailable();
  const seen = new Set<string>();
  const capabilities: ConsentCapability[] = req.permissions.map(({ capability: row }) => {
    const definition = catalogue.capabilities.find(c => c.code === row.code);
    if (!definition || seen.has(row.code) || row.serviceId !== req.serviceId || row.catalogueId !== publication.id ||
        row.catalogue?.digest !== publication.digest ||
        !row.metadata || typeof row.metadata !== "object" ||
        (row.metadata as Record<string, unknown>).minimum_assurance !== definition.minimum_assurance || row.name !== definition.name || row.riskLevel !== definition.risk || row.requiresStepUp !== definition.requires_step_up) return unavailable();
    seen.add(row.code);
    return { id: row.id, code: definition.code, name: definition.name, description: definition.description, risk: definition.risk,
      restrictions: restrictions[row.code], constraint_labels: Object.fromEntries(Object.entries(definition.supported_constraints ?? {}).map(([key,rule])=>[key,rule.label ?? key])),
      requires_step_up: definition.requires_step_up, minimum_assurance: definition.minimum_assurance };
  });
  return {
    presentation_version: 1,
    catalogue: { id: publication.id, version: publication.version, digest: publication.digest },
    service: { slug: req.service.slug, name: req.service.name },
    delegate: { name: req.delegate.name, provider: req.delegate.provider },
    purpose: "The assistant has requested the permissions listed below. No additional purpose was provided.",
    conditions: "No additional conditions are attached to this request. Permission is limited to the actions you select.",
    authorisation_days: AUTHORISATION_DAYS,
    request_expires_at: req.expiresAt.toISOString(),
    capabilities,
  };
}

export function narrowConsent(capabilities: ConsentCapability[], picked: string[]) {
  if (picked.some(code => !capabilities.some(c => c.code === code))) {
    throw new DomainError("NOT_REQUESTED", "You can only approve permissions that were requested");
  }
  const allowed = capabilities.filter(c => picked.includes(c.code));
  if (!allowed.length) throw new DomainError("NO_PERMISSIONS", "Choose at least one permission, or reject the request");
  return allowed;
}
