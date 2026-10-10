import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import catalogue from '../service-catalogue.json';
import {type Store,type Event,type Operation} from './store';
import {type Provider,type Property,ProviderFailure} from './provider';
export const SERVICE='whenisbins-connector';
export const CAPABILITY='read_collection_dates';
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(v);
export const catalogueDigest=createHash('sha256').update(canonical(catalogue)).digest('hex');
export type Config={delegateUrl:string;serviceKey:string;properties:Property[];store:Store;provider:Provider;opsKey:string;catalogue?:typeof catalogue;publicMode?:boolean;now?:()=>number};
const json=(b:unknown,status=200,headers:Record<string,string>={})=>Response.json(b,{status,headers:{'cache-control':'private, no-store',...headers}});
const secret=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return !!b&&x.length===y.length&&timingSafeEqual(x,y);};
export function connectorHandler(config:Config,transport:typeof fetch=fetch){
 const supported=config.catalogue??catalogue;const service=supported.service;const supportedDigest=createHash('sha256').update(canonical(supported)).digest('hex');
 const permittedIds=supported.capabilities.find(c=>c.code===CAPABILITY)?.supported_constraints?.property_id?.values??[];
 const post=async(path:string,body:unknown)=>{const r=await transport(config.delegateUrl+path,{method:'POST',headers:{'content-type':'application/json','x-service-key':config.serviceKey},body:JSON.stringify({service,...body as object}),signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('DELEGATE_UNAVAILABLE');return r.json();};
 const log=async(event:Event)=>{await config.store.transaction(s=>{s.events.push(event);});};
 return async(req:Request):Promise<Response>=>{
  const url=new URL(req.url);
  if(url.pathname==='/health'&&req.method==='GET')return json({service:SERVICE,mode:config.provider.mode,delegate_enforced_by:'our_connector',native_whenisbins_integration:false});
  if(url.pathname==='/ops/events'&&req.method==='GET'){if(config.publicMode||!secret(req.headers.get('x-ops-key')??'',config.opsKey))return json({error:'FORBIDDEN'},403);return json({events:(await config.store.snapshot()).events});}
  if(url.pathname!=='/api/collections')return json({error:'NOT_FOUND'},404);
  const now=config.now??Date.now;const started=now(),requestId=randomUUID(),event:Event={sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId,action:'lookup',stage:'refused',decision:'REFUSED',costClass:'read'};
  let check:any;let operationKey:string|undefined;
  const finish=async(b:unknown,status:number)=>{event.latencyMs=Date.now()-started;await log(event);return json(b,status);};
  try{
   if(req.method!=='POST')return finish({reason:'METHOD_NOT_ALLOWED'},405);
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1],principal=req.headers.get('x-principal-id');
   if(!token||!principal)return finish({decision:'DENY',reason:'AGENT_IDENTITY_REQUIRED'},401);
   const raw=await req.text();if(raw.length>4096)return finish({reason:'INVALID_REQUEST'},400);
   let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return finish({reason:'INVALID_REQUEST'},400);}
   if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['property_id','occurrence_id','task_id'].includes(k))||typeof body.property_id!=='string'||[body.occurrence_id,body.task_id].some(v=>v!==undefined&&(typeof v!=='string'||!/^[-0-9a-f]{36}$/i.test(v))))return finish({reason:'INVALID_REQUEST'},400);
   // Caller tags are not trusted task or occurrence identity. Backend operation keys supply correlation.

   check=await post('/api/authorisations/check',{agent_token:token,principal_id:principal,capability:CAPABILITY,catalogue_version:supported.version});
   if(typeof check.check_id!=='string')throw Error('DELEGATE_UNAVAILABLE');event.delegateCheckId=check.check_id;
   if(!check.authorised)return finish({decision:'DENY',reason:check.reason,delegate_check_id:check.check_id},403);
   const resource=config.properties.find(p=>p.id===body.property_id&&p.subject===check.subject);
   const restrictions=check.constraints?.[CAPABILITY],provenance=check.constraint_provenance;
   const keys=restrictions?Object.keys(restrictions):[];
   if(!resource||keys.length!==1||keys[0]!=='property_id'||!Array.isArray(restrictions.property_id)||!restrictions.property_id.includes(resource.id)||restrictions.property_id.some((v:unknown)=>!permittedIds.includes(String(v)))||provenance?.catalogue?.digest!==supportedDigest||provenance?.catalogue?.version!==supported.version||provenance?.mandate_id!==check.authorisation_id||provenance?.delegation_id!==check.chain?.delegation_id)return finish({decision:'DENY',reason:'PROPERTY_SCOPE_REFUSED',delegate_check_id:check.check_id},403);
   const key=req.headers.get('idempotency-key');if(!key||!/^[A-Za-z0-9_-]{8,128}$/.test(key))return finish({reason:'IDEMPOTENCY_KEY_REQUIRED'},400);
   operationKey=createHash('sha256').update(principal+':'+check.delegate.id+':'+key).digest('hex');
   const digest=createHash('sha256').update(canonical({property_id:body.property_id})).digest('hex');
   let replay=false,busy=false;
   let op=await config.store.transaction(s=>{const prior=s.operations[operationKey!];if(prior){if(prior.digest!==digest)throw Error('IDEMPOTENCY_CONFLICT');replay=prior.state==='done';busy=prior.state!=='done'&&((prior.leaseUntil??0)>now()||(prior.nextPollAt??0)>now());if(!busy&&!replay)prior.leaseUntil=now()+60000;return structuredClone(prior);}const fresh:Operation={owner:principal,property:resource.id,digest,key:operationKey!,state:'pending',leaseUntil:now()+60000};s.operations[operationKey!]=fresh;return fresh;});
   event.taskId=operationKey; // internal only; research projection pseudonymises this identifier.
   if(busy){event.stage='admitted';event.decision='ALLOWED';return finish({decision:'ALLOW',result:op.result??{status:'queued'},retry_after_seconds:Math.max(5,Math.ceil(((op.nextPollAt??op.leaseUntil??now())-now())/1000)),delegate_check_id:check.check_id,mode:config.provider.mode},202);}
   if(op.state!=='done'){
    event.outboundCallId=randomUUID();event.upstreamAgentDeclared=config.provider.declaresAgent;
    await log({...event,sourceEventId:randomUUID(),stage:'admitted',decision:'ALLOWED'});
    let lookup;
    const prior=(await config.store.snapshot()).operations;
    const saved=Object.values(prior).reverse().find(x=>x!==op&&x.owner===principal&&x.property===resource.id&&x.state==='done'&&x.result?.status==='done'&&(x.result.result as any)?.property_id);
    if(!op.lookupId&&saved&&config.provider.stored){
     try{const stored=await config.provider.stored(String((saved.result!.result as any).property_id),saved.etag);lookup={status:'done' as const,lookup_id:saved.lookupId!,result:stored.unchanged?saved.result!.result as Record<string,unknown>:stored.result};op.etag=stored.etag;op.effectId=saved.effectId;}catch(e){if(!(e instanceof ProviderFailure)||e.status!==404)throw e;}
    }
    lookup??=op.lookupId?await config.provider.poll(op.lookupId):await config.provider.submit(resource,op.key);
    op.leaseUntil=undefined;op.nextPollAt=now()+Math.max(5,lookup.retry_after_seconds??5)*1000;op.lookupId=lookup.lookup_id;op.result={...lookup};op.state=['done','failed'].includes(lookup.status)?'done':'pending';if(lookup.status==='done')op.effectId??=randomUUID();
    await config.store.transaction(s=>{s.operations[operationKey!]=op;});
   }
   const state=String(op.result?.status??'queued');
   event.effectId=op.effectId;event.decision=state==='failed'?'REFUSED':'ALLOWED';event.stage=replay?'replay':state==='done'?'lookup_completed':state==='failed'?'refused':'admitted';event.outcomeClass=replay?'REPLAY':state==='done'?'UNIQUE_OPERATION':state==='failed'?'BUSINESS_REFUSAL':undefined;
   // Local durable result is authoritative even if Delegate outcome reporting is temporarily unavailable.
   let reported=false;try{await post('/api/outcomes',{check_id:check.check_id,status:state==='done'?'COMPLETED':state==='failed'?'FAILED':'SUBMITTED',reference:op.effectId,idempotency_key:operationKey+':'+state});reported=true;}catch{}
   const status=state==='done'?200:state==='failed'?422:202;
   return finish({decision:state==='failed'?'DENY':'ALLOW',delegate_check_id:check.check_id,result:op.result,replayed:replay,outcome_reported:reported,mode:config.provider.mode},status);
  }catch(e){
   const message=e instanceof Error?e.message:'UNAVAILABLE';
   if(operationKey)await config.store.transaction(s=>{if(s.operations[operationKey!])s.operations[operationKey!].leaseUntil=undefined;}).catch(()=>{});
   if(message==='IDEMPOTENCY_CONFLICT')return finish({reason:message},409);
   event.stage=message==='DELEGATE_UNAVAILABLE'?'refused':'provider_unavailable';event.outcomeClass='UNAVAILABLE';
   if(e instanceof ProviderFailure)return finish({decision:'DENY',reason:'PROVIDER_UNAVAILABLE',retry_after_seconds:e.retryAfter,provider_status:e.status},e.status===429?429:503);
   return finish({decision:'DENY',reason:['DELEGATE_UNAVAILABLE','STORE_BUSY','EXACT_ADDRESS_SELECTION_REQUIRED','UNSUPPORTED_COUNCIL_INPUT'].includes(message)?message:'SERVICE_UNAVAILABLE'},503);
  }
 };
}
