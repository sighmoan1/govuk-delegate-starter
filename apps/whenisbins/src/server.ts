import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import defaultCatalogue from '../service-catalogue.json';
import {connectorHandler} from './service';
import {createResearchFeed} from './research';
import {createDemoHandler} from './demo';
import {createEmailHandler} from './email-service';
import {startEmailFixture} from '../../../packages/whenisbins-email/src/fixture';
import {chromium} from 'playwright';
import {FileStore} from './store';
import {FixtureProvider,LiveProvider,type Property} from './provider';
const mode=process.env.WHENISBINS_MODE??'fixture';
if(!['fixture','live'].includes(mode))throw Error('INVALID_PROVIDER_MODE');
if(mode==='live'&&process.env.WHENISBINS_LIVE_ENABLED!=='true')throw Error('LIVE_MODE_NOT_ENABLED');
if(mode==='live'&&!process.env.WHENISBINS_PROPERTIES_FILE)throw Error('LIVE_PROPERTIES_REQUIRED');
const properties=JSON.parse(await readFile(process.env.WHENISBINS_PROPERTIES_FILE??new URL('../properties.json',import.meta.url),'utf8')) as Property[];
if(mode==='live'&&properties.some(p=>p.postcode.startsWith('ZZ')))throw Error('SYNTHETIC_PROPERTY_CANNOT_BE_SENT_LIVE');
const catalogue=mode==='live'?JSON.parse(await readFile(process.env.WHENISBINS_CATALOGUE_FILE??'', 'utf8')):defaultCatalogue;
if(mode==='live'&&(catalogue.service!==defaultCatalogue.service||!Number.isSafeInteger(catalogue.version)||catalogue.version<=defaultCatalogue.version||catalogue.capabilities?.length!==1||catalogue.capabilities[0].code!=='read_collection_dates'))throw Error('LIVE_REQUIRES_NEW_READ_ONLY_CATALOGUE');
const stateFile=resolve(process.env.WHENISBINS_STATE_FILE??'.state/connector.json');const sealFile=stateFile+'.bindings';
await mkdir(dirname(sealFile),{recursive:true,mode:0o700});
const bindingKey=catalogue.service+':'+catalogue.version;const digest=createHash('sha256').update(JSON.stringify({mode,catalogue,properties})).digest('hex');
let seals:Record<string,string>={};try{seals=JSON.parse(await readFile(sealFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(seals[bindingKey]&&seals[bindingKey]!==digest)throw Error('PROPERTY_REBINDING_REQUIRES_NEW_CATALOGUE_VERSION');
if(!seals[bindingKey]){seals[bindingKey]=digest;await writeFile(sealFile,JSON.stringify(seals),{mode:0o600});}
const store=new FileStore(stateFile);
const port=Number(process.env.PORT??3310);
const lookup=connectorHandler({delegateUrl:process.env.DELEGATE_INTERNAL_URL??'http://localhost:3300',serviceKey:process.env.WHENISBINS_SERVICE_KEY??'dev-whenisbins-service-key',properties,store,catalogue,provider:mode==='live'?new LiveProvider(true,process.env.WHENISBINS_API_TOKEN):new FixtureProvider(),opsKey:process.env.WHENISBINS_OPS_KEY??'dev-whenisbins-ops-key',publicMode:process.env.PUBLIC_MODE==='true'});
const origin=process.env.WHENISBINS_URL??'http://127.0.0.1:'+port;
const delegateUrl=process.env.DELEGATE_INTERNAL_URL??'http://localhost:3300';
const fixture=mode==='fixture'?await startEmailFixture(stateFile+'.mailbox'):undefined;
const browser=fixture?await chromium.launch({headless:true}):undefined;
const email=fixture&&browser?createEmailHandler({delegateUrl,serviceKey:process.env.WHENISBINS_SERVICE_KEY??'dev-whenisbins-service-key',properties,store,catalogue,fixture,pageFactory:async()=>{const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);return {page,close:()=>context.close()};}}):undefined;
const feed=createResearchFeed(store);
const dispatch=async(request:Request,context?:{taskId:string;occurrenceId:string})=>new URL(request.url).pathname.startsWith('/api/reminders/')&&email?email(request):lookup(request,context);
const demo=createDemoHandler({mode:mode as 'fixture'|'live',publicMode:process.env.PUBLIC_MODE==='true',origin,delegateUrl,agentClientId:process.env.DEMO_AGENT_CLIENT_ID??'demo-personal-agent',agentClientSecret:process.env.DEMO_AGENT_CLIENT_SECRET??'dev-demo-agent-secret',stateFile:stateFile+'.demo',jobsFile:stateFile+'.jobs',catalogueVersion:catalogue.version,dispatch,recordSchedule:async evidence=>{await store.transaction(state=>{state.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'schedule',decision:'OBSERVED',stage:evidence.stage,taskId:evidence.taskId,occurrenceId:evidence.occurrenceId});});},confirmMailbox:async()=>{if(!fixture)throw Error('Fixture required');fixture.mailbox.confirm({operation:'signup',property:'synthetic-property-1',email:'sam.test@example.invalid',reminderChoice:'evening_before'});return {status:'confirmed',evidence:'simulated_inbox',real_mail_delivered:false};}});
const handler=async(request:Request)=>{const path=new URL(request.url).pathname;if(path==='/api/research/events')return feed(request);if(path==='/design.css'&&request.method==='GET')return new Response(await readFile(new URL('../../../styles/design.css',import.meta.url),'utf8'),{headers:{'content-type':'text/css'}});return await demo(request)??await dispatch(request);};
createServer(async(req,res)=>{
 try{let chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){await store.transaction(s=>{s.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'lookup',stage:'refused',decision:'REFUSED',outcomeClass:'INVALID_REQUEST'});});res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
 const body=Buffer.concat(chunks);const answer=await handler(new Request('http://localhost:'+port+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method??'GET')?{body}: {})}));res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(await answer.text());}catch{res.writeHead(503);res.end('Service unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('WhenIsBins connector: '+mode+' on loopback '+port));
