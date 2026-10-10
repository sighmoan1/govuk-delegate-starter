import assert from 'node:assert/strict';
async function main(){
 const base=process.env.WHENISBINS_URL??'http://127.0.0.1:5710';
 const health=await(await fetch(base+'/health')).json();assert.equal(health.mode,'fixture');
 const response=await fetch(base+'/ops/events',{headers:{'x-ops-key':process.env.WHENISBINS_OPS_KEY??'dev-whenisbins-ops-key'}});assert.equal(response.status,200);
 const events=(await response.json()).events as {action:string;stage:string;taskId?:string;occurrenceId?:string;outboundCallId?:string;decision?:string}[];
 const registration=events.filter(e=>e.action==='schedule'&&e.stage==='schedule_registered').at(-1);assert.ok(registration,'A persisted schedule must be recorded');assert.match(registration.taskId!,/^[0-9a-f-]{36}$/);
 const occurrences=events.filter(e=>e.action==='schedule'&&e.stage==='scheduled_occurrence'&&e.taskId===registration.taskId);assert.equal(new Set(occurrences.map(e=>e.occurrenceId)).size,3,'Two successful occurrences and one revoked occurrence are separately evidenced');
 for(const e of occurrences)assert.match(e.occurrenceId!,new RegExp('^'+registration.taskId+':\\d{4}-\\d{2}-\\d{2}$'));
 const lookups=events.filter(e=>e.action==='lookup'&&e.taskId===registration.taskId);assert.equal(new Set(lookups.filter(e=>e.stage==='lookup_completed').map(e=>e.occurrenceId)).size,2,'Completed provider results have their actual occurrence IDs');
 const revoked=occurrences.at(-1)!.occurrenceId;
 const refused=lookups.filter(e=>e.occurrenceId===revoked&&e.decision==='REFUSED');assert.ok(refused.length,'The revoked scheduled lookup has trusted occurrence correlation');assert.equal(refused.filter(e=>e.outboundCallId).length,0,'Revoked scheduled execution performs no provider call');
 console.log('PASS trusted schedule evidence: one registered job, three distinct occurrences, two completed lookups, one correlated refusal with zero provider calls.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
