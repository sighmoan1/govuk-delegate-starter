import { describe, it, expect, vi } from "vitest";
import { councilHandler } from "../src/service";
const config = { delegateUrl: "http://delegate", serviceKey: "council-key", cases: [{ reference: "CASE-SAM", subject: "sam", status: "Pending" }, { reference: "CASE-OTHER", subject: "other", status: "Resolved" }] };
const request = (ref = "CASE-SAM") => new Request(`http://council/api/cases/status?reference=${ref}&service=hmrc-personal-tax`, { headers: { authorization: "Bearer agent-token", "x-principal-id": "principal-id" } });
const allow = { authorised: true, subject: "sam", check_id: "check-1" };
describe("independent council boundary", () => {
 it("pins its service identity, capability and own credential; returns only local business data", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(allow)).mockResolvedValueOnce(Response.json({}));
  const res = await councilHandler(config, transport)(request());
  expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ result: { reference: "CASE-SAM", status: "Pending" } });
  const options = transport.mock.calls[0][1]!;
  expect(options.headers).toMatchObject({ "x-service-key": "council-key" });
  expect(JSON.parse(String(options.body))).toEqual({ service: "council-casework", capability: "view_case_status", agent_token: "agent-token", principal_id: "principal-id" });
 });
 for (const reason of ["NO_AUTHORISATION", "AUTHORISATION_REVOKED", "AUTHORISATION_EXPIRED", "UNKNOWN_AGENT", "PERMISSION_MISSING"]) it(`refuses ${reason} without touching business records`, async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ authorised: false, reason, check_id: "denied" }));
  const res = await councilHandler(config, transport)(request()); expect(res.status).toBe(403); expect(await res.json()).toMatchObject({ reason }); expect(transport).toHaveBeenCalledTimes(1);
 });
 for (const ref of ["CASE-OTHER", "MISSING"]) it(`cannot disclose ${ref} despite delegated authority`, async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(allow)).mockResolvedValueOnce(Response.json({}));
  const res = await councilHandler(config, transport)(request(ref)); expect(res.status).toBe(404); expect(await res.json()).toMatchObject({ reason: "CASE_NOT_ACCESSIBLE" });
  expect(JSON.parse(String(transport.mock.calls[1][1]!.body))).toMatchObject({ status: "FAILED", reason: "CASE_NOT_ACCESSIBLE" });
 });
 it("fails closed on service-authentication/network/recording failure", async () => {
  for (const transport of [vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status:401 })), vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(allow)).mockResolvedValueOnce(new Response("", {status:500}))]) expect((await councilHandler(config, transport)(request())).status).toBe(503);
 });
 it("requires agent identity and allows no write methods", async () => {
  const handler = councilHandler(config); expect((await handler(new Request("http://council/api/cases/status"))).status).toBe(401);
  expect((await handler(new Request("http://council/api/cases/status", {method:"POST"}))).status).toBe(405);
 });
});
