import {createHash,randomUUID} from "node:crypto";
import type {Page} from "@playwright/test";
import {executeEmailWorkflow,type EmailAction,type EmailReceipt,type ReceiptStore} from "@prototype/whenisbins-email";
import type {startEmailFixture} from "../../../packages/whenisbins-email/src/fixture";
import catalogue from "../service-catalogue.json";
import type {Store,Operation,Event} from "./store";
import type {Property} from "./provider";
const canonical=(v:unknown):string=>Array.isArray(v)?"["+v.map(canonical).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}":JSON.stringify(v);
type Metadata={mailboxId?:string;grantId?:string;receipt?:EmailReceipt;proposalId?:string;reservationId?:string;completionReported?:boolean;leaseId?:string};
export type Mailbox={id:string;subject:string;email:string;label:string};
export type LiveEmailBackend={mode:"live";declaresAgent?:boolean;execute:(input:{page:Page;action:EmailAction;approvedAction:EmailAction;operationId:string;store:ReceiptStore;property:Property;cancellationPath?:string;confirmationPath?:string})=>Promise<EmailReceipt>;confirmationPath?:(action:EmailAction,operationId:string)=>Promise<string|undefined>;reconcile:(action:EmailAction,operationId?:string)=>Promise<"confirmed"|"absent"|"unknown">;cancellationPath:(action:EmailAction)=>Promise<string|undefined>};
export type EmailHandlerConfig={delegateUrl:string;serviceKey:string;properties:Property[];store:Store;catalogue?:{service:string;version:number;capabilities:unknown[]};fixture?:Awaited<ReturnType<typeof startEmailFixture>>;mailboxes?:Mailbox[];live?:LiveEmailBackend;pageFactory:()=>Promise<{page:Page;close:()=>Promise<void>}>};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"private, no-store"}});
/** Checks consent and exact approval before either fixture or explicitly configured native browser work. */
export function createEmailHandler(config:EmailHandlerConfig,transport:typeof fetch=fetch){
 if(Boolean(config.fixture)===Boolean(config.live))throw Error("EXACTLY_ONE_EMAIL_BACKEND_REQUIRED");
 if(config.fixture){const fixtureOrigin=new URL(config.fixture.config.origin);if(!["localhost","127.0.0.1","[::1]"].includes(fixtureOrigin.hostname)||config.fixture.config.allowLive)throw Error("SYNTHETIC_ONLY_EMAIL_SERVICE");}
 if(config.live&&(!config.mailboxes?.length||config.properties.some(p=>p.postcode.startsWith("ZZ"))))throw Error("LIVE_EMAIL_RESOURCES_REQUIRED");
 const browserConfig=config.fixture?structuredClone(config.fixture.config):undefined;
 const mailboxes=config.mailboxes??[{id:"mailbox-sam",subject:config.properties.find(p=>p.id==="home-sam")?.subject??"",email:"sam.test@example.invalid",label:"Synthetic test inbox"}];
 const reconcile=config.live?.reconcile??config.fixture!.reconcile;
 const supported=config.catalogue??catalogue,digest=createHash("sha256").update(canonical(supported)).digest("hex");
 const post=async(path:string,body:object)=>{const r=await transport(config.delegateUrl+path,{method:"POST",headers:{"content-type":"application/json","x-service-key":config.serviceKey},body:JSON.stringify({service:supported.service,...body}),redirect:"error",signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error("DELEGATE_UNAVAILABLE");return r.json();};
 const append=(event:Event)=>config.store.transaction(s=>{s.events.push(event);});
 const bound=(check:any,cap:string,propertyId:string,mailboxId?:string)=>{
   const scope=check.constraints?.[cap],p=check.constraint_provenance;
   return check.authorised===true&&typeof check.check_id==="string"&&scope&&Object.keys(scope).length===(mailboxId?2:1)&&Array.isArray(scope.property_id)&&scope.property_id.includes(propertyId)&&(!mailboxId||Array.isArray(scope.mailbox_id)&&scope.mailbox_id.includes(mailboxId))&&p?.catalogue?.digest===digest&&p?.catalogue?.version===supported.version&&p?.mandate_id===check.authorisation_id&&p?.delegation_id===check.chain?.delegation_id;
 };
 return async(req:Request):Promise<Response>=>{
   const path=new URL(req.url).pathname,operation=path==="/api/reminders/signup"?"signup":path==="/api/reminders/cancel"?"cancel":undefined;
   if(!operation)return response({reason:"NOT_FOUND"},404);
   const capability=operation==="signup"?"subscribe_reminders":"cancel_reminders";
   const event:Event={sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:operation==="signup"?"email_signup":"email_cancel",stage:"refused",decision:"REFUSED",costClass:"write"};
   const finish=async(body:unknown,status:number)=>{await append(event);return response(body,status);};
   let operationKey:string|undefined,leaseId:string|undefined;
   try{
     if(req.method!=="POST")return await finish({reason:"METHOD_NOT_ALLOWED"},405);
     const expectedGrant=req.headers.get("x-grant-reference");
     const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1],principal=req.headers.get("x-principal-id");
     if(!token||!principal)return await finish({reason:"AGENT_IDENTITY_REQUIRED"},401);
     const raw=await req.text();if(raw.length>4096)return await finish({reason:"INVALID_REQUEST"},400);
     let body:any;try{body=JSON.parse(raw);}catch{return await finish({reason:"INVALID_REQUEST"},400);}
     if(!body||Array.isArray(body)||Object.keys(body).some(k=>!["property_id","mailbox_id","reminder_choice"].includes(k))||!config.properties.some(p=>p.id===body.property_id)||!mailboxes.some(m=>m.id===body.mailbox_id)||body.reminder_choice!=="evening_before")return await finish({reason:"EXACT_RESOURCE_REFUSED"},403);
     const key=req.headers.get("idempotency-key");if(!key||!/^[A-Za-z0-9_-]{8,128}$/.test(key))return await finish({reason:"IDEMPOTENCY_KEY_REQUIRED"},400);
     const base={agent_token:token,principal_id:principal,catalogue_version:supported.version};
     const read=await post("/api/authorisations/check",{...base,capability:"read_collection_dates"});event.delegateCheckId=read.check_id;
     const property=config.properties.find(p=>p.id===body.property_id&&p.subject===read.subject);
     if(!read.authorised)return await finish({reason:read.reason,delegate_check_id:read.check_id},403);
     if(expectedGrant&&read.authorisation_id!==expectedGrant)return await finish({reason:"GRANT_REFERENCE_MISMATCH"},403);
     if(!property||!bound(read,"read_collection_dates",body.property_id)||typeof read.delegate?.id!=="string")return await finish({reason:"PROPERTY_SCOPE_REFUSED"},403);
     const mailbox=mailboxes.find(m=>m.id===body.mailbox_id&&m.subject===read.subject);
     if(!mailbox)return await finish({reason:"MAILBOX_SCOPE_REFUSED"},403);
     const action:EmailAction={operation,property:config.live?property.address:"synthetic-property-1",email:mailbox.email,reminderChoice:body.reminder_choice};
     operationKey=createHash("sha256").update(JSON.stringify(["email",principal,read.delegate.id,capability,key])).digest("hex");
     const proposal={idempotency_key:operationKey,payload:{property:action.property,email:action.email,reminder_choice:action.reminderChoice}};
     const check=await post("/api/authorisations/check",{...base,capability,proposal});event.delegateCheckId=check.check_id;
     if(!check.authorised)return await finish({reason:check.reason,delegate_check_id:check.check_id,step_up:check.step_up,step_up_url:check.step_up?.approve_url},403);
     if(expectedGrant&&check.authorisation_id!==expectedGrant)return await finish({reason:"GRANT_REFERENCE_MISMATCH"},403);
     if(check.subject!==read.subject||check.delegate?.id!==read.delegate.id||!bound(check,capability,body.property_id,body.mailbox_id))return await finish({reason:"WRITE_SCOPE_REFUSED"},403);
     event.authorityVerified=true;
     const actionDigest=createHash("sha256").update(canonical(proposal.payload)).digest("hex");
     leaseId=randomUUID();let busy=false;
     let op=await config.store.transaction(s=>{
       const prior=s.operations[operationKey!];if(prior){if((prior.result as Metadata)?.grantId!==check.authorisation_id)throw Error("GRANT_REFERENCE_MISMATCH");if(prior.digest!==actionDigest)throw Error("IDEMPOTENCY_CONFLICT");if((prior.leaseUntil??0)>Date.now()){busy=true;return structuredClone(prior);}}
       const next:Operation=prior??{digest:actionDigest,owner:principal,property:body.property_id,key:operationKey!,state:"pending",result:{}};
       next.leaseUntil=Date.now()+120000;next.result={...next.result,leaseId,grantId:check.authorisation_id,mailboxId:body.mailbox_id};s.operations[operationKey!]=next;return structuredClone(next);
     });
     event.taskId=operationKey;
     if(busy)return await finish({reason:"OPERATION_IN_PROGRESS",retry_after_seconds:5},202);
     const metadata=op.result as Metadata;
     const receiptStore:ReceiptStore={get:async()=>((await config.store.snapshot()).operations[operationKey!]?.result as Metadata)?.receipt,put:async receipt=>{await config.store.transaction(s=>{const current=s.operations[operationKey!];if((current.result as Metadata)?.leaseId!==leaseId)throw Error("OPERATION_LEASE_LOST");current.result={...current.result,receipt};});}};
     if(metadata.receipt?.status==="confirmed"||metadata.receipt?.status==="refused"){
       if(metadata.receipt.status==="confirmed"&&metadata.proposalId)await post("/api/step-ups/complete",{proposal_id:metadata.proposalId,reference:operationKey});
       event.stage="replay";event.decision=metadata.receipt.status==="confirmed"?"ALLOWED":"REFUSED";event.outcomeClass="REPLAY";
       return await finish({receipt:metadata.receipt,replayed:true,subscription_not_cancelled_by_revocation:true},metadata.receipt.status==="confirmed"?200:422);
     }
     if(!check.step_up?.proposal_id) return await finish({reason:"STEP_UP_NOT_APPROVED"},403);
     // Cancellation requires independently held, legitimately confirmed mailbox evidence.
     let stop:string|undefined;
     if(operation==="cancel")try{stop=config.live?await config.live.cancellationPath({...action,operation:"signup"}):config.fixture!.mailbox.stopPath({...action,operation:"signup"});if(!stop)throw Error("Mailbox evidence required");}catch{return await finish({reason:"INBOX_CONFIRMATION_REQUIRED",status:"confirmation_required"},202);}
     const observed=metadata.receipt?await reconcile(action,operationKey):"absent";
     const confirmationPath=operation==="signup"&&metadata.receipt&&["submitted","confirmation_required"].includes(metadata.receipt.status)&&["NATIVE_FORM_SUBMITTED_AWAITING_INDEPENDENT_EVIDENCE","INBOX_CONFIRMATION_REQUIRED","REAL_VERIFICATION_MAIL_DELIVERY_OBSERVED","NATIVE_CONFIRMATION_FORM_REQUIRED"].includes(metadata.receipt.reason)?await config.live?.confirmationPath?.(action,operationKey):undefined;
     const needsSubmission=!metadata.receipt||observed==="absent",needsBrowser=needsSubmission||Boolean(confirmationPath);
     // A received verification link continues this exact owned signup. It never resubmits the form or opens a new proposal.
     if(needsSubmission&&check.step_up.state==="REDEEMED")return await finish({reason:"STEP_UP_ALREADY_USED"},409);
     const reservationId=metadata.reservationId??randomUUID();const proposalId=metadata.proposalId??check.step_up.proposal_id;
     if(needsSubmission){
       const reserved=await post("/api/step-ups/reserve",{...base,capability,proposal,reservation_id:reservationId});
       if(reserved.reserved!==true||reserved.proposal_id!==proposalId)return await finish({reason:reserved.reason??"STEP_UP_NOT_APPROVED"},409);
       await config.store.transaction(s=>{s.operations[operationKey!].result={...s.operations[operationKey!].result,proposalId,reservationId};});
     }
     if(needsBrowser){event.outboundCallId=randomUUID();event.upstreamAgentDeclared=config.live?.declaresAgent??false;await append({...event,sourceEventId:randomUUID(),stage:"admitted",decision:"ALLOWED"});}
     let browser:Awaited<ReturnType<EmailHandlerConfig["pageFactory"]>>|undefined;
     let receipt:EmailReceipt;
     try{
       browser=await config.pageFactory();browser.page.setDefaultTimeout(config.live?15000:5000);browser.page.setDefaultNavigationTimeout(config.live?30000:5000);
       receipt=config.live?await config.live.execute({page:browser.page,action,approvedAction:action,operationId:operationKey,store:receiptStore,property,cancellationPath:stop,confirmationPath}):await executeEmailWorkflow({page:browser.page,action,approvedAction:action,operationId:operationKey,store:receiptStore,config:browserConfig!,cancellationPath:stop,reconcile});
     }finally{await browser?.close();}
     const committed=receipt.status==="confirmed"||receipt.status==="submitted"||receipt.reason==="INBOX_CONFIRMATION_REQUIRED";
     if(committed){await post("/api/step-ups/complete",{proposal_id:proposalId,reference:operationKey});await config.store.transaction(s=>{const o=s.operations[operationKey!];o.effectId??=randomUUID();o.result={...o.result,completionReported:true};});}
     else if(receipt.status==="refused"||receipt.reason==="HUMAN_CHALLENGE_REQUIRED")await post("/api/step-ups/release",{proposal_id:proposalId,reservation_id:reservationId});
     // Unknown browser outcomes retain their private receipt/reservation and cannot trigger blind resubmission.
     event.stage=receipt.status==="confirmed"?(operation==="signup"?"subscription_confirmed":"cancellation_confirmed"):receipt.status==="refused"?"refused":"subscription_pending";event.decision=receipt.status==="refused"?"REFUSED":"ALLOWED";event.outcomeClass=committed?"UNIQUE_OPERATION":undefined;
     const saved=(await config.store.snapshot()).operations[operationKey];event.effectId=saved.effectId;
     await post("/api/outcomes",{check_id:check.check_id,status:receipt.status==="confirmed"?"COMPLETED":receipt.status==="refused"?"FAILED":"SUBMITTED",reference:event.effectId,idempotency_key:operationKey+":"+receipt.status}).catch(()=>{});
     return await finish({receipt,subscription_not_cancelled_by_revocation:true,mode:config.live?"live":"fixture",native_authority_checked:false,...(!config.live?{live_compatibility:"unvalidated"}:{})},receipt.status==="confirmed"?200:receipt.status==="refused"?422:202);
   }catch(e){event.stage="refused";event.outcomeClass="UNAVAILABLE";return await finish({reason:e instanceof Error&&["IDEMPOTENCY_CONFLICT","GRANT_REFERENCE_MISMATCH"].includes(e.message)?e.message:"SERVICE_UNAVAILABLE"},e instanceof Error&&e.message==="GRANT_REFERENCE_MISMATCH"?403:503);}
   finally{if(operationKey&&leaseId)await config.store.transaction(s=>{const o=s.operations[operationKey!];if((o?.result as Metadata)?.leaseId===leaseId){o.leaseUntil=undefined;o.result={...o.result,leaseId:undefined};}}).catch(()=>{});}
 };
}

/** Controlled synthetic inbox handoff. This records mailbox evidence, not a fresh authority check or email delivery. */
export async function confirmOwnedMailbox(config:Pick<EmailHandlerConfig,"store"|"fixture">,input:{principal:string;agentId:string;grant:string;actKey:string}){
 if(!config.fixture)throw Error("SYNTHETIC_INBOX_REQUIRED");
 const fixture=config.fixture;
 const operationKey=createHash("sha256").update(JSON.stringify(["email",input.principal,input.agentId,"subscribe_reminders",input.actKey])).digest("hex");
 return config.store.transaction(async state=>{
   const op=state.operations[operationKey],metadata=op?.result as Metadata|undefined;
   if(!op||op.owner!==input.principal||op.property!=="home-sam"||metadata?.grantId!==input.grant||!metadata.receipt||!["confirmation_required","submitted","confirmed"].includes(metadata.receipt.status))throw Error("MAILBOX_OPERATION_NOT_OWNED");
   if((op.leaseUntil??0)>Date.now())throw Error("MAILBOX_OPERATION_IN_PROGRESS");
   if(metadata.receipt.status==="confirmed")return {status:"confirmed",evidence:"simulated_inbox",real_mail_delivered:false,duplicate:true};
   const action:EmailAction={operation:"signup",property:"synthetic-property-1",email:"sam.test@example.invalid",reminderChoice:"evening_before"};
   fixture.mailbox.confirm(action);
   if(await fixture.reconcile(action)!=="confirmed")throw Error("MAILBOX_CONFIRMATION_NOT_OBSERVED");
   metadata.receipt={...metadata.receipt,status:"confirmed",reason:"CONTROLLED_MAILBOX_CONFIRMATION",updatedAt:new Date().toISOString()};
   op.result={...op.result,...metadata};op.effectId??=randomUUID();
   state.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:"email_signup",stage:"subscription_confirmed",decision:"OBSERVED",taskId:operationKey,effectId:op.effectId,outcomeClass:"UNIQUE_OPERATION",costClass:"write"});
   return {status:"confirmed",evidence:"simulated_inbox",real_mail_delivered:false,duplicate:false};
 });
}
