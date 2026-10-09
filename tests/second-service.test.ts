import { afterAll, expect, it } from "vitest";
import { newPrincipal, authorise, demoAgent, createRequest, approveRequest, revokeAuthorisation, check, prisma, HMRC } from "./helpers";
const COUNCIL = process.env.COUNCIL_URL ?? "http://localhost:3305";
const SERVICE = "council-casework", KEY = process.env.COUNCIL_SERVICE_KEY ?? "dev-council-service-key";
afterAll(() => prisma.$disconnect());
it("two independently registered service grants never cross-authorise and revoke independently", async () => {
 const sam = await newPrincipal();
 const hmrc = await authorise(sam.id, ["view_tax_code"]);
 const headers = { authorization: `Bearer ${hmrc.token}`, "x-principal-id": sam.id };
 const council = () => fetch(`${COUNCIL}/api/cases/status?reference=CASE-SAM`, {headers});
 expect((await council()).status).toBe(403);
 const requested = await createRequest(hmrc.token, {service:SERVICE, capabilities:["view_case_status"]});
 expect(requested.res.status).toBe(201);
 const grant = await approveRequest(requested.body.id, sam.id, ["view_case_status"]);
 // Authority cannot bypass council's own ownership rule for this synthetic principal.
 const business = await council(); expect(business.status).toBe(404); expect(await business.json()).toMatchObject({kind:"BUSINESS_REFUSAL"});
 expect((await check({agent_token:hmrc.token,principal_id:sam.id,service:SERVICE,capability:"view_case_status"},KEY)).body.authorised).toBe(true);
 for (const [service, capability, credential] of [[SERVICE,"view_case_status","dev-hmrc-service-key"],["hmrc-personal-tax","view_tax_code",KEY]]) expect((await check({agent_token:hmrc.token,principal_id:sam.id,service,capability},credential)).status).toBe(401);
 await revokeAuthorisation(grant.id,sam.id);
 expect((await council()).status).toBe(403);
 expect((await fetch(`${HMRC}/api/tax-code`,{headers})).status).toBe(200);
 const req2 = await createRequest(hmrc.token,{service:SERVICE,capabilities:["view_case_status"]}); await approveRequest(req2.body.id,sam.id,["view_case_status"]);
 await revokeAuthorisation(hmrc.authorisationId,sam.id);
 expect((await fetch(`${HMRC}/api/tax-code`,{headers})).status).toBe(403);
 expect((await check({agent_token:hmrc.token,principal_id:sam.id,service:SERVICE,capability:"view_case_status"},KEY)).body.authorised).toBe(true);
});
