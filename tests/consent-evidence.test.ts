import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { approvalEvidence } from "@/lib/consent-evidence";
import { ConsentHistory } from "@/components/consent-history";
vi.mock("@/lib/db", () => ({ prisma: {} }));
function fixture() {
 return { presentation_version: 1, catalogue: { id: "catalogue-1", version: 1, digest: "original-digest" }, service: { slug: "library", name: "Council library" }, delegate: { name: "Assistant", provider: "Example provider" }, purpose: "No additional purpose", conditions: "No additional conditions", authorisation_days: 30, request_expires_at: "2026-10-16T18:00:00Z", capabilities: [
  { id: "reserve", code: "reserve_book", name: "Reserve a book", description: "Reserve your chosen book.", risk: "LOW" as const, requires_step_up: false, minimum_assurance: "REGISTERED" as const },
  { id: "purchase", code: "purchase_book", name: "Purchase a book", description: "Buy your chosen book.", risk: "HIGH" as const, requires_step_up: true, minimum_assurance: "REGISTERED" as const },
 ] };
}
const evidence = () => approvalEvidence({ presentation: fixture(), selected: ["reserve_book"], principalRef: "synthetic-uuid", delegateId: "agent-id", serviceId: "library-id", assurance: "REGISTERED", approvedAt: new Date("2026-10-09T18:00:00Z"), validUntil: new Date("2026-11-08T18:00:00Z"), method: "CITIZEN_BROWSER" });
it("evidence keeps selected original meanings, exact copy, assurance and expiry without claim contents", () => {
 const saved=evidence();
 expect(saved.capabilities.map(c=>c.code)).toEqual(["reserve_book"]);
 expect(saved.capabilities[0]).toMatchObject({description:"Reserve your chosen book.",risk_explanation:"The service classifies this as a lower-risk permission.",fresh_approval_explanation:"The assistant can use this permission without asking you to approve each action separately."});
 expect(saved.representative.assurance).toBe("REGISTERED");
 expect(saved.valid_until).toBe("2026-11-08T18:00:00.000Z");
 expect(saved.principal_ref).toBe("synthetic-uuid");
 expect(saved.restrictions).toEqual([]);
 expect(saved).not.toHaveProperty("prompt");
 expect(saved).not.toHaveProperty("claim");
});
it("later presentation changes cannot rewrite a prepared snapshot", () => {
 const presentation=fixture();
 const saved=approvalEvidence({presentation,selected:["reserve_book"],principalRef:"uuid",delegateId:"agent",serviceId:"service",assurance:"REGISTERED",approvedAt:new Date(),validUntil:new Date(),method:"CITIZEN_BROWSER"});
 presentation.catalogue.digest="new-digest";
 presentation.capabilities[0].description="Reserve and purchase books";
 expect(saved.catalogue.digest).toBe("original-digest");
 expect(saved.capabilities[0].description).toBe("Reserve your chosen book.");
});
it("citizen history separates original approval, subsequent removal and changed definitions", () => {
 const original=evidence();
 const html=renderToStaticMarkup(React.createElement(ConsentHistory,{original,changed:true,history:[{id:"change",kind:"SCOPE_REMOVED",occurredAt:new Date("2026-10-10T18:00:00Z"),capability:"reserve_book"}]}));
 expect(html).toContain("Reserve your chosen book.");
 expect(html).toContain("Permission removed: Reserve a book");
 expect(html).toContain("original wording above remains unchanged");
 expect(html).toContain("separate from transaction receipts and outcomes");
});
it("legacy grants do not invent retrospective evidence", () => {
 const html=renderToStaticMarkup(React.createElement(ConsentHistory,{original:null,changed:false,history:[]}));
 expect(html).toContain("cannot be reconstructed reliably");
});
