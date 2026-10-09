import { test, expect, type Page } from "@playwright/test";
const DELEGATE=process.env.DELEGATE_URL??"http://localhost:3300", COUNCIL=process.env.COUNCIL_URL??"http://localhost:3305", HMRC=process.env.HMRC_URL??"http://localhost:3302";
test("generic citizen consent authorises council independently, then revokes without affecting HMRC",async({page})=>{
 const tok=await(await fetch(`${DELEGATE}/api/agent/token`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:"demo-personal-agent",client_secret:process.env.DEMO_AGENT_CLIENT_SECRET??"dev-demo-agent-secret"})})).json();
 async function consent(service:string,capability:string){
  const request=await(await fetch(`${DELEGATE}/api/authorisation-requests`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${tok.access_token}`},body:JSON.stringify({service,capabilities:[capability]})})).json();
  await page.goto(request.consent_url);
  if(new URL(page.url()).pathname==="/sign-in") {await page.getByRole("button",{name:"Continue"}).click();await page.getByRole("button",{name:"Continue"}).click();}
  const box=page.getByRole("checkbox"); await expect(box).not.toBeChecked(); await box.check();
  await page.getByRole("button",{name:"Continue"}).click();await page.getByRole("button",{name:"Allow",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Agent authorised"})).toBeVisible();
  await page.getByRole("link",{name:"View this authority"}).click();const mandate=page.url().split("/").pop()!;
  const status=await(await fetch(`${DELEGATE}/api/authorisation-requests/${request.id}`,{headers:{authorization:`Bearer ${tok.access_token}`}})).json();
  return {mandate,principal:status.principal_id};
 }
 const hmrc=await consent("hmrc-personal-tax","view_tax_code");
 const headers={authorization:`Bearer ${tok.access_token}`,"x-principal-id":hmrc.principal};
 const call=()=>fetch(`${COUNCIL}/api/cases/status?reference=CASE-SAM`,{headers});
 expect((await call()).status).toBe(403);
 const council=await consent("council-casework","view_case_status");expect(council.principal).toBe(hmrc.principal);
 const result=await call();expect(result.status).toBe(200);expect(await result.json()).toMatchObject({decision:"ALLOW",result:{reference:"CASE-SAM"}});
 expect((await fetch(`${COUNCIL}/api/cases/status?reference=CASE-OTHER`,{headers})).status).toBe(404);
 await page.goto(`${DELEGATE}/account/delegates/${council.mandate}`);await page.getByRole("link",{name:/Remove access/}).click();await page.getByRole("button",{name:"Remove access"}).click();
 expect((await call()).status).toBe(403);expect((await fetch(`${HMRC}/api/tax-code`,{headers})).status).toBe(200);
});
