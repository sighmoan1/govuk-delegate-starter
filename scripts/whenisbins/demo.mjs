import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,open,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(new URL('../../',import.meta.url).pathname);
const state=resolve(root,'.whenisbins-demo');
const project='whenisbins-demo-'+createHash('sha256').update(root).digest('hex').slice(0,8);
const manager=resolve(root,'scripts/whenisbins/managed.mjs');
const owned=record=>{if(!record||typeof record!=='object'||!Number.isSafeInteger(record.pid)||record.marker!==manager)return false;try{const command=execFileSync('ps',['-p',String(record.pid),'-o','command='],{encoding:'utf8'});return command.includes(manager+' '+record.name+' ');}catch{return false;}};
const compose=['compose','-p',project,'-f','scripts/whenisbins/dependencies.yml'];
const inherited={...process.env};delete inherited.WHENISBINS_PROPERTIES_FILE;delete inherited.WHENISBINS_CATALOGUE_FILE;delete inherited.WHENISBINS_API_TOKEN;
const env={...inherited,PUBLIC_MODE:'false',DELEGATE_URL:'http://localhost:5700',DELEGATE_INTERNAL_URL:'http://localhost:5700',HMRC_URL:'http://localhost:5702',ONELOGIN_URL:'http://localhost:5701',WHENISBINS_URL:'http://127.0.0.1:5710',OIDC_CLIENT_ID:'delegate-dev-client',OIDC_ISSUER:'http://localhost:5701',OIDC_INTERNAL_URL:'http://localhost:5799',SIMULATOR_INTERNAL_URL:'http://localhost:5799',OIDC_PRIVATE_KEY_FILE:'../../dev/oidc-client-private.pem',SESSION_SECRET:'dev-only-session-secret-change-me-0123456789',AGENT_TOKEN_SECRET:'dev-agent-token-secret',DEMO_AGENT_CLIENT_ID:'demo-personal-agent',DEMO_AGENT_CLIENT_SECRET:'dev-demo-agent-secret',HMRC_SERVICE_KEY:'dev-hmrc-service-key',WHENISBINS_SERVICE_KEY:'dev-whenisbins-service-key',RESEARCH_FEED_ENABLED:'true',RESEARCH_FEED_KEY:'dev-research-feed-key',RESEARCH_PSEUDONYM_KEY:'dev-project-pseudonym-key',RESEARCH_INGEST_ENABLED:'true',OBSERVATORY_COLLECTION_KEY:'dev-whenisbins-observatory-key-20261010',WHENISBINS_CONNECTOR_RESEARCH_FEED_URL:'http://127.0.0.1:5710/api/research/events',WHENISBINS_CONNECTOR_RESEARCH_FEED_KEY:'dev-research-feed-key',HMRC_RESEARCH_FEED_URL:'http://localhost:5702/api/research/events',DELEGATE_RESEARCH_FEED_URL:'http://localhost:5700/api/research/events',DATABASE_URL:'postgresql://delegate:delegate@localhost:55435/delegate'};
const appEnv=app=>({...env,APP_URL:`http://localhost:${{delegate:5700,onelogin:5701,hmrc:5702,observatory:5703}[app]}`,DATABASE_URL:app==='observatory'?'postgresql://observatory:observatory@localhost:55435/observatory':`postgresql://delegate:delegate@localhost:55435/${app==='hmrc'?'hmrc':'delegate'}`});
const run=(cmd,args,extra={})=>new Promise((ok,no)=>{const child=spawn(cmd,args,{cwd:root,env:{...env,...extra},stdio:'inherit'});child.on('error',no);child.on('exit',code=>code===0?ok():no(Error(`${cmd} failed (${code})`)));});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await delay(500);}throw Error(`Service did not become ready: ${url}`);}
let pids=[];try{pids=JSON.parse(await readFile(resolve(state,'pids.json'),'utf8'));}catch{}
if(process.argv[2]==='stop'){
 for(const record of pids)if(owned(record))try{process.kill(-record.pid,'SIGTERM');}catch{}
 await rm(resolve(state,'pids.json'),{force:true});let managed=false;try{managed=(await readFile(resolve(state,'project'),'utf8'))===project;}catch{}if(managed)await run('docker',[...compose,'stop']);console.log('Stopped this demo; synthetic data retained.');
}else{
 for(const record of pids)if(owned(record))throw Error('This demo is already running.');pids=[];
 for(const port of [5700,5701,5702,5703,5710]){try{await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(500)});throw Error(`Port ${port} is already occupied. Stop its owner; this script will not replace it.`);}catch(e){if(String(e.message).includes('occupied'))throw e;}}
 await mkdir(state,{recursive:true,mode:0o700});await writeFile(resolve(state,'project'),project);await run('docker',[...compose,'up','-d']);
 // Prisma's first connection may precede fresh database initialisation.
 let migrated=false;for(let attempt=0;attempt<10&&!migrated;attempt++){try{for(const app of ['delegate','hmrc','observatory'])await run('npm',['run','db:migrate','-w',`apps/${app}`],appEnv(app));migrated=true;}catch{await delay(1000);}}if(!migrated)throw Error('Database startup failed');
 for(const app of ['delegate','onelogin','hmrc','observatory'])await run('npm',['run','build','-w',`apps/${app}`],appEnv(app));
 let seeded=false;try{await readFile(resolve(state,'seeded'));seeded=true;}catch{}
 if(!seeded){for(const app of ['delegate','hmrc'])await run('npm',['run','db:seed','-w',`apps/${app}`],appEnv(app));await writeFile(resolve(state,'seeded'),'synthetic only\n');}
 await run('npm',['run','catalogue:register','-w','apps/delegate'],{...appEnv('delegate'),SERVICE_CATALOGUE_FILE:'../whenisbins/service-catalogue.json',DEMO_SERVICE_NAME:'WhenIsBins connector',HMRC_SERVICE_KEY:env.WHENISBINS_SERVICE_KEY});
 async function launch(name,args,cwd,extra){const log=await open(resolve(state,name+'.log'),'a',0o600);const child=spawn(process.execPath,[manager,name,...args],{cwd,env:extra,detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();pids.push({pid:child.pid,name,marker:manager});await writeFile(resolve(state,'pids.json'),JSON.stringify(pids));await log.close();}
 for(const app of ['delegate','onelogin','hmrc','observatory'])await launch(app,[resolve(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',new URL(appEnv(app).APP_URL).port],resolve(root,'apps',app),appEnv(app));
 await launch('whenisbins',['--import','tsx',resolve(root,'apps/whenisbins/src/server.ts')],resolve(root,'apps/whenisbins'),{...env,PORT:'5710',WHENISBINS_MODE:'fixture',WHENISBINS_STATE_FILE:resolve(state,'connector.json')});
 for(const url of ['http://localhost:5700','http://localhost:5701','http://localhost:5702','http://localhost:5703/api/health','http://127.0.0.1:5710/health'])await ready(url);
 console.log('Synthetic demo ready: http://127.0.0.1:5710 · private Observatory http://localhost:5703/whenisbins');
}
