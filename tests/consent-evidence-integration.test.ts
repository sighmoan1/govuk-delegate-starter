import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { publishCatalogue } from "@/lib/catalogues";
import { loadConsentHistory } from "@/lib/consent-evidence";
import { approveRequest, createRequest, revokeAuthorisation } from "@/lib/requests";
import { narrowAuthorisation } from "@/lib/receipts";
import { hashSecret } from "@/lib/secrets";
afterAll(() => prisma.$disconnect());
const cap = { code:"reserve_book",name:"Reserve a book",description:"Reserve your chosen synthetic book.",risk:"LOW" as const,requires_step_up:false,minimum_assurance:"REGISTERED" as const,operation:{method:"POST" as const,path:"/api/reservations"} };
async function fixture() {
 const slug="evidence-"+randomUUID();
 const service=await prisma.service.create({data:{slug,name:"Council library",apiKeyHash:hashSecret("fixture")}});
 await publishCatalogue(service.id,{schema_version:1,service:slug,version:1,capabilities:[cap]});
 const delegate=await prisma.delegate.findFirstOrThrow({where:{clientId:"demo-personal-agent"}});
 const principal=await prisma.principal.create({data:{oneLoginSubjectId:"urn:evidence:"+randomUUID(),displayName:"Synthetic citizen"}});
 const req=await createRequest({delegateId:delegate.id,service:slug,capabilities:[cap.code]});
 return {service,principal,req};
}
it("stores one approval atomically under concurrent decision attempts", async () => {
 const {principal,req}=await fixture();
 const results=await Promise.allSettled([approveRequest(req.id,principal.id,[cap.code]),approveRequest(req.id,principal.id,[cap.code])]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 const approved=await prisma.authorisationRequest.findUniqueOrThrow({where:{id:req.id}});
 expect(await prisma.consentEvidence.count({where:{authorisationId:approved.authorisationId!,kind:"APPROVED"}})).toBe(1);
});
it("database blocks snapshot and access-audit updates/deletes while a mandate exists", async () => {
 const {principal,req}=await fixture();const auth=await approveRequest(req.id,principal.id,[cap.code]);
 const [saved]=await loadConsentHistory(auth.id,principal.id);
 await expect(prisma.consentEvidence.update({where:{id:saved.id},data:{payload:{tampered:true}}})).rejects.toThrow();
 await expect(prisma.consentEvidence.delete({where:{id:saved.id}})).rejects.toThrow();
 const read=await prisma.consentEvidenceAccess.findFirstOrThrow({where:{authorisationId:auth.id}});
 await expect(prisma.consentEvidenceAccess.delete({where:{id:read.id}})).rejects.toThrow();
 expect((await loadConsentHistory(auth.id,principal.id))[0].payload).toEqual(saved.payload);
});
it("new catalogue, narrowing and revocation preserve original evidence with separate history", async () => {
 const {service,principal,req}=await fixture();const auth=await approveRequest(req.id,principal.id,[cap.code],"CITIZEN_BROWSER");
 const original=(await loadConsentHistory(auth.id,principal.id))[0];
 await publishCatalogue(service.id,{schema_version:1,service:service.slug,version:2,capabilities:[{...cap,name:"Reserve and purchase books"}]});
 await narrowAuthorisation(auth.id,principal.id,cap.code);
 await narrowAuthorisation(auth.id,principal.id,cap.code);
 await revokeAuthorisation(auth.id,principal.id);
 const history=await loadConsentHistory(auth.id,principal.id);
 expect(history.find(e=>e.kind==="APPROVED")).toEqual(original);
 expect(history.filter(e=>e.kind==="SCOPE_REMOVED")).toHaveLength(1);
 expect(history.filter(e=>e.kind==="REVOKED")).toHaveLength(1);
 expect(await prisma.authorisationPermission.count({where:{authorisationId:auth.id}})).toBe(0);
});
it("another principal cannot retrieve consent evidence or create a successful-read audit", async () => {
 const {principal,req}=await fixture();const auth=await approveRequest(req.id,principal.id,[cap.code]);
 const other=await prisma.principal.create({data:{oneLoginSubjectId:"urn:other:"+randomUUID(),displayName:"Other synthetic citizen"}});
 await expect(loadConsentHistory(auth.id,other.id)).rejects.toMatchObject({code:"NOT_FOUND"});
 expect(await prisma.consentEvidenceAccess.count({where:{authorisationId:auth.id}})).toBe(0);
 expect((await loadConsentHistory(auth.id,principal.id))).toHaveLength(1);
});
it("explicit parent erasure cascades history for synthetic reset without rewriting evidence", async () => {
 const {principal,req}=await fixture();const auth=await approveRequest(req.id,principal.id,[cap.code]);
 await loadConsentHistory(auth.id,principal.id);
 await prisma.authorisationRequest.update({where:{id:req.id},data:{authorisationId:null}});
 await prisma.authorisation.delete({where:{id:auth.id}});
 expect(await prisma.consentEvidence.count({where:{authorisationId:auth.id}})).toBe(0);
 expect(await prisma.consentEvidenceAccess.count({where:{authorisationId:auth.id}})).toBe(0);
});
