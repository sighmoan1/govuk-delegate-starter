import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import defaultCatalogue from '../service-catalogue.json';
import {connectorHandler} from './service';
import {createResearchFeed} from './research';
import {createDemoHandler} from './demo';
import {createLivePresenter} from './live';
import {publicEvidenceHandler} from './public-evidence';
import {publicAssetHandler,writeHttpResponse} from './assets';
import {createEmailHandler,confirmOwnedMailbox,type Mailbox,type LiveEmailBackend} from './email-service';
import {FileMailboxEvidence,confirmVerifiedMailbox} from './mailbox-evidence';
import {startEmailFixture} from '../../../packages/whenisbins-email/src/fixture';
import type {EmailReceipt} from '@prototype/whenisbins-email';
import {chromium} from 'playwright';
import {FileStore} from './store';
import {FixtureProvider,LiveProvider,type Property} from './provider';
const mode=process.env.WHENISBINS_MODE??'fixture',publicMode=process.env.PUBLIC_MODE==='true';
if(!['fixture','live'].includes(mode))throw Error('INVALID_PROVIDER_MODE');
if(mode==='live'&&process.env.WHENISBINS_LIVE_ENABLED!=='true')throw Error('LIVE_MODE_NOT_ENABLED');
if(mode==='live'&&(!process.env.WHENISBINS_PROPERTIES_FILE||!process.env.WHENISBINS_CATALOGUE_FILE))throw Error('LIVE_PRIVATE_CONFIGURATION_REQUIRED');
const properties=JSON.parse(await readFile(process.env.WHENISBINS_PROPERTIES_FILE??new URL('../properties.json',import.meta.url),'utf8')) as Property[];
const mailboxes=mode==='live'&&process.env.WHENISBINS_MAILBOXES_FILE?JSON.parse(await readFile(process.env.WHENISBINS_MAILBOXES_FILE,'utf8')) as Mailbox[]:undefined;
if(!Array.isArray(properties)||!properties.length||properties.some(p=>!p.id||!p.subject||!p.address||!p.postcode))throw Error('INVALID_PROPERTY_CONFIGURATION');
if(mode==='live'&&properties.some(p=>p.postcode.startsWith('ZZ')))throw Error('SYNTHETIC_PROPERTY_CANNOT_BE_SENT_LIVE');
const catalogue=mode==='live'?JSON.parse(await readFile(process.env.WHENISBINS_CATALOGUE_FILE!, 'utf8')) as typeof defaultCatalogue:defaultCatalogue;
const liveCapabilities=['read_collection_dates','subscribe_reminders','cancel_reminders'];
if(mode==='live'&&(catalogue.service!==defaultCatalogue.service||!Number.isSafeInteger(catalogue.version)||catalogue.version<=defaultCatalogue.version||!catalogue.capabilities.length||catalogue.capabilities.some(c=>!liveCapabilities.includes(c.code))))throw Error('LIVE_REQUIRES_NEW_SCOPED_CATALOGUE');
if(mode==='live'&&catalogue.capabilities.some(c=>c.code!=='read_collection_dates')&&(!mailboxes?.length||mailboxes.some(m=>!m.id||!m.subject||!m.email)))throw Error('LIVE_MAILBOX_CONFIGURATION_REQUIRED');
const stateFile=resolve(process.env.WHENISBINS_STATE_FILE??'.state/connector.json'),sealFile=stateFile+'.bindings';
await mkdir(dirname(sealFile),{recursive:true,mode:0o700});
const bindingKey=catalogue.service+':'+catalogue.version,digest=createHash('sha256').update(JSON.stringify({mode,catalogue,properties,...(mailboxes?{mailboxes}:{})})).digest('hex');
let seals:Record<string,string>={};try{seals=JSON.parse(await readFile(sealFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(seals[bindingKey]&&seals[bindingKey]!==digest)throw Error('PROPERTY_REBINDING_REQUIRES_NEW_CATALOGUE_VERSION');
if(!seals[bindingKey]){seals[bindingKey]=digest;await writeFile(sealFile,JSON.stringify(seals),{mode:0o600});}
const store=new FileStore(stateFile),port=Number(process.env.PORT??3310);
const origin=process.env.WHENISBINS_URL??'http://127.0.0.1:'+port,delegateUrl=process.env.DELEGATE_INTERNAL_URL??'http://localhost:3300';
const agentClientId=process.env.WHENISBINS_AGENT_CLIENT_ID??process.env.DEMO_AGENT_CLIENT_ID??'demo-personal-agent',agentClientSecret=process.env.WHENISBINS_AGENT_CLIENT_SECRET??process.env.DEMO_AGENT_CLIENT_SECRET??'dev-demo-agent-secret';
if(mode==='live'&&publicMode&&[process.env.WHENISBINS_SERVICE_KEY,agentClientSecret,process.env.WHENISBINS_PRESENTER_CODE_HASH].some(v=>!v||v.length<32))throw Error('LIVE_PRIVATE_CREDENTIALS_REQUIRED');
const lookup=connectorHandler({delegateUrl,serviceKey:process.env.WHENISBINS_SERVICE_KEY??'dev-whenisbins-service-key',properties,store,catalogue,provider:mode==='live'?new LiveProvider(true,process.env.WHENISBINS_API_TOKEN):new FixtureProvider(),opsKey:process.env.WHENISBINS_OPS_KEY??'dev-whenisbins-ops-key',publicMode});
const fixture=mode==='fixture'?await startEmailFixture(stateFile+'.mailbox'):undefined;
const browser=fixture||mailboxes?.length?await chromium.launch({headless:true}):undefined;
const evidence=new FileMailboxEvidence(process.env.WHENISBINS_MAILBOX_EVIDENCE_FILE??stateFile+'.mailbox-evidence');
let liveEmail:LiveEmailBackend|undefined;
if(mode==='live'&&mailboxes?.length){
 const native=await import('@prototype/whenisbins-email') as unknown as {executeWhenIsBinsEmailWorkflow?:(input:unknown)=>Promise<EmailReceipt>};
 if(typeof native.executeWhenIsBinsEmailWorkflow!=='function')throw Error('NATIVE_EMAIL_ADAPTER_REQUIRED');
 liveEmail={mode:'live',declaresAgent:true,confirmationPath:(action,operationId)=>evidence.confirmationPath(action,operationId),reconcile:(action,operationId)=>evidence.reconcile(action,operationId),cancellationPath:action=>evidence.cancellationPath(action),execute:input=>native.executeWhenIsBinsEmailWorkflow!({...input,designated:{postcode:input.property.postcode,address:input.property.address,propertyId:input.property.propertyId,email:input.action.email},reconcile:()=>evidence.reconcile(input.action,input.operationId)})};
}
const email=browser&&(fixture||liveEmail)?createEmailHandler({delegateUrl,serviceKey:process.env.WHENISBINS_SERVICE_KEY??'dev-whenisbins-service-key',properties,mailboxes,store,catalogue,fixture,live:liveEmail,pageFactory:async()=>{const context=await browser.newContext(mode==='live'?{extraHTTPHeaders:{'X-Agent':'Delegate-WhenIsBins-connector'}}:{});const page=await context.newPage();return {page,close:async()=>{if(mode==='live'&&process.env.WHENISBINS_CAPTURE_PRIVATE_EVIDENCE==='true')try{await writeFile(stateFile+'.native-page.json',JSON.stringify({at:new Date().toISOString(),url:page.url(),html:await page.content()}),{mode:0o600});}catch{}await context.close();}};}}):undefined;
const dispatch=async(request:Request,context?:{taskId:string;occurrenceId:string})=>new URL(request.url).pathname.startsWith('/api/reminders/')&&email?email(request):lookup(request,context);
const recordSchedule=async(e:{stage:'schedule_registered'|'scheduled_occurrence';taskId:string;occurrenceId?:string})=>{await store.transaction(s=>{s.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'schedule',decision:'OBSERVED',stage:e.stage,taskId:e.taskId,occurrenceId:e.occurrenceId});});};
const demo=createDemoHandler({mode:mode as 'fixture'|'live',publicMode,origin,delegateUrl,agentClientId,agentClientSecret,stateFile:stateFile+'.demo',jobsFile:stateFile+'.jobs',catalogueVersion:catalogue.version,dispatch,recordSchedule,confirmMailbox:async context=>{if(!fixture)throw Error('Fixture required');return confirmOwnedMailbox({store,fixture},context);}});
const syntheticSigninDetails=async()=>{
 const url=new URL(process.env.ONELOGIN_INTERNAL_URL??'http://127.0.0.1:3301');
 if(url.protocol!=='http:'||!['onelogin','127.0.0.1','localhost'].includes(url.hostname)||url.port!=='3301'||!process.env.DEMO_CONSOLE_KEY)throw Error('PRIVATE_TEST_SIGNIN_UNAVAILABLE');
 const response=await fetch(url.origin+'/api/demo/sam',{headers:{'x-demo-key':process.env.DEMO_CONSOLE_KEY},redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('PRIVATE_TEST_SIGNIN_UNAVAILABLE');const b=await response.json();
 if(b.strict!==true||typeof b.email!=='string'||typeof b.password!=='string'||(b.code!==null&&!/^\d{6}$/.test(b.code)))throw Error('PRIVATE_TEST_SIGNIN_UNAVAILABLE');
 return {email:b.email,password:b.password,code:b.code,sentAt:b.sent_at??null};
};
const live=mode==='live'?createLivePresenter({syntheticSigninDetails,origin,delegateInternalUrl:delegateUrl,delegatePublicUrl:process.env.DELEGATE_PUBLIC_URL??delegateUrl,agentClientId,agentClientSecret,accessCodeHash:process.env.WHENISBINS_PRESENTER_CODE_HASH??'',stateFile:stateFile+'.live',jobsFile:stateFile+'.live-jobs',catalogueVersion:catalogue.version,property:{id:properties[0].id,label:properties[0].label},mailbox:email&&mailboxes?{id:mailboxes[0].id,label:mailboxes[0].label}:undefined,evidenceStatus:process.env.WHENISBINS_EVIDENCE_STATUS??'Live verification is in progress. No completed journey is claimed here.',publicEvidenceLinks:[{label:'Concept and design briefings',url:process.env.ABOUT_PUBLIC_URL??'https://about-demo.bathos.org/briefing'},...(process.env.WHENISBINS_EVIDENCE_URL?[{label:'Verified live tests and remaining work',url:process.env.WHENISBINS_EVIDENCE_URL}]:[]),{label:'WhenIsBins API guide',url:'https://whenisbins.com/v1/guide'}],dispatch,recordSchedule,checkMailbox:context=>confirmVerifiedMailbox({store,evidence,properties,mailboxes:mailboxes??[]},context)}):undefined;
const feed=createResearchFeed(store),privateFeed=createResearchFeed(store,{...process.env,PUBLIC_MODE:'false',RESEARCH_FEED_ENABLED:process.env.WHENISBINS_RESEARCH_FEED_ENABLED??process.env.RESEARCH_FEED_ENABLED});
const handler=async(request:Request)=>{const path=new URL(request.url).pathname;const reviewedEvidence=await publicEvidenceHandler(request,mode==='live'&&process.env.WHENISBINS_VERIFIED_EVIDENCE_PUBLISHED==='true');if(reviewedEvidence)return reviewedEvidence;if(publicMode&&(path.startsWith('/ops/')||path.startsWith('/api/research/')||path.startsWith('/demo/')))return new Response('Not found',{status:404});if(path==='/api/research/events')return feed(request);const asset=await publicAssetHandler(request);if(asset)return asset;return await live?.handler(request)??await demo(request)??await dispatch(request);};
const serve=(run:(request:Request)=>Promise<Response>,requestOrigin:string)=>async(req:IncomingMessage,res:ServerResponse)=>{
 try{const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){await store.transaction(s=>{s.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'lookup',stage:'refused',decision:'REFUSED',outcomeClass:'INVALID_REQUEST'});});res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);const body=Buffer.concat(chunks);
 const answer=await run(new Request(new URL(req.url??'/',requestOrigin),{method:req.method,headers,...(!['GET','HEAD'].includes(req.method??'GET')?{body}: {})}));await writeHttpResponse(answer,res,req.method==='HEAD');}catch{res.writeHead(503,{'Cache-Control':'no-store'});res.end('Service unavailable');}
};
const listenHost=process.env.WHENISBINS_LISTEN_HOST??'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(listenHost))throw Error('INVALID_LISTEN_HOST');
const server=createServer(serve(handler,origin)).listen(port,listenHost,()=>console.log('WhenIsBins connector: '+mode));
const privateServer=mode==='live'&&process.env.WHENISBINS_RESEARCH_PORT?createServer(serve(request=>new URL(request.url).pathname==='/api/research/events'?privateFeed(request):Promise.resolve(new Response('Not found',{status:404})),'http://localhost:'+process.env.WHENISBINS_RESEARCH_PORT)).listen(Number(process.env.WHENISBINS_RESEARCH_PORT),listenHost):undefined;
let workerBusy=false;
const worker=live&&process.env.WHENISBINS_WORKER_ENABLED==='true'?setInterval(()=>{if(workerBusy)return;workerBusy=true;void live.tickAll().catch(()=>console.error('Scheduled worker unavailable; no completed check claimed.')).finally(()=>{workerBusy=false;});},30000):undefined;
const shutdown=async()=>{if(worker)clearInterval(worker);setTimeout(()=>process.exit(0),5000).unref();server.close();privateServer?.close();await browser?.close();await fixture?.close();};
process.once('SIGTERM',()=>{void shutdown().finally(()=>process.exit(0));});process.once('SIGINT',()=>{void shutdown().finally(()=>process.exit(0));});
