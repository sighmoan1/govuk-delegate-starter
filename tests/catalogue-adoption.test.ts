import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { currentCapabilities, publishCatalogue, validateCatalogue, type Catalogue } from "@/lib/catalogues";
import { parseProposal } from "@/lib/step-ups";
import { seedDemo } from "@/lib/demo-seed";
import { createRequest, approveRequest } from "@/lib/requests";
import { hashSecret } from "@/lib/secrets";

afterAll(() => prisma.$disconnect());
it("publication preserves legacy permission IDs and security, pins old metadata and supports higher-version rollback", async () => {
 const service = await prisma.service.create({data:{slug:"adoption-"+randomUUID(),name:"Synthetic service",apiKeyHash:hashSecret("fixture-key")}});
 const definition = {code:"change_record",name:"Change your record",description:"Change a synthetic record",risk:"HIGH" as const,requires_step_up:true,minimum_assurance:"REGISTERED" as const,operation:{method:"POST" as const,path:"/api/record"},approval_fields:[{key:"value",label:"New value",required:true,max:8,normalisation:"digits" as const,pattern:"^[0-9]{8}$",display_last:4}]};
 const legacy = await prisma.capability.create({data:{serviceId:service.id,code:definition.code,name:definition.name,riskLevel:"HIGH",requiresStepUp:true}});
 const incompatible = await prisma.capability.create({data:{serviceId:service.id,code:"different_record",name:"Old wording",riskLevel:"HIGH",requiresStepUp:true}});
 const v1:Catalogue={schema_version:1,service:service.slug,version:1,capabilities:[definition,{...definition,code:incompatible.code}]};
 await publishCatalogue(service.id,validateCatalogue(v1,service.slug));
 const old=await prisma.capability.findUniqueOrThrow({where:{id:legacy.id}});
 expect(old).toMatchObject({id:legacy.id,name:legacy.name,riskLevel:"HIGH",requiresStepUp:true,catalogueId:null,metadata:definition});
 expect((await prisma.capability.findUniqueOrThrow({where:{id:incompatible.id}})).metadata).toBeNull();
 const first=await currentCapabilities(service.id);expect(first).toHaveLength(2);
 expect((await publishCatalogue(service.id,v1)).replayed).toBe(true);
 expect(await currentCapabilities(service.id)).toEqual(first);
 const delegate=await prisma.delegate.findFirstOrThrow({where:{clientId:"demo-personal-agent"}});
 const principal=await prisma.principal.create({data:{oneLoginSubjectId:"urn:adoption:"+randomUUID(),displayName:"Synthetic principal"}});
 const pending=await createRequest({delegateId:delegate.id,service:service.slug,capabilities:[definition.code]});
 const pendingCapability=pending.permissions[0].capabilityId;
 const historical=await prisma.authorisation.create({data:{delegateId:delegate.id,principalId:principal.id,serviceId:service.id,validUntil:new Date(Date.now()+86400000),permissions:{create:{capabilityId:legacy.id}}}});
 const v2:Catalogue={...v1,version:2,capabilities:[{...definition,name:"Updated wording",minimum_assurance:"VERIFIED"}]};
 await publishCatalogue(service.id,v2);
 expect((await currentCapabilities(service.id))[0]).toMatchObject({name:"Updated wording",metadata:v2.capabilities[0]});
 expect(await prisma.capability.findUnique({where:{id:first[0].id}})).toEqual(first[0]);
 expect(await prisma.capability.findUnique({where:{id:legacy.id}})).toEqual(old);
 const approved=await approveRequest(pending.id,principal.id,[definition.code]);
 expect((await prisma.authorisationPermission.findMany({where:{authorisationId:approved.id}})).map(p=>p.capabilityId)).toEqual([pendingCapability]);
 expect((await prisma.authorisationPermission.findMany({where:{authorisationId:historical.id}})).map(p=>p.capabilityId)).toEqual([legacy.id]);
 await publishCatalogue(service.id,{...v1,version:3});
 expect((await currentCapabilities(service.id)).map(c=>c.code)).toEqual(v1.capabilities.map(c=>c.code));
 expect(await prisma.capability.findUnique({where:{id:first[0].id}})).toEqual(first[0]);
 const proposal=parseProposal(service.slug,definition.code,{idempotencyKey:"fixture-1",payload:{value:"12 34 56 78"}},definition.approval_fields);
 expect(proposal).toMatchObject({ok:true,payload:{value:"12345678"},display:[{label:"New value",value:"ending 5678"}]});
 expect(parseProposal(service.slug,definition.code,{idempotencyKey:"fixture-2",payload:{value:"bad"}},definition.approval_fields).ok).toBe(false);
});
it("rejects service-supplied executable or unbounded approval expressions", () => {
 const base:Catalogue={schema_version:1,service:"fixture",version:1,capabilities:[{code:"change_record",name:"Change record",description:"Synthetic",risk:"HIGH",requires_step_up:true,minimum_assurance:"REGISTERED",operation:{method:"POST",path:"/api/record"},approval_fields:[{key:"value",label:"Value",required:true,max:8,normalisation:"text",pattern:"^[A-Z]{1,8}$"}]}]};
 expect(validateCatalogue(base,"fixture")).toEqual(base);
 for(const pattern of ["^(a+)+$","^.*$","^[A-Z]+$","^(a|b)$"])expect(()=>validateCatalogue({...base,capabilities:[{...base.capabilities[0],approval_fields:[{...base.capabilities[0].approval_fields![0],pattern}]}]},"fixture")).toThrow();
});

it("citizen reset uses the latest registered HMRC text and preserves all publication rows", async () => {
 const service=await prisma.service.findUniqueOrThrow({where:{slug:"hmrc-personal-tax"}});
 const prior=await prisma.serviceCatalogue.findFirstOrThrow({where:{serviceId:service.id},orderBy:{version:"desc"}});
 const original=prior.document as unknown as Catalogue;
 const changed:Catalogue={...original,version:prior.version+1,capabilities:original.capabilities.map((c,i)=>i===0?{...c,name:"Updated synthetic tax-code label"}:c)};
 await publishCatalogue(service.id,changed);
 const before=await prisma.serviceCatalogue.findMany({where:{serviceId:service.id},orderBy:{version:"asc"}});
 try {
  await seedDemo(prisma);
  expect((await currentCapabilities(service.id))[0].name).toBe("Updated synthetic tax-code label");
  expect(await prisma.serviceCatalogue.findMany({where:{serviceId:service.id},orderBy:{version:"asc"}})).toEqual(before);
 } finally {
  await publishCatalogue(service.id,{...original,version:changed.version+1});
 }
});
