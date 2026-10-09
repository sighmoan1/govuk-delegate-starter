import { Prisma } from '@/generated/prisma';
import { createHash } from 'node:crypto';
import { prisma } from './db';
import { DomainError } from './requests';
import { verifySecretCached } from './secrets';
export type ApprovalField = {key:string;label:string;required:boolean;max:number;normalisation:"text"|"uppercase"|"digits"|"digit_groups";pattern?:string;group_size?:number;group_count?:number;display_last?:number};
export type CatalogueCapability = {code:string;name:string;description:string;risk:'LOW'|'MEDIUM'|'HIGH';requires_step_up:boolean;minimum_assurance:'DECLARED'|'REGISTERED'|'VERIFIED';approval_fields?:ApprovalField[];operation:{method:'GET'|'POST';path:string};documentation_url?:string;supported_constraints?:Record<string,{type:'enum';values:string[]}>};
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
  if(!record(c))bad('Invalid capability');only(c,['code','name','description','risk','requires_step_up','minimum_assurance','operation','documentation_url','supported_constraints','approval_fields']);
  if(!code(c.code)||seen.has(c.code)||!text(c.name,160)||!text(c.description,2000))bad('Invalid or duplicate capability text');seen.add(c.code);
  if(!['LOW','MEDIUM','HIGH'].includes(String(c.risk))||typeof c.requires_step_up!=='boolean'||!['DECLARED','REGISTERED','VERIFIED'].includes(String(c.minimum_assurance)))bad('Invalid security declaration');
  if(c.risk==='HIGH' && (!c.requires_step_up || c.minimum_assurance==='DECLARED'))bad('High risk requires step-up and registered or verified assurance');
  if(!record(c.operation))bad('Operation required');only(c.operation,['method','path']);
  if(!['GET','POST'].includes(String(c.operation.method))||typeof c.operation.path!=='string'||!/^\/api\/[a-z0-9/_{}-]{1,180}$/.test(c.operation.path))bad('Invalid operation reference');
  if(c.documentation_url!==undefined){try{const u=new URL(String(c.documentation_url));if(u.protocol!=='https:'||u.username||u.password)bad('Documentation must be HTTPS');}catch{bad('Invalid documentation URL');}}
  if(c.approval_fields!==undefined){
   if(!Array.isArray(c.approval_fields)||c.approval_fields.length<1||c.approval_fields.length>16)bad('Approval needs 1–16 fields');
   const fields=new Set<string>();
   for(const f of c.approval_fields){
    if(!record(f))bad('Invalid approval field');only(f,['key','label','required','max','normalisation','pattern','group_size','group_count','display_last']);
    if(!code(f.key)||fields.has(f.key)||!text(f.label,160)||typeof f.required!=='boolean'||!Number.isInteger(f.max)||Number(f.max)<1||Number(f.max)>200||!['text','uppercase','digits','digit_groups'].includes(String(f.normalisation)))bad('Invalid approval field');fields.add(f.key);
    // Restricted fixed/bounded character-class patterns: no groups, backreferences,
    // alternatives or unbounded repetition supplied by service data.
    if(f.pattern!==undefined){if(typeof f.pattern!=='string'||f.pattern.length>160||!/^\^(?:\[[A-Za-z0-9 -]+\](?:\{[0-9]{1,3}(?:,[0-9]{1,3})?\})?|[A-Za-z0-9 -])+\$$/.test(f.pattern))bad('Unsupported bounded pattern');try{new RegExp(f.pattern);}catch{bad('Invalid bounded pattern');}}
    if(f.normalisation==='digit_groups'&&(!Number.isInteger(f.group_size)||Number(f.group_size)<1||Number(f.group_size)>8||!Number.isInteger(f.group_count)||Number(f.group_count)<1||Number(f.group_count)>8))bad('Invalid digit grouping');
    if(f.display_last!==undefined&&(!Number.isInteger(f.display_last)||Number(f.display_last)<1||Number(f.display_last)>8))bad('Invalid masking');
   }
  }
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
  const hydrateLegacy = async () => {
   for(const c of catalogue.capabilities) await tx.capability.updateMany({where:{serviceId,catalogueId:null,code:c.code,name:c.name,riskLevel:c.risk,requiresStepUp:c.requires_step_up,metadata:{equals:Prisma.DbNull}},data:{metadata:JSON.parse(JSON.stringify(c))}});
  };
  if(same){
   if(same.digest!==digest)throw new DomainError('VERSION_CONTENT_CONFLICT','Published versions cannot change',409);
   // An upgrade can materialise a publication created before this adapter existed.
   // Replaying the first version must also supply equivalent legacy presentation.
   const first=await tx.serviceCatalogue.findFirst({where:{serviceId},orderBy:{version:'asc'}});
   if(first?.id===same.id) await hydrateLegacy();
   return {row:same,replayed:true};
  }
  const latest=await tx.serviceCatalogue.findFirst({where:{serviceId},orderBy:{version:'desc'}});
  if(latest && catalogue.version<=latest.version)throw new DomainError('VERSION_NOT_INCREASING','New versions must increase',409);
  const row=await tx.serviceCatalogue.create({data:{serviceId,version:catalogue.version,digest,document:JSON.parse(JSON.stringify(catalogue))}});
  // First registration can supply presentation metadata to equivalent legacy
  // permissions without changing their IDs, name, risk or step-up requirement.
  if(!latest) await hydrateLegacy();
  await tx.capability.createMany({data:catalogue.capabilities.map((c,i)=>({serviceId,catalogueId:row.id,code:c.code,name:c.name,riskLevel:c.risk,requiresStepUp:c.requires_step_up,sortOrder:i,metadata:JSON.parse(JSON.stringify(c))}))});
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

/** New requests use the latest publication; historical grants keep their original IDs. */
export async function currentCapabilities(serviceId:string){
 const latest=await prisma.serviceCatalogue.findFirst({where:{serviceId},orderBy:{version:'desc'}});
 return prisma.capability.findMany({where:{serviceId,catalogueId:latest?.id??null},orderBy:{sortOrder:'asc'}});
}
