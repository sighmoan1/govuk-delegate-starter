import { createHash } from 'node:crypto';
import { prisma } from './db';
import { DomainError } from './requests';
import { verifySecretCached } from './secrets';
export type CatalogueCapability = {code:string;name:string;description:string;risk:'LOW'|'MEDIUM'|'HIGH';requires_step_up:boolean;minimum_assurance:'DECLARED'|'REGISTERED'|'VERIFIED';operation:{method:'GET'|'POST';path:string};documentation_url?:string;supported_constraints?:Record<string,{type:'enum';values:string[]}>};
export type Catalogue = {schema_version:1;service:string;version:number;capabilities:CatalogueCapability[]};
function bad(message:string):never {throw new DomainError('INVALID_CATALOGUE',message);}
const record=(v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const text=(v:unknown,max:number):v is string => typeof v==='string' && v.trim().length>0 && v.length<=max && !/[\u0000-\u001f<>]/.test(v);
const code=(v:unknown):v is string => typeof v==='string' && /^[a-z][a-z0-9_-]{0,79}$/.test(v);
function only(v:Record<string,unknown>,keys:string[]) {if(Object.keys(v).some(k=>!keys.includes(k)))bad('Unsupported field');}
export function validateCatalogue(value:unknown, service:string):Catalogue {
 if(!record(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength>64*1024)bad('Catalogue must be an object under 64 KiB');
 only(value,['schema_version','service','version','capabilities']);
 if(value.schema_version!==1 || value.service!==service || !Number.isSafeInteger(value.version) || Number(value.version)<1)bad('Invalid service, schema or version');
 if(!Array.isArray(value.capabilities) || value.capabilities.length<1 || value.capabilities.length>64)bad('Publish 1–64 capabilities');
 const seen=new Set<string>();
 for(const c of value.capabilities){
  if(!record(c))bad('Invalid capability');only(c,['code','name','description','risk','requires_step_up','minimum_assurance','operation','documentation_url','supported_constraints']);
  if(!code(c.code)||seen.has(c.code)||!text(c.name,160)||!text(c.description,2000))bad('Invalid or duplicate capability text');seen.add(c.code);
  if(!['LOW','MEDIUM','HIGH'].includes(String(c.risk))||typeof c.requires_step_up!=='boolean'||!['DECLARED','REGISTERED','VERIFIED'].includes(String(c.minimum_assurance)))bad('Invalid security declaration');
  if(c.risk==='HIGH' && (!c.requires_step_up || c.minimum_assurance==='DECLARED'))bad('High risk requires step-up and registered or verified assurance');
  if(!record(c.operation))bad('Operation required');only(c.operation,['method','path']);
  if(!['GET','POST'].includes(String(c.operation.method))||typeof c.operation.path!=='string'||!/^\/api\/[a-z0-9/_{}-]{1,180}$/.test(c.operation.path))bad('Invalid operation reference');
  if(c.documentation_url!==undefined){try{const u=new URL(String(c.documentation_url));if(u.protocol!=='https:'||u.username||u.password)bad('Documentation must be HTTPS');}catch{bad('Invalid documentation URL');}}
  if(c.supported_constraints!==undefined){
   if(!record(c.supported_constraints)||Object.keys(c.supported_constraints).length>8)bad('At most eight constraint fields');
   for(const [key,rule] of Object.entries(c.supported_constraints)){if(!code(key)||!record(rule))bad('Invalid constraint');only(rule,['type','values']);if(rule.type!=='enum'||!Array.isArray(rule.values)||rule.values.length<1||rule.values.length>32||rule.values.some(v=>!text(v,100))||new Set(rule.values).size!==rule.values.length)bad('Only bounded enum constraints are supported');}
  }
 }
 return value as unknown as Catalogue;
}
function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(record(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
export const catalogueDigest=(c:Catalogue)=>createHash('sha256').update(canonical(c)).digest('hex');
export async function authenticatedService(req:Request,slug:string){const service=await prisma.service.findUnique({where:{slug}});const key=req.headers.get('x-service-key')??'';if(!service||!key||!verifySecretCached(key,service.apiKeyHash))throw new DomainError('INVALID_SERVICE_AUTHENTICATION','Service credentials required',401);return service;}
export async function publishCatalogue(serviceId:string,catalogue:Catalogue){
 const digest=catalogueDigest(catalogue);
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalogue:${serviceId}`},0))`;
  const same=await tx.serviceCatalogue.findUnique({where:{serviceId_version:{serviceId,version:catalogue.version}}});
  if(same){if(same.digest!==digest)throw new DomainError('VERSION_CONTENT_CONFLICT','Published versions cannot change',409);return {row:same,replayed:true};}
  const latest=await tx.serviceCatalogue.findFirst({where:{serviceId},orderBy:{version:'desc'}});
  if(latest && catalogue.version<=latest.version)throw new DomainError('VERSION_NOT_INCREASING','New versions must increase',409);
  const row=await tx.serviceCatalogue.create({data:{serviceId,version:catalogue.version,digest,document:JSON.parse(JSON.stringify(catalogue))}});
  return {row,replayed:false};
 });
}

export async function readCatalogueBody(req:Request):Promise<unknown> {
 const reader=req.body?.getReader();if(!reader)bad('JSON body required');
 const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,raw='';
 try {while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536){await reader.cancel();throw new DomainError('INVALID_CATALOGUE','Body exceeds 64 KiB',413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();return JSON.parse(raw);}
 catch(e){if(e instanceof DomainError)throw e;bad('Invalid UTF-8 JSON');}
 finally {reader.releaseLock();}
}
