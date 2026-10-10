import {mkdir,readFile,writeFile,rename,rm,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export type Event={sourceEventId:string;occurredAt:string;action:'lookup'|'email_signup'|'email_cancel'|'schedule';stage:string;decision:string;requestId:string;delegateCheckId?:string;taskId?:string;occurrenceId?:string;outboundCallId?:string;effectId?:string;authorityVerified?:boolean;upstreamAgentDeclared?:boolean;latencyMs?:number;outcomeClass?:string;costClass?:string};
export type Operation={digest:string;owner:string;property:string;key:string;state:'pending'|'done';lookupId?:string;result?:Record<string,unknown>;effectId?:string;etag?:string;reported?:boolean;nextPollAt?:number;leaseUntil?:number};
export type State={version:1;operations:Record<string,Operation>;events:Event[]};
export interface Store {transaction<T>(fn:(state:State)=>Promise<T>|T):Promise<T>; snapshot():Promise<State>}
export class FileStore implements Store {
 private queue:Promise<unknown>=Promise.resolve();
 constructor(readonly file:string){}
 async snapshot():Promise<State>{try{return JSON.parse(await readFile(this.file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,operations:{},events:[]};throw e;}}
 async transaction<T>(fn:(state:State)=>Promise<T>|T):Promise<T>{
  const run=this.queue.then(()=>this.runTransaction(fn));this.queue=run.catch(()=>{});return run;
 }
 private async runTransaction<T>(fn:(state:State)=>Promise<T>|T):Promise<T>{
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  const lock=this.file+'.lock';
  try{await mkdir(lock,{mode:0o700});}catch{throw Error('STORE_BUSY');}
  try{const state=await this.snapshot();const result=await fn(state);const temp=this.file+'.'+randomUUID();await writeFile(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});await chmod(temp,0o600);await rename(temp,this.file);return result;}
  finally{await rm(lock,{recursive:true,force:true});}
 }
}
export class MemoryStore implements Store {
 state:State={version:1,operations:{},events:[]};private busy=false;
 async snapshot(){return structuredClone(this.state);}
 async transaction<T>(fn:(s:State)=>Promise<T>|T){if(this.busy)throw Error('STORE_BUSY');this.busy=true;try{const draft=structuredClone(this.state);const answer=await fn(draft);this.state=draft;return answer;}finally{this.busy=false;}}
}
