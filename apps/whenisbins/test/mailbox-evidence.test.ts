import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {actionHash} from '@prototype/whenisbins-email';
import {FileMailboxEvidence,confirmVerifiedMailbox} from '../src/mailbox-evidence';
import {MemoryStore} from '../src/store';
it('requires a received-message proof bound to the exact signup operation and records it once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wb-mailbox-proof-'));try{
 const file=join(dir,'proof.json'),evidence=new FileMailboxEvidence(file),store=new MemoryStore();
 const input={principal:'owned',agentId:'agent',grant:'grant',actKey:'signup-key'};
 const operationId=createHash('sha256').update(JSON.stringify(['email',input.principal,input.agentId,'subscribe_reminders',input.actKey])).digest('hex');
 const action={operation:'signup' as const,property:'Designated address',email:'designated@example.invalid',reminderChoice:'evening_before'};
 const resources={properties:[{id:'owned-property',subject:'owned-subject',label:'Designated',address:action.property,postcode:'ZZ1 1ZZ'}],mailboxes:[{id:'owned-mailbox',subject:'owned-subject',label:'Inbox',email:action.email}]};
 const receipt={operationId,actionHash:actionHash(action),status:'submitted' as const,reason:'NATIVE_SIGNUP_ACCEPTED',updatedAt:new Date().toISOString()};
 await store.transaction(s=>{s.operations[operationId]={digest:'payload',owner:input.principal,property:'owned-property',key:operationId,state:'pending',result:{grantId:input.grant,mailboxId:'owned-mailbox',receipt}};});
 expect(await confirmVerifiedMailbox({store,evidence,...resources},input)).toMatchObject({real_mail_delivered:false});
 const proof={operationId,actionHash:actionHash(action),source:'gmail_connector',messageId:'received-message',receivedAt:new Date().toISOString(),recipient:action.email,property:action.property,stopURL:'https://whenisbins.com/stop/private-token',delivered:true};
 await writeFile(file,JSON.stringify([{...proof,operationId:'different-operation'}]),{mode:0o600});
 expect(await confirmVerifiedMailbox({store,evidence,...resources},input)).toMatchObject({real_mail_delivered:false});
 await writeFile(file,JSON.stringify([{...proof,recipient:'another@example.invalid',property:'Other address'}]),{mode:0o600});
 expect(await confirmVerifiedMailbox({store,evidence,...resources},input)).toMatchObject({real_mail_delivered:false});
 expect((await store.snapshot()).events).toHaveLength(0);
 await writeFile(file,JSON.stringify([proof]),{mode:0o600});
 await expect(confirmVerifiedMailbox({store,evidence,...resources},{...input,principal:'another-person'})).rejects.toThrow('MAILBOX_OPERATION_NOT_OWNED');
 expect(await confirmVerifiedMailbox({store,evidence,...resources},input)).toMatchObject({real_mail_delivered:true,duplicate:false});
 expect(await confirmVerifiedMailbox({store,evidence,...resources},input)).toMatchObject({duplicate:true});
 const events=(await store.snapshot()).events;expect(events).toHaveLength(1);expect(events[0].authorityVerified).toBeUndefined();expect(JSON.stringify(events)).not.toContain('private-token');expect(JSON.stringify(events)).not.toContain(action.email);
 expect(await evidence.reconcile(action,operationId)).toBe('confirmed');expect(await evidence.reconcile(action,'different-operation')).toBe('unknown');
 await writeFile(file,JSON.stringify([{...proof,stopURL:'https://other.example/stop/private-token'}]));await expect(evidence.cancellationPath(action)).rejects.toThrow('INVALID_NATIVE_STOP_LINK');
 }finally{await rm(dir,{recursive:true,force:true});}
});
