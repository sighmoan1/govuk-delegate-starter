import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {actionHash} from '@prototype/whenisbins-email';
import {FileMailboxEvidence,confirmVerifiedMailbox,type MailboxEvidence} from '../src/mailbox-evidence';
import {MemoryStore} from '../src/store';
let dir:string,file:string,evidence:FileMailboxEvidence,store:MemoryStore;
const input={principal:'owned',agentId:'agent',grant:'grant',actKey:'signup-key'};
const operationId=createHash('sha256').update(JSON.stringify(['email',input.principal,input.agentId,'subscribe_reminders',input.actKey])).digest('hex');
const action={operation:'signup' as const,property:'Designated address',email:'designated@example.invalid',reminderChoice:'evening_before'};
const resources={properties:[{id:'owned-property',subject:'owned-subject',label:'Designated',address:action.property,postcode:'ZZ1 1ZZ'}],mailboxes:[{id:'owned-mailbox',subject:'owned-subject',label:'Inbox',email:action.email}]};
const receipt={operationId,actionHash:actionHash(action),status:'submitted' as const,reason:'NATIVE_SIGNUP_ACCEPTED',updatedAt:new Date().toISOString()};
const proof:MailboxEvidence={operationId,actionHash:actionHash(action),source:'gmail_connector',messageId:'received-message',receivedAt:new Date().toISOString(),recipient:action.email,property:action.property,confirmationURL:'https://whenisbins.com/verify/private-token',delivered:true};
const write=(records:unknown[])=>writeFile(file,JSON.stringify(records),{mode:0o600});
const confirm=()=>confirmVerifiedMailbox({store,evidence,...resources},input);
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'wb-mailbox-proof-'));file=join(dir,'proof.json');evidence=new FileMailboxEvidence(file);store=new MemoryStore();await store.transaction(s=>{s.operations[operationId]={digest:'payload',owner:input.principal,property:'owned-property',key:operationId,state:'pending',result:{grantId:input.grant,mailboxId:'owned-mailbox',receipt}};});});
afterEach(()=>rm(dir,{recursive:true,force:true}));
it('records delivered verification mail once without asserting activation or a fresh effect',async()=>{
 expect(await confirm()).toMatchObject({real_mail_delivered:false,subscription_confirmed:false});await write([proof]);
 expect(await confirm()).toMatchObject({status:'confirmation_required',real_mail_delivered:true,subscription_confirmed:false,evidence:'received_verification_email',duplicate:false});
 expect(await confirm()).toMatchObject({duplicate:true,subscription_confirmed:false});
 const snapshot=await store.snapshot(),events=snapshot.events;expect(events).toHaveLength(1);expect(events[0]).toMatchObject({stage:'subscription_pending',decision:'OBSERVED'});expect(events[0].authorityVerified).toBeUndefined();expect(events[0].outcomeClass).toBeUndefined();expect(events[0].effectId).toBeUndefined();expect(snapshot.operations[operationId].effectId).toBeUndefined();
 expect((snapshot.operations[operationId].result as any).receipt.status).toBe('confirmation_required');expect(JSON.stringify(events)).not.toContain('private-token');expect(JSON.stringify(events)).not.toContain(action.email);expect(JSON.stringify(events)).not.toContain(action.property);
 expect(await evidence.reconcile(action,operationId)).toBe('unknown');expect(await evidence.cancellationPath(action)).toBeUndefined();
});
it('promotes only separately observed native confirmation and preserves the original effect',async()=>{
 await write([proof]);await confirm();await store.transaction(s=>{s.operations[operationId].effectId='original-effect';});
 for(const bad of [{confirmedAt:new Date().toISOString()},{confirmedAt:'not-a-date',confirmationSource:'native_browser_confirmed'}]){await write([{...proof,...bad}]);expect(await evidence.reconcile(action,operationId)).toBe('unknown');expect(await confirm()).toMatchObject({subscription_confirmed:false});}
 await write([{...proof,confirmedAt:new Date().toISOString(),confirmationSource:'native_browser_confirmed'}]);expect(await evidence.reconcile(action,operationId)).toBe('confirmed');
 expect(await confirm()).toMatchObject({status:'confirmed',real_mail_delivered:true,subscription_confirmed:true,duplicate:false});expect(await confirm()).toMatchObject({duplicate:true,subscription_confirmed:true});
 const snapshot=await store.snapshot();expect(snapshot.events.map(e=>e.stage)).toEqual(['subscription_pending','subscription_confirmed']);expect(snapshot.events[1].effectId).toBe('original-effect');expect(snapshot.events[1].outcomeClass).toBeUndefined();expect(snapshot.operations[operationId].effectId).toBe('original-effect');
});
it('accepts an already native-confirmed receipt without another confirmation event',async()=>{
 await write([proof]);await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:{...receipt,status:'confirmed',reason:'NATIVE_CONFIRMATION_OBSERVED'}};});expect(await confirm()).toMatchObject({status:'confirmed',real_mail_delivered:true,subscription_confirmed:true,duplicate:true});expect((await store.snapshot()).events).toHaveLength(0);
});
it('does not trust legacy delivery-only receipt confirmation',async()=>{
 await write([proof]);await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:{...receipt,status:'confirmed',reason:'REAL_MAIL_DELIVERY_OBSERVED'}};});expect(await confirm()).toMatchObject({subscription_confirmed:false,status:'confirmation_required'});expect((await store.snapshot()).events.map(e=>e.stage)).toEqual(['subscription_pending']);
});
it('requires exact original operation and resource binding for proofs and private verification links',async()=>{
 for(const bad of [{operationId:'different-operation'},{recipient:'another@example.invalid',property:'Other address'},{actionHash:'copied-incorrect-hash'}]){await write([{...proof,...bad}]);expect(await confirm()).toMatchObject({real_mail_delivered:false,subscription_confirmed:false});expect(await evidence.confirmationPath(action,operationId)).toBeUndefined();}
 await write([proof]);await expect(confirmVerifiedMailbox({store,evidence,...resources},{...input,principal:'another-person'})).rejects.toThrow('MAILBOX_OPERATION_NOT_OWNED');
 expect(await evidence.confirmationPath(action,operationId)).toBe(proof.confirmationURL);expect(await evidence.confirmationPath(action,'different-operation')).toBeUndefined();expect(await evidence.confirmationPath({...action,operation:'cancel'},operationId)).toBeUndefined();expect(await evidence.reconcile(action)).toBe('unknown');
 await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:{...receipt,operationId:'different-operation'}};});await expect(confirm()).rejects.toThrow('MAILBOX_RESOURCE_BINDING_INVALID');expect((await store.snapshot()).events).toHaveLength(0);
});
it('rejects external, credential-bearing and malformed private links and requires observed cancellation',async()=>{
 for(const confirmationURL of ['https://other.example/verify/private-token','https://user:pass@whenisbins.com/verify/private-token','http://whenisbins.com/verify/private-token','https://whenisbins.com/verify/private-token/extra','https://whenisbins.com/verify/private-token?next=elsewhere','https://whenisbins.com/verify/private-token#secret']){await write([{...proof,confirmationURL}]);await expect(evidence.confirmationPath(action,operationId)).rejects.toThrow('INVALID_NATIVE_CONFIRMATION_LINK');}
 for(const stopURL of ['https://other.example/stop/private-token','https://user:pass@whenisbins.com/stop/private-token','https://whenisbins.com/verify/private-token']){await write([{...proof,stopURL}]);await expect(evidence.cancellationPath(action)).rejects.toThrow('INVALID_NATIVE_STOP_LINK');}
 const cancel={...action,operation:'cancel' as const};await write([{...proof,stopURL:'https://whenisbins.com/stop/private-token',cancelledAt:new Date().toISOString()}]);expect(await evidence.cancellationPath(action)).toBe('https://whenisbins.com/stop/private-token');expect(await evidence.reconcile(cancel)).toBe('unknown');await write([{...proof,cancelledAt:'bad-date',cancellationSource:'native_browser_confirmed'}]);expect(await evidence.reconcile(cancel)).toBe('unknown');await write([{...proof,cancelledAt:new Date().toISOString(),cancellationSource:'native_browser_confirmed'}]);expect(await evidence.reconcile(cancel)).toBe('confirmed');
});

it.each([
 {status:'unknown' as const,reason:'CONFIRMATION_VISIT_IN_PROGRESS'},
 {status:'unknown' as const,reason:'CONFIRMATION_RESPONSE_UNCERTAIN'},
 {status:'submitted' as const,reason:'CONFIRMATION_VISIT_AWAITING_INDEPENDENT_EVIDENCE'}
])('preserves $reason across repeated delivery checks without reopening activation',async activation=>{
 await write([proof]);const activationReceipt={...receipt,...activation};
 await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:activationReceipt};});
 expect(await confirm()).toMatchObject({real_mail_delivered:true,subscription_confirmed:false,duplicate:false});
 expect(await confirm()).toMatchObject({real_mail_delivered:true,subscription_confirmed:false,duplicate:true});
 const snapshot=await store.snapshot();expect(snapshot.operations[operationId].result?.receipt).toEqual(activationReceipt);expect(snapshot.events.map(e=>e.stage)).toEqual(['subscription_pending']);
 expect(await evidence.reconcile(action,operationId)).toBe('unknown');
});

it('requires fresh exact inactive-form proof for the GET-only confirmation state',async()=>{
 const updatedAt=new Date(Date.now()-1000).toISOString(),activation={...receipt,status:'submitted' as const,reason:'CONFIRMATION_VISIT_AWAITING_INDEPENDENT_EVIDENCE',updatedAt};
 await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:activation};});
 for(const bad of [
  {confirmationFormObservedAt:updatedAt},
  {confirmationFormObservedAt:'not-a-date',confirmationFormSource:'native_browser_form'},
  {confirmationFormObservedAt:new Date(Date.parse(updatedAt)-1).toISOString(),confirmationFormSource:'native_browser_form'}
 ]){await write([{...proof,...bad}]);expect(await confirm()).toMatchObject({subscription_confirmed:false});expect((await store.snapshot()).operations[operationId].result?.receipt).toEqual(activation);}
 const observed={...proof,confirmationFormObservedAt:new Date().toISOString(),confirmationFormSource:'native_browser_form'};
 await write([{...observed,recipient:'different@example.invalid'}]);expect(await confirm()).toMatchObject({real_mail_delivered:false,subscription_confirmed:false});expect((await store.snapshot()).operations[operationId].result?.receipt).toEqual(activation);
 await write([observed]);expect(await confirm()).toMatchObject({status:'confirmation_required',real_mail_delivered:true,subscription_confirmed:false});
 const pending=(await store.snapshot()).operations[operationId].result?.receipt;expect(pending).toMatchObject({status:'confirmation_required',reason:'NATIVE_CONFIRMATION_FORM_REQUIRED'});expect(await evidence.reconcile(action,operationId)).toBe('unknown');
 await confirm();expect((await store.snapshot()).operations[operationId].result?.receipt).toEqual(pending);expect((await store.snapshot()).events.map(e=>e.stage)).toEqual(['subscription_pending']);
});
it('does not let inactive-form proof erase an uncertain mutation response',async()=>{
 const activation={...receipt,status:'unknown' as const,reason:'CONFIRMATION_RESPONSE_UNCERTAIN'};await store.transaction(s=>{s.operations[operationId].result={...s.operations[operationId].result,receipt:activation};});
 await write([{...proof,confirmationFormObservedAt:new Date().toISOString(),confirmationFormSource:'native_browser_form'}]);await confirm();await confirm();expect((await store.snapshot()).operations[operationId].result?.receipt).toEqual(activation);expect(await evidence.reconcile(action,operationId)).toBe('unknown');expect((await store.snapshot()).events.map(e=>e.stage)).toEqual(['subscription_pending']);
});
