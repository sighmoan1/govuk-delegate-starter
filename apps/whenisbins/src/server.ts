import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import defaultCatalogue from '../service-catalogue.json';
import {connectorHandler} from './service';
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
const handler=connectorHandler({delegateUrl:process.env.DELEGATE_INTERNAL_URL??'http://localhost:3300',serviceKey:process.env.WHENISBINS_SERVICE_KEY??'dev-whenisbins-service-key',properties,store,catalogue,provider:mode==='live'?new LiveProvider(true,process.env.WHENISBINS_API_TOKEN):new FixtureProvider(),opsKey:process.env.WHENISBINS_OPS_KEY??'dev-whenisbins-ops-key',publicMode:process.env.PUBLIC_MODE==='true'});
createServer(async(req,res)=>{
 try{let chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){await store.transaction(s=>{s.events.push({sourceEventId:randomUUID(),occurredAt:new Date().toISOString(),requestId:randomUUID(),action:'lookup',stage:'refused',decision:'REFUSED',outcomeClass:'INVALID_REQUEST'});});res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
 const body=Buffer.concat(chunks);const answer=await handler(new Request('http://localhost:'+port+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method??'GET')?{body}: {})}));res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(await answer.text());}catch{res.writeHead(503);res.end('Service unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('WhenIsBins connector: '+mode+' on loopback '+port));
