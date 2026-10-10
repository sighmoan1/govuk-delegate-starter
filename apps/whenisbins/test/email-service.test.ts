import {chromium,type Browser} from "@playwright/test";
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {createEmailHandler,confirmOwnedMailbox,type LiveEmailBackend} from "../src/email-service";
import {actionHash} from "@prototype/whenisbins-email";
import {MemoryStore,FileStore} from "../src/store";
import {startEmailFixture} from "../../../packages/whenisbins-email/src/fixture";
import {catalogueDigest} from "../src/service";
import catalogue from "../service-catalogue.json";
import {mkdtemp,rm} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";
let browser:Browser,fixture:Awaited<ReturnType<typeof startEmailFixture>>;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});afterAll(async()=>{await browser.close();});
beforeEach(async()=>{fixture=await startEmailFixture();});afterEach(async()=>{await fixture.close();});
function setup(store:MemoryStore|FileStore=new MemoryStore()){
 let grant="grant";let denied:string|undefined,pending=false,redeemed=false,writeOnlySignup=false,readOnly=false,reserveRefused=false,completeUnavailable=false;const bodies:{path:string;body:any}[]=[];
 const transport=vi.fn<typeof fetch>(async(url,init)=>{
   const path=new URL(String(url)).pathname,body=JSON.parse(String(init?.body));bodies.push({path,body});
   if(path.endsWith("/check")){
     if(denied)return Response.json({authorised:false,reason:denied,check_id:"refusal"});
     const write=body.capability!=="read_collection_dates";
     if(readOnly&&write)return Response.json({authorised:false,reason:"PERMISSION_MISSING",check_id:"read-only"});
     if(writeOnlySignup&&body.capability==="cancel_reminders")return Response.json({authorised:false,reason:"PERMISSION_MISSING",check_id:"missing"});
     if(write&&pending)return Response.json({authorised:false,reason:"STEP_UP_REQUIRED",check_id:"pending",step_up:{proposal_id:"proposal",approve_url:"http://delegate/approve?code=synthetic"}});
     return Response.json({authorised:true,subject:"sam",check_id:"check-"+bodies.length,authorisation_id:grant,delegate:{id:"agent"},chain:{delegation_id:"chain"},constraints:{[body.capability]:{property_id:["home-sam"],...(write?{mailbox_id:["mailbox-sam"]}:{})}},constraint_provenance:{mandate_id:grant,delegation_id:"chain",catalogue:{version:catalogue.version,digest:catalogueDigest}},...(write?{step_up:{state:redeemed?"REDEEMED":"APPROVED",proposal_id:"proposal"}}:{})});
   }
   if(path.endsWith("/reserve"))return Response.json({reserved:!redeemed&&!reserveRefused,proposal_id:"proposal",reason:"STEP_UP_ALREADY_USED"});
   if(path.endsWith("/complete")){if(completeUnavailable)return new Response("",{status:503});redeemed=true;return Response.json({state:"REDEEMED"});}
   return Response.json({released:true});
 });
 const handler=createEmailHandler({delegateUrl:"http://delegate",serviceKey:"own-key",properties:[{id:"home-sam",subject:"sam",label:"Sam",postcode:"ZZ1 1ZZ",address:"Synthetic"}],store,fixture,pageFactory:async()=>{const context=await browser.newContext();return {page:await context.newPage(),close:()=>context.close()};}},transport);
 return {handler,store,bodies,transport,setDenied:(v?:string)=>{denied=v;},setPending:(v:boolean)=>{pending=v;},setSignupOnly:()=>{writeOnlySignup=true;},setReadOnly:()=>{readOnly=true;},setReserveRefused:()=>{reserveRefused=true;},setCompleteUnavailable:(v:boolean)=>{completeUnavailable=v;},resetApproval:()=>{redeemed=false;},setGrant:(v:string)=>{grant=v;}};
}
const req=(operation="signup",key="email-operation-0001",body:any={property_id:"home-sam",mailbox_id:"mailbox-sam",reminder_choice:"evening_before"},headers:Record<string,string>={})=>new Request("http://connector/api/reminders/"+operation,{method:"POST",headers:{authorization:"Bearer token","x-principal-id":"principal","idempotency-key":key,...headers},body:JSON.stringify(body)});
const action={operation:"signup" as const,property:"synthetic-property-1",email:"sam.test@example.invalid",reminderChoice:"evening_before"};
describe("email connector authority, exact approval and durable browser work",()=>{
 it("returns an approval URL then reserves exact bound payload before real signup",async()=>{
   const x=setup();x.setPending(true);const pending=await x.handler(req());expect(pending.status).toBe(403);expect(await pending.json()).toMatchObject({step_up_url:"http://delegate/approve?code=synthetic"});expect(fixture.counts().submissions).toBe(0);
   x.setPending(false);const result=await x.handler(req());expect(result.status).toBe(202);expect(await result.json()).toMatchObject({receipt:{status:"confirmation_required"}});expect(fixture.counts().submissions).toBe(1);
   const reserve=x.bodies.find(x=>x.path.endsWith("/reserve"))!;expect(reserve.body.proposal.payload).toEqual({property:action.property,email:action.email,reminder_choice:action.reminderChoice});expect(reserve.body.service).toBe("whenisbins-connector");expect(x.bodies.some(x=>x.path.endsWith("/complete"))).toBe(true);
   fixture.mailbox.confirm(action);expect((await x.handler(req())).status).toBe(200);expect(fixture.counts().submissions).toBe(1);
   expect((await x.store.snapshot()).events.at(-1)).toMatchObject({stage:"subscription_confirmed",authorityVerified:true});
   expect((await x.store.snapshot()).events.some(e=>e.stage==="subscription_pending"&&e.authorityVerified===true)).toBe(true);
 });
 for(const reason of ["NO_AUTHORISATION","AUTHORISATION_REVOKED","AUTHORISATION_EXPIRED","UNKNOWN_DELEGATE","PERMISSION_MISSING","NO_RELATIONSHIP"])it("refuses "+reason+" before browser work with an event",async()=>{
   const x=setup();x.setDenied(reason);expect((await x.handler(req())).status).toBe(403);expect(fixture.counts().submissions).toBe(0);expect((await x.store.snapshot()).events).toHaveLength(1);
 });
 it("refuses missing identity before central checks",async()=>{const x=setup();expect((await x.handler(req("signup",undefined,undefined,{authorization:""}))).status).toBe(401);expect(x.bodies).toHaveLength(0);expect((await x.store.snapshot()).events).toHaveLength(1);});
 it.each([{property_id:"home-other",mailbox_id:"mailbox-sam",reminder_choice:"evening_before"},{property_id:"home-sam",mailbox_id:"other",reminder_choice:"evening_before"},{property_id:"home-sam",mailbox_id:"mailbox-sam",reminder_choice:"evening_before",email:"arbitrary@example.invalid"}])("refuses resource or recipient substitution",async body=>{const x=setup();expect((await x.handler(req("signup",undefined,body))).status).toBe(403);expect(fixture.counts().submissions).toBe(0);});
 it("read-only authority cannot sign up and failed approval reservation cannot submit",async()=>{
   const x=setup();x.setReadOnly();expect((await x.handler(req())).status).toBe(403);expect(fixture.counts().submissions).toBe(0);
   const y=setup();y.setReserveRefused();expect((await y.handler(req())).status).toBe(409);expect(fixture.counts().submissions).toBe(0);
 });
 it("lost completion reporting preserves the receipt and safe retry never repeats signup",async()=>{
   const x=setup();x.setCompleteUnavailable(true);expect((await x.handler(req())).status).toBe(503);expect(fixture.counts().submissions).toBe(1);
   x.setCompleteUnavailable(false);fixture.mailbox.confirm(action);expect((await x.handler(req())).status).toBe(200);expect(fixture.counts().submissions).toBe(1);
 });
 it("does not silently cancel a signup under signup-only authority",async()=>{
   const x=setup();await x.handler(req());fixture.mailbox.confirm(action);x.resetApproval();x.setSignupOnly();expect((await x.handler(req("cancel","cancel-operation-0001"))).status).toBe(403);expect(fixture.counts().cancellations).toBe(0);
 });
 it("revocation after signup does not undo the subscription; cancellation is independently approved",async()=>{
   const x=setup();await x.handler(req());fixture.mailbox.confirm(action);x.setDenied("AUTHORISATION_REVOKED");expect((await x.handler(req())).status).toBe(403);expect(fixture.counts().cancellations).toBe(0);
   x.setDenied();x.resetApproval();expect((await x.handler(req("cancel","cancel-operation-0001"))).status).toBe(200);expect(fixture.counts().cancellations).toBe(1);
   expect((await x.store.snapshot()).events.at(-1)).toMatchObject({stage:"cancellation_confirmed",authorityVerified:true});
   expect(JSON.stringify((await x.store.snapshot()).events)).not.toContain("/stop/");
 });
 it("unknown acknowledgement is durable and repeated attempts do not send again",async()=>{
   const x=setup();fixture.setMode("lost");const first=await x.handler(req());expect(await first.json()).toMatchObject({receipt:{status:"unknown"}});fixture.setMode("normal");await x.handler(req());expect(fixture.counts().submissions).toBe(1);expect(x.bodies.filter(x=>x.path.endsWith("/reserve"))).toHaveLength(1);
   fixture.mailbox.confirm(action);expect((await x.handler(req())).status).toBe(200);
 });
 it("explicit website refusal releases approval without a subscription",async()=>{
   const x=setup();fixture.setMode("refuse");expect((await x.handler(req())).status).toBe(422);expect(x.bodies.some(x=>x.path.endsWith("/release"))).toBe(true);expect(fixture.counts().submissions).toBe(0);
 });
 it("checks the portal grant reference and refuses receipt replay under a changed grant",async()=>{
   const x=setup();expect((await x.handler(req("signup",undefined,undefined,{"x-grant-reference":"other"}))).status).toBe(403);expect(fixture.counts().submissions).toBe(0);
   await x.handler(req("signup",undefined,undefined,{"x-grant-reference":"grant"}));fixture.mailbox.confirm(action);x.setGrant("replacement-grant");x.resetApproval();
   expect((await x.handler(req("signup",undefined,undefined,{"x-grant-reference":"replacement-grant"}))).status).toBe(403);expect(fixture.counts().submissions).toBe(1);
 });
 it("binds simulated inbox confirmation to the submitted owner, agent and grant with one evidence event",async()=>{
   const x=setup();const config={store:x.store,fixture};const owned={principal:"principal",agentId:"agent",grant:"grant",actKey:"email-operation-0001"};
   await expect(confirmOwnedMailbox(config,owned)).rejects.toThrow("MAILBOX_OPERATION_NOT_OWNED");
   await x.handler(req());
   for(const change of [{principal:"other"},{agentId:"other"},{grant:"other"},{actKey:"another-operation"}])await expect(confirmOwnedMailbox(config,{...owned,...change})).rejects.toThrow("MAILBOX_OPERATION_NOT_OWNED");
   expect(await confirmOwnedMailbox(config,owned)).toMatchObject({status:"confirmed",real_mail_delivered:false,duplicate:false});
   const state=await x.store.snapshot();const evidence=state.events.filter(e=>e.stage==="subscription_confirmed");expect(evidence).toHaveLength(1);expect(evidence[0].authorityVerified).toBeUndefined();
   expect(await confirmOwnedMailbox(config,owned)).toMatchObject({duplicate:true});expect((await x.store.snapshot()).events.filter(e=>e.stage==="subscription_confirmed")).toHaveLength(1);
   expect(fixture.counts().submissions).toBe(1);
 });
 it("rejects a non-synthetic email target at configuration time",()=>{
   const foreign={...fixture,config:{...fixture.config,origin:"https://whenisbins.com"}};
   expect(()=>createEmailHandler({delegateUrl:"http://delegate",serviceKey:"own",properties:[],store:new MemoryStore(),fixture:foreign,pageFactory:async()=>{throw Error("unused");}})).toThrow("SYNTHETIC_ONLY_EMAIL_SERVICE");
 });
 it("concurrent stable-key requests create one signup with private durable state",async()=>{
   const directory=await mkdtemp(join(tmpdir(),"wb-email-"));try{const x=setup(new FileStore(join(directory,"state.json")));const answers=await Promise.all([x.handler(req()),x.handler(req())]);expect(answers.every(x=>[202,200].includes(x.status))).toBe(true);expect(fixture.counts().submissions).toBe(1);expect(Object.values((await new FileStore(join(directory,"state.json")).snapshot()).operations)[0].result).toMatchObject({receipt:{status:"confirmation_required"}});}finally{await rm(directory,{recursive:true,force:true});}
 });
});

it("continues an owned real verification link under fresh authority without resubmitting or spending a second proposal",async()=>{
 const x=setup(),store=x.store;let ownedMail=false;
 const confirmationPath="https://whenisbins.com/verify/private-owned-token";
 const execute=vi.fn<LiveEmailBackend["execute"]>(async input=>{
  const receipt={operationId:input.operationId,actionHash:actionHash(input.action),status:input.confirmationPath?"confirmed" as const:"confirmation_required" as const,reason:input.confirmationPath?"NATIVE_CONFIRMATION_OBSERVED":"INBOX_CONFIRMATION_REQUIRED",updatedAt:new Date().toISOString()};
  await input.store.put(receipt);return receipt;
 });
 const handler=createEmailHandler({delegateUrl:"http://delegate",serviceKey:"own",store,properties:[{id:"home-sam",subject:"sam",label:"Designated",postcode:"AA1 1AA",address:"Designated private address"}],mailboxes:[{id:"mailbox-sam",subject:"sam",label:"Designated inbox",email:"designated@example.invalid"}],live:{mode:"live",execute,reconcile:async()=>"unknown",confirmationPath:async()=>ownedMail?confirmationPath:undefined,cancellationPath:async()=>undefined},pageFactory:async()=>{const context=await browser.newContext();return {page:await context.newPage(),close:()=>context.close()};}},x.transport);
 expect((await handler(req())).status).toBe(202);expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][0].confirmationPath).toBeUndefined();
 ownedMail=true;x.setDenied("AUTHORISATION_REVOKED");expect((await handler(req())).status).toBe(403);expect(execute).toHaveBeenCalledTimes(1);
 x.setDenied();expect((await handler(req())).status).toBe(200);expect(execute).toHaveBeenCalledTimes(2);expect(execute.mock.calls[1][0].confirmationPath).toBe(confirmationPath);expect(execute.mock.calls[1][0].operationId).toBe(execute.mock.calls[0][0].operationId);
 expect(x.bodies.filter(b=>b.path.endsWith("/reserve"))).toHaveLength(1);
 expect((await store.snapshot()).events.filter(e=>e.outboundCallId&&e.stage==="admitted")).toHaveLength(2);
 expect((await handler(req())).status).toBe(200);expect(execute).toHaveBeenCalledTimes(2);
 expect(JSON.stringify((await store.snapshot()).events)).not.toContain("private-owned-token");
});
