import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { approveRequest,createRequest,revokeAuthorisation } from "@/lib/requests";
import { checkAuthority } from "@/lib/authority";
import { subDelegate } from "@/lib/delegations";
import { narrowMandateConstraints } from "@/lib/constraint-narrowing";
import { loadConsentHistory } from "@/lib/consent-evidence";
import { consentPresentation } from "@/lib/consent-presentation";
import { demoAgent, HMRC } from "./helpers";
afterAll(()=>prisma.$disconnect());
const year="2026 to 2027", previous="2025 to 2026",cap="claim_job_expenses";
const restrictions=(values:string[])=>({[cap]:{tax_year:values}});
async function fixture(values=[year]) {
 const {token,delegateId}=await demoAgent();
 const principal=await prisma.principal.create({data:{oneLoginSubjectId:"urn:constraints:"+randomUUID(),displayName:"Constraint fixture"}});
 const req=await createRequest({delegateId,service:"hmrc-personal-tax",capabilities:[cap],constraints:restrictions(values)});
 return {token,delegateId,principal,req};
}
it("round-trips requested, presented, approved, checked and revoked with pinned provenance",async()=>{
 const {req,principal,delegateId}=await fixture();
 expect(consentPresentation(req).capabilities[0].restrictions).toEqual({tax_year:[year]});
 const auth=await approveRequest(req.id,principal.id,[cap]);
 const input={principalId:principal.id,presenter:{kind:"agent" as const,delegateId},service:"hmrc-personal-tax",capability:cap,catalogueVersion:2};
 expect(await checkAuthority(input)).toMatchObject({authorised:true,constraints:restrictions([year]),catalogue:{version:2}});
 expect(await checkAuthority({...input,catalogueVersion:1})).toMatchObject({authorised:false,reason:"CATALOGUE_INCOMPATIBLE"});
 const saved=(await loadConsentHistory(auth.id,principal.id))[0].payload as Record<string,unknown>;
 expect(saved.restrictions).toEqual([{capability:cap,field:"tax_year",values:[year]}]);
 await revokeAuthorisation(auth.id,principal.id);
 expect(await checkAuthority(input)).toMatchObject({authorised:false,reason:"AUTHORISATION_REVOKED"});
});
it("rejects wider approval and subdelegation, supports citizen narrowing and binds descendants to live mandate",async()=>{
 const {req,principal,delegateId}=await fixture();
 await expect(approveRequest(req.id,principal.id,[cap],"SYNTHETIC_DEMO_API",restrictions([previous,year]))).rejects.toMatchObject({code:"CONSTRAINTS_INVALID"});
 const auth=await approveRequest(req.id,principal.id,[cap]);
 const input={parent:{kind:"agent" as const,delegateId},principalId:principal.id,service:"hmrc-personal-tax",capabilities:[cap]};
 await expect(subDelegate({...input,constraints:restrictions([previous,year])})).rejects.toMatchObject({code:"CONSTRAINTS_INVALID"});
 const child=await subDelegate(input);
 expect(await checkAuthority({principalId:principal.id,presenter:{kind:"delegation",delegationId:child.delegation.id},service:input.service,capability:cap,catalogueVersion:2})).toMatchObject({authorised:true,constraints:restrictions([year])});
 const wide=await fixture([previous,year]);const wideAuth=await approveRequest(wide.req.id,wide.principal.id,[cap]);
 const inherited=await subDelegate({...input,principalId:wide.principal.id});
 const original=(await loadConsentHistory(wideAuth.id,wide.principal.id))[0];
 await narrowMandateConstraints(wideAuth.id,wide.principal.id,restrictions([year]));
 expect(await checkAuthority({principalId:wide.principal.id,presenter:{kind:"delegation",delegationId:inherited.delegation.id},service:input.service,capability:cap,catalogueVersion:2})).toMatchObject({authorised:true,constraints:restrictions([year])});
 expect((await loadConsentHistory(wideAuth.id,wide.principal.id))[0]).toEqual(original);
 await expect(narrowMandateConstraints(wideAuth.id,wide.principal.id,restrictions([previous,year]))).rejects.toMatchObject({code:"CONSTRAINTS_INVALID"});
 await expect(narrowMandateConstraints(auth.id,wide.principal.id,restrictions([year]))).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("HMRC denies cross-year actions from the agent and sub-agent, permits the matching year with no extra claim effects",async()=>{
 const {req,principal,delegateId,token}=await fixture();
 const auth=await approveRequest(req.id,principal.id,[cap]);
 const child=await subDelegate({parent:{kind:"agent",delegateId},principalId:principal.id,service:"hmrc-personal-tax",capabilities:[cap]});
 const submit=async(t:string,tax_year:string)=>{const r=await fetch(`${HMRC}/api/job-expenses`,{method:"POST",headers:{authorization:`Bearer ${t}`,"content-type":"application/json","x-principal-id":principal.id},body:JSON.stringify({tax_year})});return {status:r.status,body:await r.json()};};
 for(const t of [token,child.token]) expect(await submit(t,previous)).toMatchObject({status:403,body:{reason:"MANDATE_CONSTRAINT_REFUSED"}});
 expect((await submit(token,year)).status).toBe(200);
 await revokeAuthorisation(auth.id,principal.id);
 expect((await submit(child.token,year)).status).toBe(403);
});
it("unknown inputs fail closed; plain old grants acquire no default restrictions",async()=>{
 const {delegateId,principal}=await fixture();
 for(const constraints of [{[cap]:{tax_year:["2099 to 2100"]}},{[cap]:{script:["allow"]}},{unknown:{tax_year:[year]}}]) await expect(createRequest({delegateId,service:"hmrc-personal-tax",capabilities:[cap],constraints})).rejects.toMatchObject({code:"CONSTRAINTS_INVALID"});
 const req=await createRequest({delegateId,service:"hmrc-personal-tax",capabilities:[cap]});await approveRequest(req.id,principal.id,[cap]);
 expect(await checkAuthority({principalId:principal.id,presenter:{kind:"agent",delegateId},service:"hmrc-personal-tax",capability:cap})).toMatchObject({authorised:true,constraints:{}});
});
