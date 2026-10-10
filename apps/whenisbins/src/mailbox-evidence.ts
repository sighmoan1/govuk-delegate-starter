import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {actionHash,type EmailAction,type EmailReceipt} from '@prototype/whenisbins-email';
import type {Store} from './store';
import type {Property} from './provider';
import type {Mailbox} from './email-service';
/** Private receipts imported after reading the designated inbox, never supplied through the public API. */
export type MailboxEvidence={operationId:string;actionHash:string;source:'gmail_connector';messageId:string;receivedAt:string;recipient:string;property:string;stopURL:string;delivered:true;cancelledAt?:string;cancellationSource?:'native_browser_confirmed'};
export class FileMailboxEvidence {
 constructor(private file:string){}
 async records():Promise<MailboxEvidence[]>{try{const value=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(value))throw Error('INVALID_MAILBOX_EVIDENCE');return value.filter(e=>e.source==='gmail_connector'&&e.delivered===true&&typeof e.messageId==='string'&&e.messageId&&typeof e.receivedAt==='string'&&Number.isFinite(Date.parse(e.receivedAt)));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}}
 async forAction(action:EmailAction,operationId?:string){const signup={...action,operation:'signup' as const};return (await this.records()).find(e=>e.actionHash===actionHash(signup)&&e.recipient===action.email&&e.property===action.property&&(!operationId||e.operationId===operationId));}
 async reconcile(action:EmailAction,operationId?:string):Promise<'confirmed'|'absent'|'unknown'>{const e=await this.forAction(action,action.operation==='signup'?operationId:undefined);return e&&(action.operation==='signup'||(e.cancellationSource==='native_browser_confirmed'&&e.cancelledAt&&Number.isFinite(Date.parse(e.cancelledAt))))?'confirmed':'unknown';}
 async cancellationPath(action:EmailAction){const e=await this.forAction(action);if(!e)return;const u=new URL(e.stopURL);if(u.origin!=='https://whenisbins.com'||!u.pathname.startsWith('/'))throw Error('INVALID_NATIVE_STOP_LINK');return u.href;}
}
/** Mail delivery confirms this exact historical signup, without asserting current authority or future delivery. */
export async function confirmVerifiedMailbox(config:{store:Store;evidence:FileMailboxEvidence;properties:Property[];mailboxes:Mailbox[]},input:{principal:string;agentId:string;grant:string;actKey:string}){
 const operationId=createHash('sha256').update(JSON.stringify(['email',input.principal,input.agentId,'subscribe_reminders',input.actKey])).digest('hex');
 return config.store.transaction(async state=>{
  const op=state.operations[operationId],metadata=op?.result as {grantId?:string;mailboxId?:string;receipt?:EmailReceipt}|undefined;
  if(!op||op.owner!==input.principal||metadata?.grantId!==input.grant||!metadata.receipt||!['submitted','confirmation_required','unknown','confirmed'].includes(metadata.receipt.status)||(op.leaseUntil??0)>Date.now())throw Error('MAILBOX_OPERATION_NOT_OWNED');
  const property=config.properties.find(p=>p.id===op.property),mailbox=config.mailboxes.find(m=>m.id===metadata.mailboxId);
  if(!property||!mailbox||property.subject!==mailbox.subject||metadata.receipt.operationId!==operationId)throw Error('MAILBOX_RESOURCE_BINDING_INVALID');
  const action:EmailAction={operation:'signup',property:property.address,email:mailbox.email,reminderChoice:'evening_before'};
  if(metadata.receipt.actionHash!==actionHash(action))throw Error('MAILBOX_ACTION_BINDING_INVALID');
  const proof=await config.evidence.forAction(action,operationId);
  if(!proof)return {status:'confirmation_required',evidence:'awaiting_received_email',real_mail_delivered:false};
  if(metadata.receipt.status==='confirmed')return {status:'confirmed',evidence:'received_email',real_mail_delivered:true,duplicate:true};
  metadata.receipt={...metadata.receipt,status:'confirmed',reason:'REAL_MAIL_DELIVERY_OBSERVED',updatedAt:new Date().toISOString()};op.result={...op.result,...metadata};op.effectId??=randomUUID();
  state.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'email_signup',stage:'subscription_confirmed',decision:'OBSERVED',taskId:operationId,effectId:op.effectId,outcomeClass:'UNIQUE_OPERATION',costClass:'write'});
  return {status:'confirmed',evidence:'received_email',real_mail_delivered:true,duplicate:false};
 });
}
