import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileJobStore,Runner,type Agreement} from '../src/index';
import {main} from '../src/cli';
const dirs:string[]=[];afterEach(async()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const agreement:Agreement={principalId:'person',agentId:'registered-agent',propertyId:'home-sam',grantReference:'original-grant',credentialEnv:'TEST_AGENT_CLIENT_SECRET',frequency:'daily',hour:8,minute:0,timezone:'Europe/London',startsAt:'2026-10-01T00:00Z',endsAt:'2026-11-01T00:00Z',agreed:true};
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'bins-worker-'));dirs.push(dir);const path=join(dir,'jobs');await new Runner(new FileJobStore(path),async()=>({kind:'completed',providerCalls:1})).create(agreement);vi.stubEnv('TEST_AGENT_CLIENT_SECRET','PRIVATE_CLIENT_SECRET');return path;}
it('runs finite recurring ticks, gets a fresh token each occurrence and transmits the original grant',async()=>{
 const path=await fixture();let now=Date.parse('2026-10-10T07:00Z'),tokens=0,calls=0;
 const fetcher:typeof fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/health'))return Response.json({mode:'fixture'});if(url.endsWith('/api/agent/token')){tokens++;expect(JSON.parse(init!.body as string).client_secret).toBe('PRIVATE_CLIENT_SECRET');return Response.json({access_token:'FRESH_'+tokens,delegate_id:'registered-agent'});}calls++;expect(JSON.parse(init!.body as string).grant_reference).toBe('original-grant');expect((init!.headers as any).Authorization).toBe('Bearer FRESH_'+tokens);return Response.json({result:{status:'done'},provider_calls:1});};
 expect(await main(['run-worker',path,'2','1000'],{fetcher,clock:()=>now,wait:async()=>{now+=86400000;}})).toMatchObject({ticks:2,executions:2,state_retained:true});expect(tokens).toBe(2);expect(calls).toBe(2);expect(await readFile(path,'utf8')).not.toContain('PRIVATE_CLIENT_SECRET');expect(await readFile(path,'utf8')).not.toContain('FRESH_');
});
it('exits on the stop signal without deleting persisted state',async()=>{
 const path=await fixture();const controller=new AbortController();const fetcher:typeof fetch=async()=>Response.json({mode:'fixture'});
 const result=await main(['run-worker',path,'3','1000'],{fetcher,signal:controller.signal,clock:()=>Date.parse('2026-10-01T00:00Z'),wait:async()=>controller.abort()});expect(result).toMatchObject({ticks:1,stopped:true,state_retained:true});expect(await new FileJobStore(path).list()).toHaveLength(1);
});
it('requires explicit live provider opt-in and rejects an unknown mode',async()=>{
 const path=await fixture();await expect(main(['tick',path],{fetcher:async()=>Response.json({mode:'live'})})).rejects.toThrow('explicit');await expect(main(['tick',path],{fetcher:async()=>Response.json({mode:'unknown'})})).rejects.toThrow('explicit');
 vi.stubEnv('WHENISBINS_RUNNER_ALLOW_LIVE','true');expect(await main(['tick',path],{clock:()=>Date.parse('2026-10-01T00:00Z'),fetcher:async()=>Response.json({mode:'live'})})).toEqual([]);
});
it('refuses to use a different agent identity and bounds worker configuration',async()=>{
 const path=await fixture();const fetcher:typeof fetch=async(input)=>String(input).endsWith('/health')?Response.json({mode:'fixture'}):Response.json({access_token:'OTHER_AGENT',delegate_id:'different-agent'});
 const result=await main(['tick',path],{fetcher,clock:()=>Date.parse('2026-10-10T07:00Z')}) as any[];expect(result[0].outcome.kind).toBe('refused');expect(result[0].outcome.code).toBe('AGENT_IDENTITY_MISMATCH');
 await expect(main(['run-worker',path,'0'])).rejects.toThrow('ticks');await expect(main(['run-worker',path,'1','0'])).rejects.toThrow('interval');
});
