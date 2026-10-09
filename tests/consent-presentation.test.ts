import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsentTerms, PermissionDescription, ConsentUnavailable } from "@/components/consent-details";
import { expect, it, vi } from "vitest";
import { catalogueDigest, type Catalogue } from "@/lib/catalogues";
import { consentPresentation, narrowConsent } from "@/lib/consent-presentation";
vi.mock("@/lib/db", () => ({ prisma: {} }));

const definition = { code: "reserve_book", name: "Reserve a library book", description: "Reserve a book at your chosen library.", risk: "MEDIUM" as const, requires_step_up: false, minimum_assurance: "REGISTERED" as const, operation: { method: "POST" as const, path: "/api/reservations" } };
const document: Catalogue = { schema_version: 1, service: "libraries", version: 1, capabilities: [definition] };
function fixture() {
  const catalogue = { id: "catalogue-1", serviceId: "service-1", version: 1, digest: catalogueDigest(document), document: structuredClone(document) };
  return { serviceId: "service-1", service: { slug: "libraries", name: "Council libraries" }, delegate: { name: "Assistant & helper", provider: "Example provider" }, expiresAt: new Date("2026-10-16T18:00:00Z"), permissions: [{ capability: { id: "cap-1", serviceId: "service-1", catalogueId: catalogue.id, code: definition.code, name: definition.name, riskLevel: definition.risk, requiresStepUp: definition.requires_step_up, metadata: { ...definition }, catalogue } }] };
}
it("renders another service's pinned descriptions, risk and fresh-approval metadata as JSON evidence", () => {
  const presentation = consentPresentation(fixture());
  expect(presentation.capabilities[0]).toMatchObject({ name: definition.name, description: definition.description, risk: "MEDIUM", requires_step_up: false });
  expect(presentation.catalogue).toMatchObject({ version: 1, digest: catalogueDigest(document) });
  expect(presentation.authorisation_days).toBe(30);
  expect(presentation.conditions).toContain("No additional conditions");
});
it("narrowing does not add permissions, accepts duplicates once, and rejects unknown or empty choices", () => {
  const caps = consentPresentation(fixture()).capabilities;
  expect(narrowConsent(caps, [definition.code, definition.code])).toEqual(caps);
  expect(() => narrowConsent(caps, [])).toThrow("Choose at least one");
  expect(() => narrowConsent(caps, [definition.code, "extra_scope"])).toThrow("only approve");
});
it("missing catalogue, unknown code, changed row and incompatible catalogue version fail closed", () => {
  const missing = fixture(); missing.permissions[0].capability.catalogueId = "missing";
  const unknown = fixture(); unknown.permissions[0].capability.code = "unknown";
  const changed = fixture(); changed.permissions[0].capability.name = "Broader action";
  const version = fixture(); version.permissions[0].capability.catalogue.version = 2;
  const assurance = fixture(); assurance.permissions[0].capability.metadata.minimum_assurance = "DECLARED" as "REGISTERED";
  const digest = fixture(); digest.permissions[0].capability.catalogue.digest = "tampered";
  for (const req of [missing, unknown, changed, version, digest, assurance]) expect(() => consentPresentation(req)).toThrow("cannot verify");
});
it("HTML or executable catalogue text is refused even when its digest matches", () => {
  const req = fixture();
  req.permissions[0].capability.catalogue.document.capabilities[0].description = "<script>alert(1)</script>";
  req.permissions[0].capability.catalogue.digest = catalogueDigest(req.permissions[0].capability.catalogue.document);
  expect(() => consentPresentation(req)).toThrow("cannot verify");
});
it("a later publication does not substitute a broader meaning for this request's immutable version", () => {
  const req = fixture();
  const v2 = { ...document, version: 2, capabilities: [{ ...definition, name: "Reserve and purchase books" }] };
  expect(catalogueDigest(v2)).not.toBe(req.permissions[0].capability.catalogue.digest);
  expect(consentPresentation(req).capabilities[0].name).toBe("Reserve a library book");
});

it("renders service and delegate text escaped, labels fresh approval, and offers only rejection on failure", () => {
  const presentation = consentPresentation(fixture());
  presentation.purpose = 'Agent text: <img src=x onerror=alert(1)>';
  const terms = renderToStaticMarkup(React.createElement(ConsentTerms, { presentation }));
  expect(terms).toContain('&lt;img');
  expect(terms).not.toContain('<img');
  const permission = renderToStaticMarkup(React.createElement(PermissionDescription, { capability: { ...presentation.capabilities[0], requires_step_up: true } }));
  expect(permission).toContain('approve the details of each proposed action');
  const failure = renderToStaticMarkup(React.createElement(ConsentUnavailable, { id: 'request', csrf: 'token' }));
  expect(failure).toContain('value="reject"');
  expect(failure).not.toContain('value="approve"');
  expect(failure).toContain('name="csrf" value="token"');
});
