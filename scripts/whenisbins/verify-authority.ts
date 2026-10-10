import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import catalogue from "../../apps/whenisbins/service-catalogue.json";
async function main() {
const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:5700", BINS = process.env.WHENISBINS_URL ?? "http://127.0.0.1:5710";
if (process.env.WHENISBINS_TEST_ISOLATED !== "true" || !process.env.DATABASE_URL) throw Error("Explicit isolated test configuration required; no shared database or reset is used");
const health = await (await fetch(`${BINS}/health`)).json();
assert.equal(health.mode, "fixture", "Verification must never contact a live provider");
const { prisma } = await import("../../apps/delegate/src/lib/db");
const { hashSecret } = await import("../../apps/delegate/src/lib/secrets");
const { signAgentToken } = await import("../../apps/delegate/src/lib/agent-auth");
const { approveRequest } = await import("../../apps/delegate/src/lib/requests");
const subject = "urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw=";
const sam = await prisma.principal.findUniqueOrThrow({ where: { oneLoginSubjectId: subject } });
const service = await prisma.service.findUniqueOrThrow({ where: { slug: "whenisbins-connector" } });
const opsHeaders = { "x-ops-key": process.env.WHENISBINS_OPS_KEY ?? "dev-whenisbins-ops-key" };
const events = async () => { const r = await fetch(`${BINS}/ops/events`, { headers: opsHeaders }); assert.equal(r.status, 200); return (await r.json()).events as any[]; };
let passed = 0;
try {
 for (const scenario of ["authorised", "undelegated", "revoked", "expired", "unknown-delegate", "missing-relationship", "wrong-property"] as const) {
  const secret = randomUUID(), id = `test-whenisbins-${randomUUID()}`;
  const agent = await prisma.delegate.create({ data: { name: "Synthetic verification agent", type: "SOFTWARE_AGENT", provider: "isolated test fixture", clientId: id, clientSecretHash: hashSecret(secret), redirectUris: [] } });
  const tokenResponse = await fetch(`${DELEGATE}/api/agent/token`, { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({client_id:id,client_secret:secret}) });
  assert.equal(tokenResponse.status, 200); let token = (await tokenResponse.json()).access_token as string; let grantReference:string|undefined;
  if (!["undelegated", "unknown-delegate", "missing-relationship"].includes(scenario)) {
   const response = await fetch(`${DELEGATE}/api/authorisation-requests`, { method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${token}`}, body:JSON.stringify({service:service.slug,catalogue_version:catalogue.version,capabilities:["read_collection_dates"],constraints:{read_collection_dates:{property_id:["home-sam"]}}}) });
   assert.equal(response.status,201); const request=await response.json(); const auth=await approveRequest(request.id,sam.id);grantReference=auth.id;
   if(scenario==="revoked") await prisma.authorisation.update({where:{id:auth.id},data:{status:"REVOKED",revokedAt:new Date()}});
   if(scenario==="expired") await prisma.authorisation.update({where:{id:auth.id},data:{validUntil:new Date(Date.now()-60000)}});
  }
  if(scenario==="unknown-delegate") token=await signAgentToken(randomUUID(),"missing-client");
  const before=await events(); const headers:Record<string,string>={"content-type":"application/json","x-principal-id":sam.id,"Idempotency-Key":`verify-${randomUUID()}`}; if(scenario!=="undelegated") headers.authorization=`Bearer ${token}`;
  const response=await fetch(`${BINS}/api/collections`,{method:"POST",headers,body:JSON.stringify({grant_reference:grantReference,property_id:scenario==="wrong-property"?"home-other":"home-sam"})}); const result=await response.json();
  assert.equal(response.status,scenario==="authorised"?200:scenario==="undelegated"?401:403,`${scenario}: ${JSON.stringify(result)}`);
  if(scenario==="authorised") assert.equal(result.result.status,"done");
  else assert.equal(result.reason,({undelegated:"AGENT_IDENTITY_REQUIRED",revoked:"AUTHORISATION_REVOKED",expired:"AUTHORISATION_EXPIRED","unknown-delegate":"UNKNOWN_DELEGATE","missing-relationship":"NO_AUTHORISATION","wrong-property":"PROPERTY_SCOPE_REFUSED"} as const)[scenario],`${scenario} must fail for the intended reason`);
  const after=await events(); assert.ok(after.length>before.length,`${scenario} creates activity evidence`);
  if(scenario!=="authorised") assert.equal(after.slice(before.length).filter(e=>e.outboundCallId).length,0,`${scenario} makes no provider call`);
  const check=result.delegate_check_id; if(check) assert.ok(await prisma.activityEvent.findUnique({where:{id:check}}),`${scenario} records Delegate check`);
  passed++; console.log(`PASS ${scenario}: activity recorded; ${scenario==="authorised"?"fixture lookup completed":"no provider call"}`);
 }
 console.log(`${passed} isolated real-transport authority cases passed; no fixture reset, live request or external subscription.`);
} finally { await prisma.$disconnect(); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
