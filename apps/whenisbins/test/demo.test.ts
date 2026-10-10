import {designStylesheetHref} from '../src/assets';
import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDemoHandler,type DemoConfig} from '../src/demo';
const dirs:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function fixture(overrides:Partial<DemoConfig>={}){
 const dir=await mkdtemp(join(tmpdir(),'bins-demo-'));dirs.push(dir);const handler=createDemoHandler({mode:'fixture',origin:'http://127.0.0.1:5710',delegateUrl:'http://localhost:5700',agentClientId:'demo-personal-agent',agentClientSecret:'NEVER_SHOW_THIS_SECRET',stateFile:join(dir,'sessions'),jobsFile:join(dir,'jobs'),dispatch:async()=>Response.json({}),...overrides});return {handler,dir};
}
function request(path:string,options:RequestInit={}){return new Request('http://127.0.0.1:5710'+path,options);}
it('hides fixture portal in live/public modes and declines unrelated routes',async()=>{
 for(const overrides of [{mode:'live' as const},{publicMode:true}]){const {handler}=await fixture(overrides);expect((await handler(request('/')))?.status).toBe(404);}
 const {handler}=await fixture();expect(await handler(request('/api/collections'))).toBeNull();
});
it('rejects missing sessions, cross-origin writes and forged CSRF values',async()=>{
 const {handler}=await fixture();expect((await handler(request('/demo/prepare',{method:'POST'})))?.status).toBe(403);
 const page=(await handler(request('/')))!;const cookie=page.headers.get('set-cookie')!.split(';')[0];
 for(const origin of ['https://other.example','http://127.0.0.1:5710']){const response=await handler(request('/demo/prepare',{method:'POST',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:'journey=lookup&csrf=forged'}));expect(response?.status).toBe(403);}
 expect(cookie).toMatch(/^bins-demo=/);expect(page.headers.get('set-cookie')).toContain('HttpOnly');
});
it('uses retained private agent credentials, keeps capability requests bounded and restores sessions',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,body:JSON.parse(init.body as string)});if(url.endsWith('/api/agent/token'))return Response.json({access_token:'NEVER_SHOW_THIS_TOKEN',delegate_id:'registered-agent'});return Response.json({id:'request-1',consent_url:'http://localhost:5700/consent/request-1'});});
 const {handler,dir}=await fixture();const page=(await handler(request('/')))!;const html=await page.text();expect(html).toContain('href="'+designStylesheetHref+'"');expect(html).not.toContain('href="/design.css"');const csrf=html.match(/name="csrf" value="([^"]+)"/)![1],cookie=page.headers.get('set-cookie')!.split(';')[0];
 const response=await handler(request('/demo/prepare',{method:'POST',headers:{origin:'http://127.0.0.1:5710',cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,journey:'lookup'})}));const out=await response!.text();expect(out).toContain('Review permissions');expect(out).not.toContain('NEVER_SHOW_THIS');expect(calls[1].body).toMatchObject({service:'whenisbins-connector',catalogue_version:2,capabilities:['read_collection_dates'],constraints:{read_collection_dates:{property_id:['home-sam']}}});
 const restarted=createDemoHandler({mode:'fixture',origin:'http://127.0.0.1:5710',delegateUrl:'http://localhost:5700',agentClientId:'agent',agentClientSecret:'secret',stateFile:join(dir,'sessions'),jobsFile:join(dir,'jobs'),dispatch:async()=>Response.json({})});expect(await (await restarted(request('/',{headers:{cookie}})))!.text()).toContain('request-1');
});
it('uses only persisted runner task/occurrence identity and tolerates observation failures',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/api/agent/token')?Response.json({access_token:'PRIVATE_TOKEN',delegate_id:'registered-agent'}):url.includes('/api/authorisation-requests/')?Response.json({status:'APPROVED',principal_id:'sam',authorisation_id:'original-grant'}):Response.json({id:'schedule-request',consent_url:'http://localhost:5700/consent/schedule-request'}));
 const contexts:any[]=[],events:any[]=[];
 const {handler}=await fixture({dispatch:async(req,context)=>{contexts.push(context);expect((await req.json()).grant_reference).toBe('original-grant');return Response.json({result:{status:'done'}});},recordSchedule:async event=>{events.push(event);throw Error('Observation sink unavailable');}});
 const page=(await handler(request('/')))!;const csrf=(await page.text()).match(/name="csrf" value="([^"]+)"/)![1],cookie=page.headers.get('set-cookie')!.split(';')[0];
 const post=(path:string,body:Record<string,string>={})=>handler(request(path,{method:'POST',headers:{origin:'http://127.0.0.1:5710',cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,...body})}));
 expect((await post('/demo/prepare',{journey:'schedule'}))?.status).toBe(200);
 expect((await post('/demo/schedule',{agreed:'true'}))?.status).toBe(200);
 const tick=await post('/demo/tick');expect(tick?.status).toBe(200);expect(await tick!.text()).toContain('completed');
 expect(events).toHaveLength(2);expect(events[0]).toMatchObject({stage:'schedule_registered'});expect(events[1]).toMatchObject({stage:'scheduled_occurrence',taskId:events[0].taskId,occurrenceId:contexts[0].occurrenceId});
 expect(contexts[0].taskId).toMatch(/^[0-9a-f-]{36}$/);expect(contexts[0].occurrenceId).toMatch(new RegExp('^'+contexts[0].taskId+':\\d{4}-\\d{2}-\\d{2}$'));
});
it('binds simulated mailbox confirmation to the approved session, original grant and actual registered agent',async()=>{
 let approved=false;const confirmed:any[]=[];
 vi.stubGlobal('fetch',async(url:string)=>url.endsWith('/api/agent/token')?Response.json({access_token:'PRIVATE_TOKEN',delegate_id:'actual-registered-agent'}):url.includes('/api/authorisation-requests/')?Response.json(approved?{status:'APPROVED',principal_id:'approved-person',authorisation_id:'original-approved-grant'}:{status:'PENDING'}):Response.json({id:'email-request',consent_url:'http://localhost:5700/consent/email-request'}));
 const {handler,dir}=await fixture({confirmMailbox:async context=>{confirmed.push(context);return {status:'confirmed',token:'DO_NOT_SHOW_PRIVATE_TOKEN'};}});
 const page=(await handler(request('/')))!;const csrf=(await page.text()).match(/name="csrf" value="([^"]+)"/)![1],cookie=page.headers.get('set-cookie')!.split(';')[0];
 const post=(path:string,body:Record<string,string>={})=>handler(request(path,{method:'POST',headers:{origin:'http://127.0.0.1:5710',cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,...body})}));
 await post('/demo/prepare',{journey:'email'});await post('/demo/mailbox-confirm');expect(confirmed).toHaveLength(0);
 approved=true;const response=(await post('/demo/mailbox-confirm'))!;expect(response.status).toBe(200);expect(await response.text()).not.toContain('DO_NOT_SHOW_PRIVATE_TOKEN');
 const sessions=JSON.parse(await (await import('node:fs/promises')).readFile(join(dir,'sessions'),'utf8'));const id=cookie.slice('bins-demo='.length);
 expect(confirmed).toEqual([{sessionId:id,principal:'approved-person',grant:'original-approved-grant',actKey:sessions[id].actKey,agentId:'actual-registered-agent'}]);
});
