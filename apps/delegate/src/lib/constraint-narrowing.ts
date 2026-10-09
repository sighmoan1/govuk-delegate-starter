import { prisma } from "./db";
import { DomainError } from "./requests";
import { validateConstraints, narrowConstraints, type Constraints } from "./constraints";
import type { CatalogueCapability } from "./catalogues";
export async function narrowMandateConstraints(id:string, principalId:string, value:unknown) {
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM authorisation WHERE id = ${id} FOR UPDATE`;
  const mandate=await tx.authorisation.findUnique({where:{id},include:{permissions:{include:{capability:true}}}});
  if(!mandate || mandate.principalId!==principalId) throw new DomainError("NOT_FOUND","Access not found",404);
  if(mandate.status!=="ACTIVE" || mandate.validUntil<=new Date()) throw new DomainError("NOT_ACTIVE","Access has ended",409);
  const defs=mandate.permissions.map(p=>p.capability.metadata as unknown as CatalogueCapability).filter(Boolean);
  const codes=mandate.permissions.map(p=>p.capability.code);
  const previous=validateConstraints(mandate.constraints,defs);
  const constraints=narrowConstraints(previous,validateConstraints(value,defs),codes);
  await tx.authorisation.update({where:{id},data:{constraints:JSON.parse(JSON.stringify(constraints))}});
  await tx.consentEvidence.create({data:{authorisationId:id,kind:"CONSTRAINTS_NARROWED",payload:{principal_ref:principalId,previous, constraints}}});
  return constraints;
 });
}
