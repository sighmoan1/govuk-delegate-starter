import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVerifiedTrace, sourcePage, importTrace, digest } from './import-e2.mjs';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const subject='synthetic';
const rows=[['view_claim_status','UNIQUE_OPERATION','read'],['claim_job_expenses','UNIQUE_OPERATION','write'],['claim_job_expenses','REPLAY','read'],['respond_to_query','UNIQUE_OPERATION','write'],['update_employment','AUTHORITY_REFUSAL','write'],['claim_job_expenses','AUTHORITY_REFUSAL','write']].map(([capability,outcomeClass,costClass],i)=>({id:randomUUID(),subject,capability,outcomeClass,costClass,reason:i===5?'AUTHORISATION_REVOKED':null,outcome:i>=4?'REFUSED':'ALLOWED',lane:'AUTHORISED_AGENT',timestamp:new Date(0).toISOString(),latencyMs:1}));
const record={model:'deterministic HTTP fixture, no model',status:'completed',checks:[{ok:true}],source_sha:'a'.repeat(40),seed:'42',finished_at:new Date(0).toISOString(),arm:'B',service_events:rows,state:[{subject,claims:[{kind:'job_expenses',reference:'claim'}],transactions:[{status:'COMPLETED',claimReference:'claim'}],queries:[{status:'ANSWERED',confirmedByPerson:true,receiptId:'receipt'}]}]};
test('actual trace bytes/digest and independent effect verification precede provenance attestation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'research-trace-'));const file=join(dir,'run.json');const bytes=JSON.stringify(record);writeFileSync(file,bytes);
 try {assert.equal(readVerifiedTrace(file,digest(bytes)).model,record.model);assert.throws(()=>readVerifiedTrace(file,'0'.repeat(64)),/TRACE_DIGEST_MISMATCH/);const bad=JSON.stringify({...record,state:[{...record.state[0],claims:[]}]});writeFileSync(file,bad);assert.throws(()=>readVerifiedTrace(file,digest(bad)),/INDEPENDENT_BUSINESS_STATE_INVALID/);}finally{rmSync(dir,{recursive:true});}
});
test('minimised archived feed snapshots omit provenance classes/subjects/research task labels',()=>{
 const page=sourcePage(record,'hmrc');assert.equal(page.events.length,6);const json=JSON.stringify(page);for(const label of ['SCRIPTED_AUTOMATION','synthetic','claim_job_expenses','execution_class'])assert.equal(json.includes(label),false);assert.equal(page.events[0].run_id.status,'missing');
});
test('deterministic scripted replay groups retries under one attempt and independently evidenced operation',async()=>{
 const calls=[];const api=async(path,body)=>{calls.push({path,body});return {id:randomUUID(),status:'OPEN',replayed:false};};
 const result=await importTrace(record,'b'.repeat(64),api,'observer');assert.equal(result.attempts,5);assert.equal(result.bindings,6);
 const bindings=calls.filter(c=>c.path==='/api/evaluation/bindings').map(c=>c.body);const first=bindings.find(b=>b.effect_class==='UNIQUE_OPERATION');const retry=bindings.find(b=>b.effect_class==='REPLAY');assert.equal(first.operation_id,retry.operation_id);assert.equal(first.effect_evidence_digest,'b'.repeat(64));
 assert.equal(calls.filter(c=>c.path.endsWith('/verify')).every(c=>c.body.execution_class==='SCRIPTED_AUTOMATION'),true);assert.equal(calls.at(-1).path.endsWith('/complete'),true);
});
