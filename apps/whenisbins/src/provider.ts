import {randomUUID} from 'node:crypto';
export type Property={id:string;subject:string;label:string;postcode:string;address:string;propertyId?:string};
export type Lookup={status:'queued'|'running'|'partial'|'done'|'failed';lookup_id:string;result?:Record<string,unknown>;retry_after_seconds?:number};
export interface Provider {mode:'fixture'|'live';declaresAgent:boolean; submit(property:Property,key:string):Promise<Lookup>;poll(id:string):Promise<Lookup>;stored?(id:string,etag?:string):Promise<{result?:Record<string,unknown>;etag?:string;unchanged?:boolean}>}
export class ProviderFailure extends Error {constructor(readonly status:number,readonly retryAfter:number=30){super('PROVIDER_UNAVAILABLE');}}
export class FixtureProvider implements Provider {
 mode='fixture' as const;declaresAgent=false;calls=0;jobs=new Map<string,Lookup>();byKey=new Map<string,string>();scenario:'done'|'queued'|'partial'|'failed'|'unavailable'='done';
 async submit(p:Property,key:string){this.calls++;if(this.scenario==='unavailable')throw new ProviderFailure(503);
  const previous=this.byKey.get(key);if(previous)return this.jobs.get(previous)!;
  const id=randomUUID();const job:Lookup={status:this.scenario,lookup_id:id,result:{property_id:'p:'+p.id,collections:[{name:'Recycling',dates:['2026-10-14'],dates_complete:true}],by_date:[{date:'2026-10-14',weekday:'Wednesday',collections:['Recycling']}],date_confidence:'synthetic_fixture',date_completeness:'one_fixture_date',retrieved_at:'2026-10-10T00:00:00Z',source_url:'https://council.example/synthetic-bins',provisional:false},retry_after_seconds:5};this.byKey.set(key,id);this.jobs.set(id,job);return job;
 }
 async poll(id:string){this.calls++;const job=this.jobs.get(id);if(!job)throw new ProviderFailure(404);return {...job,status:job.status==='queued'?'done':job.status};}
}
export class LiveProvider implements Provider {
 mode='live' as const;declaresAgent=true;private base='https://whenisbins.com/v1';
 constructor(private enabled:boolean,private token?:string,private transport:typeof fetch=fetch){if(!enabled)throw Error('LIVE_MODE_NOT_ENABLED');}
 private async call(path:string,init:RequestInit={}):Promise<Response>{if(!/^\/(addresses|lookups|schedules)(\/|\?|$)/.test(path))throw Error('INVALID_PROVIDER_ROUTE');
  const r=await this.transport(this.base+path,{...init,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','X-Agent':'Delegate-WhenIsBins-connector',...(this.token?{Authorization:'Bearer '+this.token}:{}),...init.headers}});
  if(!r.ok&&r.status!==304)throw new ProviderFailure(r.status,Math.max(5,Number(r.headers.get('retry-after'))||30));return r;}
 async submit(p:Property,key:string):Promise<Lookup>{
  const discovery=await (await this.call('/addresses?postcode='+encodeURIComponent(p.postcode))).json();
  if(!['none','property','property_id'].includes(discovery.required_input))throw Error('UNSUPPORTED_COUNCIL_INPUT');
  const candidate=Array.isArray(discovery.candidates)?discovery.candidates.find((c:Record<string,unknown>)=>p.propertyId?c.property_id===p.propertyId:(c.label===p.address||c.address===p.address)):null;
  if(discovery.required_input==='property_id'&&!candidate)throw Error('EXACT_ADDRESS_SELECTION_REQUIRED');
  const required=discovery.required_input;
  const payload=required==='property_id'?{postcode:p.postcode,property_id:candidate.property_id}:{postcode:p.postcode,property:p.address};
  return this.parse(await this.call('/lookups',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(payload)}));
 }
 private async parse(r:Response):Promise<Lookup>{const b=await r.json();if(typeof b.id!=='string'||!['queued','running','partial','done','failed'].includes(b.status))throw Error('INVALID_PROVIDER_RESPONSE');return {status:b.status,lookup_id:b.id,...(b.result?{result:b.result}:{}),retry_after_seconds:Math.max(5,Number(r.headers.get('retry-after'))||5)};}
 async poll(id:string){return this.parse(await this.call('/lookups/'+encodeURIComponent(id)));}
 async stored(id:string,etag?:string){const r=await this.call('/schedules/'+encodeURIComponent(id.replace(/^p:/,'')),{headers:etag?{'If-None-Match':etag}:{}});if(r.status===304)return {unchanged:true,etag};return {result:await r.json(),etag:r.headers.get('etag')??undefined};}
}
