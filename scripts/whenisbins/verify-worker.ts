import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import catalogue from '../../apps/whenisbins/service-catalogue.json';
import {main as cli} from '../../packages/whenisbins-runner/src/cli';
import {FileJobStore,type Agreement,type Job} from '../../packages/whenisbins-runner/src/index';

async function main(){
 if(process.env.WHENISBINS_TEST_ISOLATED!=='true'||!process.env.DATABASE_URL)throw Error('Explicit isolated test configuration required');
 const base=process.env.WHENISBINS_URL??'http://127.0.0.1:5710',delegateUrl=process.env.DELEGATE_URL??'http://localhost:5700';
 assert.equal((await(await fetch(base+'/health')).json()).mode,'fixture','Worker verification must never contact a live provider');
 const {prisma}=await import('../../apps/delegate/src/lib/db');const {hashSecret}=await import('../../apps/delegate/src/lib/secrets');const {approveRequest}=await import('../../apps/delegate/src/lib/requests');
 const dir=await mkdtemp(join(tmpdir(),'whenisbins-worker-acceptance-'));const path=join(dir,'private-jobs.json'),agreementPath=join(dir,'private-agreement.json');
 const reference='WORKER_TEST_SECRET_'+randomUUID().replace(/-/g,'').toUpperCase(),secret=randomUUID(),clientId='worker-http-test-'+randomUUID();
 const previous=new Map<string,string|undefined>();for(const key of [reference,'WHENISBINS_AGENT_CLIENT_ID','WHENISBINS_CONNECTOR_URL','WHENISBINS_DELEGATE_URL','WHENISBINS_RUNNER_ALLOW_LIVE'])previous.set(key,process.env[key]);
 process.env[reference]=secret;process.env.WHENISBINS_AGENT_CLIENT_ID=clientId;process.env.WHENISBINS_CONNECTOR_URL=base;process.env.WHENISBINS_DELEGATE_URL=delegateUrl;delete process.env.WHENISBINS_RUNNER_ALLOW_LIVE;
 try {
  const sam=await prisma.principal.findUniqueOrThrow({where:{oneLoginSubjectId:'urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw='}});
  const agent=await prisma.delegate.create({data:{name:'Synthetic CLI worker verification agent',provider:'isolated acceptance fixture',type:'SOFTWARE_AGENT',clientId,clientSecretHash:hashSecret(secret),redirectUris:[]}});
  const signed=await fetch(delegateUrl+'/api/agent/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:secret})});assert.equal(signed.status,200);const token=(await signed.json()).access_token;
  const requested=await fetch(delegateUrl+'/api/authorisation-requests',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({service:catalogue.service,catalogue_version:catalogue.version,capabilities:['read_collection_dates'],constraints:{read_collection_dates:{property_id:['home-sam']}}})});assert.equal(requested.status,201);const request=await requested.json();const grant=await approveRequest(request.id,sam.id);
  const now=Date.now(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const agreement:Agreement={principalId:sam.id,agentId:agent.id,propertyId:'home-sam',grantReference:grant.id,credentialEnv:reference,frequency:'daily',hour:Number(parts.hour),minute:Number(parts.minute),timezone:'Europe/London',startsAt:new Date(now-86400000).toISOString(),endsAt:new Date(now+86400000).toISOString(),agreed:true};
  await writeFile(agreementPath,JSON.stringify(agreement),{mode:0o600});const job=await cli(['create',path,agreementPath]) as Job;
  const results=await cli(['tick',path]) as Job['executions'];assert.equal(results.length,1);assert.equal(results[0].outcome?.kind,'completed');
  const store=new FileJobStore(path);assert.equal((await store.list()).find(j=>j.id===job.id)?.executions[0].outcome?.kind,'completed');
  let serialized=await readFile(path,'utf8');assert.ok(!serialized.includes(secret)&&!serialized.includes(token),'Private credentials are never persisted in a job store');
  await prisma.authorisation.update({where:{id:grant.id},data:{status:'REVOKED',revokedAt:new Date()}});
  const events=async()=>{const r=await fetch(base+'/ops/events',{headers:{'x-ops-key':process.env.WHENISBINS_OPS_KEY??'dev-whenisbins-ops-key'}});assert.equal(r.status,200);return (await r.json()).events as any[];};const before=await events();
  const revokedJob=await cli(['create',path,agreementPath]) as Job;const refused=await cli(['tick',path]) as Job['executions'];assert.equal(refused.length,1);assert.equal(refused[0].outcome?.kind,'refused');assert.equal(refused[0].outcome?.code,'AUTHORISATION_REVOKED');assert.equal((await store.list()).find(j=>j.id===revokedJob.id)?.state,'authority-refused');
  const after=await events();const ownedChecks=new Set((await prisma.activityEvent.findMany({where:{delegateId:agent.id},select:{id:true}})).map(e=>e.id));const attempt=after.slice(before.length).filter(e=>ownedChecks.has(e.delegateCheckId));assert.ok(attempt.length,'Revoked worker attempt records its own connector activity');assert.equal(attempt.filter(e=>e.outboundCallId).length,0,'Revoked worker execution creates no provider call');assert.ok(!JSON.stringify(after).includes(secret)&&!JSON.stringify(after).includes(token),'Private credentials are absent from connector activity');
  serialized=await readFile(path,'utf8');assert.ok(!serialized.includes(secret)&&!serialized.includes(token));
  console.log('PASS actual CLI-worker HTTP acceptance: ordinary-clock due lookup completed, owned-grant revocation refused, zero provider calls after refusal, credentials absent from persisted jobs.');
 }finally{for(const[key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}await prisma.$disconnect();await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
