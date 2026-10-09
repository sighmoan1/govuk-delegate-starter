// Presenter-operated client for the isolated synthetic prototype. Node 20+.
// Consent and revocation remain in the citizen's browser. No database reset.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const [command, statePath] = process.argv.slice(2);
const local = value => {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.username || u.password) throw Error('Use an HTTP loopback address for the synthetic stack.');
  return u.origin;
};
const print = value => console.log(JSON.stringify(value,null,2));
async function call(base,route,token,options={}) {
  const response = await fetch(base+route,{redirect:'error',signal:AbortSignal.timeout(15000),...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
  const body = await response.json();
  return {status:response.status,body};
}
const expect = (result,status,reason) => {
  if(result.status !== status || (reason && result.body.reason !== reason)) throw Error(`Expected ${status}${reason?' '+reason:''}; received ${result.status} ${result.body.reason ?? result.body.error ?? 'unexpected response'}.`);
  return result.body;
};
async function token(base) {
  const result=await call(base,'/api/agent/token',null,{method:'POST',body:JSON.stringify({client_id:process.env.DEMO_AGENT_ID ?? 'demo-personal-agent',client_secret:process.env.DEMO_AGENT_SECRET ?? 'dev-demo-agent-secret'})});
  const body=expect(result,200);if(typeof body.access_token !== 'string')throw Error('No agent token returned.');return body.access_token;
}
async function load() {
  if(!statePath)throw Error('Supply the private state-file path printed by prepare.');
  const stat=await fs.lstat(statePath);if(!stat.isFile() || (stat.mode&0o077))throw Error('State must be a regular owner-only file (mode 600).');
  const state=JSON.parse(await fs.readFile(statePath,'utf8'));state.delegate=local(state.delegate);state.hmrc=local(state.hmrc);
  if(typeof state.requestId!=='string'||typeof state.operationKey!=='string')throw Error('Invalid demo state.');return state;
}
try {
  if(command==='prepare') {
    if(statePath)throw Error('Prepare creates a fresh private state file; no path argument is needed.');
    const delegate=local(process.env.DEMO_DELEGATE_URL ?? 'http://localhost:3300');
    const hmrc=local(process.env.DEMO_HMRC_URL ?? 'http://localhost:3302');
    const access=await token(delegate);
    const request=expect(await call(delegate,'/api/authorisation-requests',access,{method:'POST',body:JSON.stringify({service:'hmrc-personal-tax',capabilities:['view_tax_code','claim_job_expenses','update_employment']})}),201);
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'delegate-briefing-'));await fs.chmod(dir,0o700);
    const file=path.join(dir,'state.json');
    await fs.writeFile(file,JSON.stringify({delegate,hmrc,requestId:request.id,operationKey:'briefing-'+randomUUID()}),{mode:0o600,flag:'wx'});
    print({state_file:file,consent_url:request.consent_url,instructions:'Open the consent URL. Choose tax code and job expenses; leave employment changes unchecked. Allow access, then run act with this state file.'});
  } else if(['status','act','after-revoke'].includes(command)) {
    const state=await load(),access=await token(state.delegate);
    const request=expect(await call(state.delegate,'/api/authorisation-requests/'+encodeURIComponent(state.requestId),access),200);
    if(command==='status')print({status:request.status,granted_capabilities:request.granted_capabilities ?? []});
    else {
      if(request.status!=='APPROVED'||!request.principal_id)throw Error('The citizen has not approved this request.');
      const headers={'x-principal-id':request.principal_id};
      if(command==='after-revoke') {
        const result=await call(state.hmrc,'/api/tax-code',access,{headers});expect(result,403,'AUTHORISATION_REVOKED');
        print({step:'Tax code after removal',...result});
      } else {
        const grants=request.granted_capabilities ?? [];
        if(!grants.includes('view_tax_code')||!grants.includes('claim_job_expenses')||grants.includes('update_employment'))throw Error('This demo needs tax-code and job-expenses permission with employment changes excluded. Start a fresh request if necessary.');
        const tax=await call(state.hmrc,'/api/tax-code',access,{headers});expect(tax,200);print({step:'Read tax code',...tax});
        const claim=await call(state.hmrc,'/api/job-expenses',access,{method:'POST',headers:{...headers,'Idempotency-Key':state.operationKey},body:'{}'});expect(claim,200);print({step:'Submit one synthetic claim (same operation key on rerun)',...claim});
        const employment=await call(state.hmrc,'/api/employment',access,{method:'POST',headers,body:JSON.stringify({details:'Synthetic briefing employment update'})});expect(employment,403,'PERMISSION_MISSING');print({step:'Attempt excluded employment change',...employment});
        print({instructions:'Inspect the account outcome, remove access in the browser, then run after-revoke with the same state file.'});
      }
    }
  } else if(command==='clean') {await load();await fs.unlink(statePath);console.log('Private demo state removed. Citizen consent and recorded history remain.');}
  else console.log('Usage: node scripts/briefings/demo.mjs prepare | status STATE | act STATE | after-revoke STATE | clean STATE\nUse DEMO_DELEGATE_URL / DEMO_HMRC_URL for isolated loopback ports. Custom seed credentials: DEMO_AGENT_ID / DEMO_AGENT_SECRET.');
} catch(error) {console.error(error.message);process.exitCode=1;}
