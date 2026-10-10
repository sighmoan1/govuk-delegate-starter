import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Page,WhenIsBinsEvent} from '../../packages/research-feed/src/index';
import {whenisbinsEvidence} from '../../apps/observatory/src/lib/whenisbins';
import {pullSource} from '../../apps/observatory/src/lib/ingestion';
import {ingestStore} from '../../apps/observatory/src/lib/ingest-store';
import {prisma} from '../../apps/observatory/src/lib/db';
import {createRun,createAttempt,bindEvent} from '../../apps/observatory/src/lib/research-store';
import {publicEnvValues} from '../public-whenisbins.mjs';

// Requires explicit operator intent. Reads our connector only; never contacts WhenIsBins.
// Never reset/reseed. The isolated Observatory DB may also retain earlier fixture evidence.
let step='explicit live source and isolated database configuration';
async function main(){
 assert.equal(process.env.WHENISBINS_LIVE_SOURCE_ACCEPTANCE,'true');
 const database=new URL(process.env.DATABASE_URL!);
 assert(['127.0.0.1','localhost'].includes(database.hostname)&&database.port==='55435'&&database.pathname==='/observatory','Only isolated Observatory port 55435 is permitted');
 assert.notEqual(process.env.PUBLIC_MODE,'true');
 assert.equal(process.env.RESEARCH_INGEST_ENABLED,'true');
 const envFile=process.env.WHENISBINS_LIVE_PUBLIC_ENV_FILE;
 assert(envFile,'Retained public deployment environment file is required');
 const liveEnv=publicEnvValues(await readFile(envFile,'utf8'));
 assert.equal(liveEnv.PUBLIC_MODE,'true');assert.equal(liveEnv.WHENISBINS_MODE,'live');assert.equal(liveEnv.WHENISBINS_LIVE_ENABLED,'true');assert.equal(liveEnv.WHENISBINS_RESEARCH_FEED_ENABLED,'true');
 const key=liveEnv.WHENISBINS_RESEARCH_FEED_KEY;assert(key&&key.length>=32);
 const feed=process.env.WHENISBINS_LIVE_FEED_URL;assert(feed);
 const feedURL=new URL(feed);assert.equal(feedURL.origin,'http://127.0.0.1:3311');assert.equal(feedURL.pathname,'/api/research/events');assert.equal(feedURL.search,'');
 const mainURL='http://127.0.0.1:3310';
 const ui=process.env.OBSERVATORY_UI_URL;assert(ui);assert.equal(new URL(ui).origin,'http://127.0.0.1:5703');
 const collectionKey=process.env.OBSERVATORY_COLLECTION_KEY;assert(collectionKey&&collectionKey.length>=32);
 const source='whenisbins_connector' as const;
 step='live runtime and protected feed boundary';
 const health=await fetch(mainURL+'/health');assert.equal(health.status,200);assert.equal((await health.json()).mode,'live');
 for(const path of ['/api/research/events','/ops/events','/demo/journeys'])assert.equal((await fetch(mainURL+path)).status,404);
 assert.equal((await fetch(feed)).status,403);
 assert.equal((await fetch(feed,{headers:{Authorization:'Bearer deliberately-invalid-key'}})).status,403);
 assert.equal((await fetch(feed,{method:'POST',headers:{Authorization:'Bearer '+key}})).status,405);
 assert.equal((await fetch('http://127.0.0.1:3311/ops/events',{headers:{Authorization:'Bearer '+key}})).status,404);
 step='capture actual live source evidence';
 const captured=[] as ReturnType<typeof WhenIsBinsEvent.parse>[];let cursor:string|null=null;
 for(let pageNo=0;pageNo<50;pageNo++){
  const url=new URL(feed);url.searchParams.set('limit','200');if(cursor)url.searchParams.set('cursor',cursor);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);
  const page=Page.parse(await response.json());assert.equal(page.schema_version,2);assert.equal(page.source_service,source);
  captured.push(...page.events.map(e=>WhenIsBinsEvent.parse(e)));cursor=page.next_cursor;if(!cursor)break;
 }
 assert.equal(cursor,null,'Bounded live capture must reach EOF');assert(captured.length,'Run an actual public journey before acceptance');
 const ids=captured.map(e=>e.source_event_id);assert.equal(new Set(ids).size,ids.length);
 const privateDir=resolve(resolve(envFile,'..'),liveEnv.WHENISBINS_PRIVATE_CONFIG_DIR);
 const rawProperties=JSON.parse(await readFile(resolve(privateDir,'properties.json'),'utf8')) as Array<Record<string,unknown>>;
 const rawMailboxes=JSON.parse(await readFile(resolve(privateDir,'mailboxes.json'),'utf8')) as Array<Record<string,unknown>>;
 const forbidden=[key,liveEnv.WHENISBINS_SERVICE_KEY,liveEnv.WHENISBINS_AGENT_CLIENT_SECRET,liveEnv.WHENISBINS_RESEARCH_PSEUDONYM_KEY,...rawProperties.flatMap(p=>[p.id,p.address,p.postcode,p.propertyId]),...rawMailboxes.flatMap(m=>[m.id,m.email])].filter((x):x is string=>typeof x==='string'&&x.length>3);
 for(const event of captured){
  const encoded=JSON.stringify(event);assert(!/@|https?:\/\/|stop_link|access_token|execution_class|ground_truth|email_address/.test(encoded));
  for(const value of forbidden)assert(!encoded.includes(value),'Raw private configuration in feed');
  assert.equal(event.browser_sensor.status,'not_run');assert.equal(event.browser_sensor.provenance,'not_collected');
  for(const value of [...Object.values(event.correlation),event.whenisbins.task_id,event.whenisbins.occurrence_id,event.whenisbins.outbound_call_id,event.whenisbins.effect_id])if(value.value!==null){assert.match(value.value,/^[0-9a-f]{64}$/);assert.equal(value.provenance,'pseudonymised');}
 }
 step='recorded real scheduled-request correlations';
 const registrations=captured.filter(e=>e.whenisbins.action==='schedule'&&e.whenisbins.stage==='schedule_registered');
 const registeredTasks=new Set(registrations.map(e=>e.whenisbins.task_id.value).filter(Boolean));assert(registeredTasks.size>=2,'Actual completed and revoked schedules require separate recorded tasks');
 const occurrences=captured.filter(e=>e.whenisbins.action==='schedule'&&e.whenisbins.stage==='scheduled_occurrence');
 const scheduledCompletions=captured.filter(e=>e.whenisbins.action==='lookup'&&e.whenisbins.stage==='lookup_completed'&&e.whenisbins.occurrence_id.value&&registeredTasks.has(e.whenisbins.task_id.value));assert(scheduledCompletions.length,'Need a recorded scheduled lookup completion');
 for(const completion of scheduledCompletions){
  const admitted=captured.find(e=>e.whenisbins.action==='lookup'&&e.whenisbins.stage==='admitted'&&e.correlation.request_id.value===completion.correlation.request_id.value);assert(admitted);
  assert.equal(admitted.whenisbins.task_id.value,completion.whenisbins.task_id.value);assert.equal(admitted.whenisbins.occurrence_id.value,completion.whenisbins.occurrence_id.value);assert.equal(admitted.correlation.delegate_check_id.value,completion.correlation.delegate_check_id.value);assert(completion.whenisbins.outbound_call_id.value);assert.equal(admitted.whenisbins.outbound_call_id.value,completion.whenisbins.outbound_call_id.value);
  assert(occurrences.some(e=>e.whenisbins.task_id.value===completion.whenisbins.task_id.value&&e.whenisbins.occurrence_id.value===completion.whenisbins.occurrence_id.value));
 }
 const scheduledRefusals=captured.filter(e=>e.whenisbins.action==='lookup'&&e.whenisbins.stage==='refused'&&e.outcome.decision==='REFUSED'&&e.whenisbins.occurrence_id.value&&registeredTasks.has(e.whenisbins.task_id.value));assert(scheduledRefusals.length,'Need a source-recorded scheduled refusal');
 for(const refusal of scheduledRefusals){assert.equal(refusal.whenisbins.outbound_call_id.value,null);assert.equal(refusal.whenisbins.effect_id.value,null);assert(refusal.correlation.delegate_check_id.value);assert(occurrences.some(e=>e.whenisbins.task_id.value===refusal.whenisbins.task_id.value&&e.whenisbins.occurrence_id.value===refusal.whenisbins.occurrence_id.value));}
 assert(captured.some(e=>e.whenisbins.action==='email_signup'&&e.whenisbins.stage==='subscription_confirmed'),'Need a source-recorded signup confirmation');
 assert(scheduledCompletions.some(completion=>scheduledRefusals.some(refusal=>completion.whenisbins.task_id.value!==refusal.whenisbins.task_id.value)),'Completed and refused acceptance cases require distinct registered tasks');
 const scheduledEvidence={registered_tasks:registeredTasks.size,correlated_completions:scheduledCompletions.map(e=>({occurred_at:e.occurred_at.value,task_id:e.whenisbins.task_id.value,occurrence_id:e.whenisbins.occurrence_id.value})),correlated_refusals:scheduledRefusals.map(e=>({occurred_at:e.occurred_at.value,task_id:e.whenisbins.task_id.value,occurrence_id:e.whenisbins.occurrence_id.value,outbound_call_id:e.whenisbins.outbound_call_id.value,effect_id:e.whenisbins.effect_id.value})),limitation:'Source clock and refusal observations; refusal reason/outcome class are not exported. Independent root journey evidence establishes ordinary-clock execution and revocation. No execution-class or upstream-effect truth is derived.'};
 step='persist actual source into isolated PostgreSQL';
 const before=await prisma.observedEvent.count({where:{sourceService:source,sourceEventId:{in:ids}}});
 const input={source,url:feed,key,store:ingestStore};const first=await pullSource(input);assert(first.complete);
 const rows=await prisma.observedEvent.findMany({where:{sourceService:source,sourceEventId:{in:ids}},select:{sourceEventId:true,snapshot:true}});assert.equal(rows.length,ids.length);
 for(const row of rows)assert.equal(WhenIsBinsEvent.parse(row.snapshot).source_event_id,row.sourceEventId);
 step='database connection restart and captured-source deduplication';
 const committedCursor=await ingestStore.cursor(source);await prisma.$disconnect();assert.deepEqual(await ingestStore.cursor(source),committedCursor);
 assert.equal(await prisma.observedEvent.count({where:{sourceService:source,sourceEventId:{in:ids}}}),ids.length);
 const frozen=Page.parse({schema_version:2,source_service:source,events:captured,next_cursor:null});
 const replay=await pullSource({...input,fetcher:(async()=>Response.json(frozen)) as typeof fetch});assert.equal(replay.inserted,0);
 const retainedCursor=await ingestStore.cursor(source);await assert.rejects(pullSource({...input,key:'deliberately-invalid-key'}),/SOURCE_UNAVAILABLE/);assert.deepEqual(await ingestStore.cursor(source),retainedCursor);
 step='protected private view and separated execution truth';
 assert.equal((await fetch(ui+'/api/monitoring/whenisbins')).status,401);
 const view=await fetch(ui+'/api/monitoring/whenisbins',{headers:{'x-collection-key':collectionKey}});assert.equal(view.status,200);const report=await view.json();
 assert.equal(report.source,source);assert(report.events.every((e:{source_service:string})=>e.source_service===source));
 const viewIDs=new Set(report.events.map((e:{source_event_id:string})=>e.source_event_id));for(const id of ids)assert(viewIDs.has(id),'Captured live event outside protected view');
 assert(!/execution_class|UNLABELLED/.test(JSON.stringify(report)));
 const already=await prisma.researchBinding.findMany({where:{sourceService:source,sourceEventId:{in:ids}},select:{sourceEventId:true}});const boundIDs=new Set(already.map(x=>x.sourceEventId));const bindID=ids.find(id=>!boundIDs.has(id));assert(bindID,'Need a previously unbound live source event');
 const run=await createRun({mode:'MONITORING',protocol_version:'whenisbins-live-source-acceptance-v1',source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),seed:randomUUID(),study_owner:'live-source-isolated-observatory-verifier'});
 const attempt=await createAttempt({run_id:run.id});assert.equal(attempt.status,'UNLABELLED');
 const binding=await bindEvent({attempt_id:attempt.id,source_service:source,source_event_id:bindID,effect_class:'REQUEST_ONLY'});assert.equal(binding.effectClass,'REQUEST_ONLY');
 assert.equal((await bindEvent({attempt_id:attempt.id,source_service:source,source_event_id:bindID,effect_class:'REQUEST_ONLY'})).id,binding.id);
 await assert.rejects(bindEvent({attempt_id:attempt.id,source_service:source,source_event_id:bindID,effect_class:'UNIQUE_OPERATION',operation_id:randomUUID()}),/SOURCE_EFFECT_CLASS_MISMATCH/);
 assert.equal((await prisma.researchAttempt.findUniqueOrThrow({where:{id:attempt.id}})).executionClass,null);assert(!JSON.stringify(report).includes(run.id));
 const live=whenisbinsEvidence(captured);
 console.log(JSON.stringify({passed:true,verified_at:new Date().toISOString(),runtime_mode:'live',source_endpoint_port:3311,isolated_observatory_db_port:55435,captured_time_range:{first:captured[0].occurred_at.value,last:captured.at(-1)!.occurred_at.value},live_source_counts:live.counts,live_source_stages:live.stages,scheduled_evidence:scheduledEvidence,cancellation_confirmation_observed:captured.some(e=>e.whenisbins.stage==='cancellation_confirmed'),new_rows_among_captured:ids.length-before,actual_pull_inserted:first.inserted,frozen_replay_inserted:replay.inserted,sql_restart_retained:true,authentication_failure_cursor_retained:true,protected_view_contains_live_capture:true,monitoring_execution_truth_absent:true,exact_unlabelled_request_only_binding:true,correlation_examples:captured.filter((e,i,a)=>a.findIndex(x=>x.whenisbins.stage===e.whenisbins.stage)===i).map(e=>({stage:e.whenisbins.stage,source_event_id:e.source_event_id,request_id:e.correlation.request_id.value,delegate_check_id:e.correlation.delegate_check_id.value,outbound_call_id:e.whenisbins.outbound_call_id.value,effect_id:e.whenisbins.effect_id.value})),limitation:'Actual deployed live-mode connector observations only. Pre-existing fixture rows are excluded from live-source counts. No observation of other WhenIsBins visitors, independent upstream effects, AI classification accuracy or reminder delivery is inferred.'},null,2));
}
main().catch(error=>{console.error(JSON.stringify({passed:false,step,error_type:error instanceof Error?error.name:'unknown',limitation:'No reset/reseed or upstream request performed; private error withheld.'}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
