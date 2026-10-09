import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo } from '@/lib/demo-seed';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashSecret } from '@/lib/secrets';
import { validateCatalogue, catalogueDigest, type Catalogue } from '@/lib/catalogues';
import { GET, POST } from '@/app/api/services/[slug]/catalogues/route';
const slug='catalogue-'+randomUUID().slice(0,8), key='fixture-only-service-key';
const fixture=(version=1):Catalogue=>({schema_version:1,service:slug,version,capabilities:[{code:'view_case',name:'View your case',description:'Read the status of your synthetic case.',risk:'LOW',requires_step_up:false,minimum_assurance:'REGISTERED',operation:{method:'GET',path:'/api/cases'}}]});
const ctx={params:Promise.resolve({slug})};
const post=(c:unknown,credential=key)=>POST(new Request('http://test/api/services/'+slug+'/catalogues',{method:'POST',headers:{'content-type':'application/json','x-service-key':credential},body:JSON.stringify(c)}),ctx);
beforeAll(async()=>{await prisma.service.create({data:{slug,name:'Synthetic catalogue service',apiKeyHash:hashSecret(key)}});});
afterAll(()=>prisma.$disconnect());
describe('service-owned immutable catalogue publication',()=>{
 it('rejects absent, agent and another service credentials without publication',async()=>{
  for(const credential of ['', 'dev-demo-agent-secret','dev-hmrc-service-key'])expect((await post(fixture(),credential)).status).toBe(401);
  expect((await GET(new Request('http://test/api/services/'+slug+'/catalogues',{headers:{'x-service-key':'dev-demo-agent-secret'}}),ctx)).status).toBe(401);
  expect((await post({oversized:'界'.repeat(24000)})).status).toBe(413);
  expect(await prisma.serviceCatalogue.count({where:{service:{slug}}})).toBe(0);
 });
 it('serialises simultaneous equal publication and preserves the original content',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>post(fixture())));
  expect(results.map(r=>r.status).sort()).toEqual([200,200,200,200,200,200,200,201]);
  const rows=await prisma.serviceCatalogue.findMany({where:{service:{slug}}});expect(rows).toHaveLength(1);expect(rows[0].digest).toBe(catalogueDigest(fixture()));
  const changed=fixture();changed.capabilities[0].description='A different business meaning';expect((await post(changed)).status).toBe(409);
  await expect(prisma.serviceCatalogue.update({where:{id:rows[0].id},data:{digest:'tampered'}})).rejects.toThrow();
 });
 it('publishes a new version without modifying existing capability/grant records; old versions stay addressable',async()=>{
  const before=await prisma.capability.findMany({where:{service:{slug:'hmrc-personal-tax'}},orderBy:{code:'asc'}});
  const v2=fixture(2);v2.capabilities=[{...v2.capabilities[0],code:'read_decision',name:'Read a decision'}];expect((await post(v2)).status).toBe(201);
  const response=await GET(new Request('http://test/api/services/'+slug+'/catalogues?version=1',{headers:{'x-service-key':key}}),ctx);expect(response.status).toBe(200);expect((await response.json()).document).toEqual(fixture());
  expect(await prisma.capability.findMany({where:{service:{slug:'hmrc-personal-tax'}},orderBy:{code:'asc'}})).toEqual(before);
 });
 it('rejects unsupported fields, unsafe text, weakened high-risk declarations and malformed constraints',()=>{
  for(const change of [ {service:'other-service'}, {schema_version:2}, {extra:'ignored'}, {capabilities:[]}, {capabilities:[{...fixture().capabilities[0],name:'<script>bad</script>'}]}, {capabilities:[{...fixture().capabilities[0],risk:'HIGH'}]}, {capabilities:[{...fixture().capabilities[0],supported_constraints:{year:{type:'arbitrary-code',values:['2026']}}}]} ])expect(()=>validateCatalogue({...fixture(),...change},slug)).toThrow();
 });
 it('citizen fixture reset preserves registered service identities and catalogue history',async()=>{
  const before=await prisma.serviceCatalogue.findMany({where:{service:{slug}},orderBy:{version:'asc'}});
  await seedDemo(prisma);
  expect(await prisma.serviceCatalogue.findMany({where:{service:{slug}},orderBy:{version:'asc'}})).toEqual(before);
  expect(await prisma.service.findUnique({where:{slug}})).not.toBeNull();
 });

});
