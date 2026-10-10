import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {actionHash,type EmailAction,type EmailReceipt} from '@prototype/whenisbins-email';
import type {Store} from './store';
import type {Property} from './provider';
import type {Mailbox} from './email-service';
/** Private receipts imported after reading the designated inbox, never supplied through the public API. */
export type MailboxEvidence={operationId:string;actionHash:string;source:'gmail_connector';messageId:string;receivedAt:string;recipient:string;property:string;confirmationURL?:string;stopURL?:string;delivered:true;confirmedAt?:string;confirmationSource?:'native_browser_confirmed';cancelledAt?:string;cancellationSource?:'native_browser_confirmed'};
const validDate=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const nativeConfirmed=(e:MailboxEvidence)=>e.confirmationSource==='native_browser_confirmed'&&validDate(e.confirmedAt);
function privateLink(value:string,kind:'verify'|'stop'){
 const u=new URL(value);
 if(u.origin!=='https://whenisbins.com'||u.username||u.password||u.search||u.hash||!new RegExp('^/'+kind+'/[A-Za-z0-9_-]+$').test(u.pathname))throw Error(kind==='verify'?'INVALID_NATIVE_CONFIRMATION_LINK':'INVALID_NATIVE_STOP_LINK');
 return u.href;
}
export class FileMailboxEvidence {
 constructor(private file:string){}
 async records():Promise<MailboxEvidence[]>{try{const value=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(value))throw Error('INVALID_MAILBOX_EVIDENCE');return value.filter(e=>e&&typeof e==='object'&&e.source==='gmail_connector'&&e.delivered===true&&typeof e.messageId==='string'&&e.messageId&&validDate(e.receivedAt)&&typeof e.operationId==='string'&&typeof e.actionHash==='string'&&typeof e.recipient==='string'&&typeof e.property==='string');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}}
 async forAction(action:EmailAction,operationId?:string){const signup={...action,operation:'signup' as const};return (await this.records()).find(e=>e.actionHash===actionHash(signup)&&e.recipient===action.email&&e.property===action.property&&(!operationId||e.operationId===operationId));}
 async reconcile(action:EmailAction,operationId?:string):Promise<'confirmed'|'absent'|'unknown'>{
  if(action.operation==='signup'&&!operationId)return 'unknown';
  const e=await this.forAction(action,action.operation==='signup'?operationId:undefined);
  return e&&(action.operation==='signup'?nativeConfirmed(e):e.cancellationSource==='native_browser_confirmed'&&validDate(e.cancelledAt))?'confirmed':'unknown';
 }
 async confirmationPath(action:EmailAction,operationId:string){
  if(action.operation!=='signup'||!operationId)return;
  const e=await this.forAction(action,operationId);return e?.confirmationURL?privateLink(e.confirmationURL,'verify'):undefined;
 }
 async cancellationPath(action:EmailAction){const e=await this.forAction(action);return e?.stopURL?privateLink(e.stopURL,'stop'):undefined;}
}
const nativeReceipt=(receipt:EmailReceipt)=>receipt.status==='confirmed'&&['NATIVE_CONFIRMATION_OBSERVED','NATIVE_SUBSCRIPTION_CONFIRMED','OBSERVED_NATIVE_CONFIRMATION','INDEPENDENT_SERVICE_OR_MAILBOX_EVIDENCE'].includes(receipt.reason);
/** Received verification mail proves delivery only. Activation needs separately observed native confirmation. */
export async function confirmVerifiedMailbox(config:{store:Store;evidence:FileMailboxEvidence;properties:Property[];mailboxes:Mailbox[]},input:{principal:string;agentId:string;grant:string;actKey:string}){
 const operationId=createHash('sha256').update(JSON.stringify(['email',input.principal,input.agentId,'subscribe_reminders',input.actKey])).digest('hex');
 return config.store.transaction(async state=>{
  const op=state.operations[operationId],metadata=op?.result as {grantId?:string;mailboxId?:string;receipt?:EmailReceipt;mailDeliveryObserved?:boolean}|undefined;
  if(!op||op.owner!==input.principal||metadata?.grantId!==input.grant||!metadata.receipt||!['submitted','confirmation_required','unknown','confirmed'].includes(metadata.receipt.status)||(op.leaseUntil??0)>Date.now())throw Error('MAILBOX_OPERATION_NOT_OWNED');
  const property=config.properties.find(p=>p.id===op.property),mailbox=config.mailboxes.find(m=>m.id===metadata.mailboxId);
  if(!property||!mailbox||property.subject!==mailbox.subject||metadata.receipt.operationId!==operationId)throw Error('MAILBOX_RESOURCE_BINDING_INVALID');
  const action:EmailAction={operation:'signup',property:property.address,email:mailbox.email,reminderChoice:'evening_before'};
  if(metadata.receipt.actionHash!==actionHash(action))throw Error('MAILBOX_ACTION_BINDING_INVALID');
  const proof=await config.evidence.forAction(action,operationId);
  if(nativeReceipt(metadata.receipt))return {status:'confirmed',evidence:'native_confirmation',real_mail_delivered:!!proof,subscription_confirmed:true,duplicate:true};
  if(!proof)return {status:'confirmation_required',evidence:'awaiting_received_email',real_mail_delivered:false,subscription_confirmed:false,duplicate:false};
  if(nativeConfirmed(proof)){
   metadata.receipt={...metadata.receipt,status:'confirmed',reason:'NATIVE_CONFIRMATION_OBSERVED',updatedAt:new Date().toISOString()};metadata.mailDeliveryObserved=true;op.result={...op.result,...metadata};
   state.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'email_signup',stage:'subscription_confirmed',decision:'OBSERVED',taskId:operationId,...(op.effectId?{effectId:op.effectId}:{})});
   return {status:'confirmed',evidence:'native_confirmation',real_mail_delivered:true,subscription_confirmed:true,duplicate:false};
  }
  const duplicate=metadata.mailDeliveryObserved===true;
  metadata.receipt={...metadata.receipt,status:'confirmation_required',reason:'REAL_VERIFICATION_MAIL_DELIVERY_OBSERVED',updatedAt:new Date().toISOString()};metadata.mailDeliveryObserved=true;op.result={...op.result,...metadata};
  if(!duplicate)state.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'email_signup',stage:'subscription_pending',decision:'OBSERVED',taskId:operationId});
  return {status:'confirmation_required',evidence:'received_verification_email',real_mail_delivered:true,subscription_confirmed:false,duplicate};
 });
}
