import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJobStore, Runner, latestOccurrence, type Agreement, type Outcome } from "../src/index";
import { connectorLookup } from "../src/http";
import { main } from "../src/cli";
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "bins-runner-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const agreement: Agreement = { principalId: "sam", agentId: "assistant", propertyId: "home-sam", grantReference: "relationship-id", credentialEnv: "AGENT_TOKEN", frequency: "daily", hour: 8, minute: 0, timezone: "Europe/London", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z", agreed: true };
const good: Outcome = { kind: "completed", providerCalls: 1 };
it("survives restart, deduplicates ticks, checks new authority and stops after revocation", async () => {
 let now = Date.parse("2026-10-10T07:00:00Z"), revoked = false, calls = 0; const keys: string[] = [];
 const lookup = async (request: any) => { keys.push(request.idempotencyKey); if (revoked) return {kind:"refused",code:"AUTHORISATION_REVOKED",providerCalls:0} as Outcome; calls++; return good; };
 const path = join(dir,"jobs.json"); const runner = new Runner(new FileJobStore(path),lookup,()=>now); const job = await runner.create(agreement);
 expect((await runner.tick())[0].outcome?.kind).toBe("completed"); expect(await runner.tick()).toEqual([]);
 now += 86400000; revoked = true; const restarted = new Runner(new FileJobStore(path),lookup,()=>now);
 expect((await restarted.tick())[0].outcome?.kind).toBe("refused"); now += 86400000; expect(await restarted.tick()).toEqual([]); expect(calls).toBe(1); expect(keys[0]).not.toBe(keys[1]);
 expect((await restarted.store.list())[0].state).toBe("authority-refused"); expect((await stat(path)).mode & 0o777).toBe(0o600); expect(await readFile(path,"utf8")).not.toContain("Bearer");
});
it("excludes concurrent workers while request is outstanding",async()=>{
 let release!:()=>void; const gate = new Promise<void>(r=>release=r); let calls=0; const store=new FileJobStore(join(dir,"jobs")); const runner=new Runner(store,async()=>{calls++; await gate; return good;},()=>Date.parse("2026-10-10T07:00Z")); await runner.create(agreement);
 const first=runner.tick(); await new Promise(r=>setTimeout(r,50)); expect(await new Runner(new FileJobStore(store.path),async()=>{calls++; return good;},runner.clock).tick()).toEqual([]); release(); await first; expect(calls).toBe(1);
});
it("recovers a crashed occurrence lease using the same idempotency key and bounds retries",async()=>{
 let now=Date.parse("2026-10-10T07:00Z"); const store=new FileJobStore(join(dir,"jobs")); const keys:string[]=[]; const runner=new Runner(store,async r=>{keys.push(r.idempotencyKey); return {kind:"unavailable",providerCalls:0};},()=>now); const job=await runner.create(agreement);
 await store.transaction(s=>s.jobs[0].executions.push({id:`${job.id}:2026-10-10`,dueAt:new Date(now).toISOString(),attempt:1,state:"running",leaseUntil:new Date(now+120000).toISOString()}));
 expect(await runner.tick()).toEqual([]); now+=120001; await runner.tick(); now+=120000; await runner.tick(); now+=120000; expect(await runner.tick()).toEqual([]); expect(keys).toEqual([`${job.id}:2026-10-10`,`${job.id}:2026-10-10`]);
});
it("skips missed backlog and observes pause, resume, stop and finite end",async()=>{
 let now=Date.parse("2026-10-20T07:00Z"); let calls=0; const runner=new Runner(new FileJobStore(join(dir,"jobs")),async()=>{calls++;return good;},()=>now); const job=await runner.create(agreement);
 await runner.control(job.id,"pause"); expect(await runner.tick()).toEqual([]); await runner.control(job.id,"resume"); expect((await runner.tick())[0].dueAt).toBe("2026-10-20T07:00:00.000Z"); expect(calls).toBe(1); await runner.control(job.id,"stop"); now+=86400000; expect(await runner.tick()).toEqual([]);
 const second=await runner.create(agreement); now=Date.parse(agreement.endsAt); expect(await runner.tick()).toEqual([]); expect((await runner.store.list()).find(j=>j.id===second.id)?.state).toBe("ended"); await expect(runner.control(job.id,"resume")).rejects.toThrow();
});
it("uses London civil time: spring gap skips and autumn repeated hour runs once",()=>{
 const spring={...agreement,hour:1,minute:30,startsAt:"2026-03-28T00:00Z",endsAt:"2026-04-01T00:00Z"}; expect(latestOccurrence(spring,Date.parse("2026-03-29T03:00Z"))?.id).toBe("2026-03-28");
 const autumn={...agreement,hour:1,minute:30}; expect(latestOccurrence(autumn,Date.parse("2026-10-25T02:00Z"))?.dueAt).toBe("2026-10-25T00:30:00.000Z");
 const weekly={...agreement,frequency:"weekly" as const,weekday:1}; expect(latestOccurrence(weekly,Date.parse("2026-10-10T12:00Z"))?.id).toBe("2026-10-05");
});
it("rejects missing agreement and unlimited duration; CLI manages a persisted job without credentials",async()=>{
 const runner=new Runner(new FileJobStore(join(dir,"jobs")),async()=>good); expect(()=>runner.create({...agreement,agreed:false as any})).toThrow(); expect(()=>runner.create({...agreement,endsAt:"2028-01-01"})).toThrow();
 const file=join(dir,"agreement.json"),path=join(dir,"cli-jobs"); await writeFile(file,JSON.stringify(agreement)); const job=await main(["create",path,file]) as any; expect((await main(["list",path]) as any)[0].id).toBe(job.id); expect((await main(["stop",path,job.id]) as any).state).toBe("stopped");
});
describe("HTTP connector",()=>{
 it.each([[403,{},"refused"],[503,{},"unavailable"],[429,{},"unavailable"],[202,{result:{status:"queued"}},"pending"],[200,{result:{status:"partial"}},"unavailable"],[200,{result:{status:"done"}},"completed"]])("classifies %s %s",async(status,body,kind)=>{
 let sent:any; const lookup=connectorLookup("http://127.0.0.1:3307",async()=>"test-token",async(_url,init)=>{sent=init;return new Response(JSON.stringify(body),{status:status as number,headers:{"Retry-After":"5"}});}); const result=await lookup({...agreement,idempotencyKey:"occurrence"}); expect(result.kind).toBe(kind); expect(sent.headers["Idempotency-Key"]).toBe("occurrence"); expect(JSON.parse(sent.body)).toEqual({property_id:"home-sam",grant_reference:"relationship-id"});
 });
});
it("drops unsolicited secrets from agreement and injected provider outcomes",async()=>{
 const store=new FileJobStore(join(dir,"jobs")); const runner=new Runner(store,async()=>({...good,token:"DO_NOT_STORE",address:"DO_NOT_STORE"}),()=>Date.parse("2026-10-10T07:00Z")); await runner.create({...agreement,token:"DO_NOT_STORE"} as any); await runner.tick(); expect(await readFile(store.path,"utf8")).not.toContain("DO_NOT_STORE");
});
it("records an in-flight completion honestly when the user stops during the request",async()=>{
 let release!:()=>void; const gate=new Promise<void>(r=>release=r); const store=new FileJobStore(join(dir,"jobs")); const runner=new Runner(store,async()=>{await gate;return good;},()=>Date.parse("2026-10-10T07:00Z")); const job=await runner.create(agreement); const tick=runner.tick(); await new Promise(r=>setTimeout(r,50)); await runner.control(job.id,"stop"); release(); await tick; const saved=(await store.list())[0]; expect(saved.state).toBe("stopped"); expect(saved.executions[0].outcome?.kind).toBe("completed"); expect(await runner.tick()).toEqual([]);
});
it.each(["AUTHORISATION_EXPIRED","UNKNOWN_AGENT","RELATIONSHIP_MISSING","PROPERTY_SCOPE_MISMATCH","PERMISSION_MISSING"])("keeps connector refusal %s distinct and makes no cached allowed execution",async reason=>{
 let now=Date.parse("2026-10-10T07:00Z"),checks=0; const runner=new Runner(new FileJobStore(join(dir,"jobs")),async()=>{checks++;return checks===1?good:{kind:"refused",code:reason,providerCalls:0};},()=>now); await runner.create(agreement); await runner.tick(); now+=86400000; const refused=await runner.tick(); expect(refused[0].outcome?.code).toBe(reason); now+=86400000; await runner.tick(); expect(checks).toBe(2);
});
it("separate processes preserve both jobs through exclusive atomic writes",async()=>{
 const {execFile}=await import("node:child_process"); const {promisify}=await import("node:util"); const run=promisify(execFile); const path=join(dir,"process-jobs"), file=join(dir,"agreement.json"); await writeFile(file,JSON.stringify(agreement));
 await Promise.all([run(process.execPath,["../../node_modules/tsx/dist/cli.mjs","src/cli.ts","create",path,file]),run(process.execPath,["../../node_modules/tsx/dist/cli.mjs","src/cli.ts","create",path,file])]); expect(await new FileJobStore(path).list()).toHaveLength(2);
});
it("unknown provider call counts remain unknown and retries preserve all attempt receipts",async()=>{
 const {metrics}=await import("../src/index"); let now=Date.parse("2026-10-10T07:00Z"); const runner=new Runner(new FileJobStore(join(dir,"jobs")),async()=>({kind:"pending",providerCalls:null}),()=>now); await runner.create(agreement); await runner.tick(); now+=60000; await runner.tick(); now+=120000; await runner.tick(); const counts=metrics((await runner.store.list())[0]); expect(counts).toMatchObject({occurrences:1,attempts:3,observedAttempts:3,completed:0,providerCalls:0,providerCallsUnknown:3});
});

it('keeps upstream calls unknown when a response is lost or malformed after provider work', async () => {
 const {metrics}=await import('../src/index');
 for(const malformed of ['lost','invalid-count','null','undefined']){
  let upstreamCalls=0;
  const runner=new Runner(new FileJobStore(join(dir,malformed)),async()=>{
   upstreamCalls++;
   if(malformed==='invalid-count')return {kind:'completed',providerCalls:-1} as Outcome;
   if(malformed==='null')return null as any;
   if(malformed==='undefined')return undefined as any;
   throw new Error('Response lost after upstream submit');
  },()=>Date.parse('2026-10-10T07:00Z'));
  await runner.create(agreement);const [execution]=await runner.tick();
  expect(upstreamCalls).toBe(1);expect(execution.outcome).toMatchObject({kind:'unavailable',providerCalls:null});
  expect(metrics((await runner.store.list())[0])).toMatchObject({attempts:1,providerCalls:0,providerCallsUnknown:1});
 }
});
it('counts missing crash receipts as unknown and does not invent zero calls on exhausted leases', async () => {
 const {metrics}=await import('../src/index');const now=Date.parse('2026-10-10T07:00Z');
 const store=new FileJobStore(join(dir,'crashed'));let calls=0;
 const runner=new Runner(store,async()=>{calls++;return good;},()=>now);const job=await runner.create(agreement);
 await store.transaction(s=>s.jobs[0].executions.push({id:`${job.id}:2026-10-10`,dueAt:new Date(now).toISOString(),attempt:3,state:'running',leaseUntil:new Date(now-1).toISOString()}));
 expect(await runner.tick()).toEqual([]);expect(calls).toBe(0);
 const saved=(await store.list())[0];expect(saved.executions[0].outcome).toMatchObject({code:'RETRY_EXHAUSTED',providerCalls:null});
 expect(metrics(saved)).toMatchObject({attempts:3,observedAttempts:0,providerCalls:0,providerCallsUnknown:3});
});
it('distinguishes fresh unchanged provider reads from durable completed replays in receipts and metrics', async () => {
 const {metrics}=await import('../src/index');let now=Date.parse('2026-10-10T07:00Z');let responses=0;
 const lookup=connectorLookup('http://localhost:3310',async()=> 'token',async()=>Response.json(
  responses++===0
   ? {result:{status:'done',unchanged:true},replayed:true,provider_calls:0}
   : {result:{status:'done'},unchanged:true,replayed:false,provider_calls:1}
 ));
 const runner=new Runner(new FileJobStore(join(dir,'classification')),lookup,()=>now);await runner.create(agreement);
 const [replay]=await runner.tick();expect(replay.outcome).toMatchObject({kind:'completed',replayed:true});
 now+=86400000;const [unchanged]=await runner.tick();expect(unchanged.outcome).toMatchObject({kind:'unchanged',replayed:false});
 expect(metrics((await runner.store.list())[0])).toMatchObject({completed:0,unchanged:1,replayed:1,providerCalls:1,providerCallsUnknown:0});
});
