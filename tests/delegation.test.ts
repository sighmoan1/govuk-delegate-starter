import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, newPrincipal, authorise, demoAgent, callDwp, eventsFor, revokeAuthorisation, signAgentToken, agentToken, BASE, CLIENT_ID } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("A — authorised action", () => {
  it("agent acts for an approving principal → 200 ALLOW and an ALLOW event", async () => {
    const p = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["check_claim_status", "submit_evidence", "report_change"]);
    const { token, delegateId } = await demoAgent();

    const r = await callDwp("check_claim_status", { token, principalId: p.id });
    expect(r.status).toBe(200);
    expect(r.body.decision).toBe("ALLOW");
    expect(r.body.reason).toBe("VALID_AUTHORISATION");
    expect(r.lane).toBe("AUTHORISED_AGENT");
    expect(r.body.result.claimant).toBe(p.displayName);

    const [ev] = await eventsFor(r.requestId);
    expect(ev).toMatchObject({ decision: "ALLOW", reason: "VALID_AUTHORISATION", lane: "AUTHORISED_AGENT", principalId: p.id, delegateId, authorisationId, capability: "check_claim_status" });

    expect((await callDwp("submit_evidence", { token, principalId: p.id })).status).toBe(200);
  });
});

describe("B — undelegated action", () => {
  it("capability that was not approved → 403 PERMISSION_MISSING", async () => {
    const p = await newPrincipal();
    await authorise(p.id, ["check_claim_status", "submit_evidence"]);
    const { token } = await demoAgent();
    for (const cap of ["change_payment_details", "withdraw_claim"] as const) {
      const r = await callDwp(cap, { token, principalId: p.id });
      expect(r.status).toBe(403);
      expect(r.body.reason).toBe("PERMISSION_MISSING");
      expect((await eventsFor(r.requestId))[0]).toMatchObject({ decision: "DENY", reason: "PERMISSION_MISSING" });
    }
  });

  it("a requested-but-narrowed permission is also denied", async () => {
    const p = await newPrincipal();
    await authorise(p.id, ["check_claim_status", "submit_evidence", "report_change"], ["check_claim_status"]);
    const { token } = await demoAgent();
    expect((await callDwp("report_change", { token, principalId: p.id })).body.reason).toBe("PERMISSION_MISSING");
    expect((await callDwp("check_claim_status", { token, principalId: p.id })).status).toBe(200);
  });
});

describe("C — revocation", () => {
  it("allowed → principal revokes → the same action is 403 AUTHORISATION_REVOKED", async () => {
    const p = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["check_claim_status"]);
    const { token } = await demoAgent();

    const before = await callDwp("check_claim_status", { token, principalId: p.id });
    expect(before.status).toBe(200);

    await revokeAuthorisation(authorisationId, p.id);

    const after = await callDwp("check_claim_status", { token, principalId: p.id });
    expect(after.status).toBe(403);
    expect(after.body.reason).toBe("AUTHORISATION_REVOKED");
    expect((await eventsFor(after.requestId))[0]).toMatchObject({ decision: "DENY", reason: "AUTHORISATION_REVOKED", authorisationId });
  });
});

describe("D — expiry", () => {
  it("expired relationship → 403 AUTHORISATION_EXPIRED", async () => {
    const p = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["check_claim_status"]);
    const { token } = await demoAgent();
    expect((await callDwp("check_claim_status", { token, principalId: p.id })).status).toBe(200);

    await prisma.authorisation.update({ where: { id: authorisationId }, data: { validUntil: new Date(Date.now() - 1000) } });

    const r = await callDwp("check_claim_status", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("AUTHORISATION_EXPIRED");
    expect((await eventsFor(r.requestId))[0]).toMatchObject({ decision: "DENY", reason: "AUTHORISATION_EXPIRED" });
    expect((await prisma.authorisation.findUnique({ where: { id: authorisationId } }))!.status).toBe("EXPIRED");
  });
});

describe("E — unknown delegate", () => {
  it("a validly signed token for a delegate that does not exist → 401 UNKNOWN_DELEGATE", async () => {
    const p = await newPrincipal();
    const ghost = await signAgentToken(randomUUID(), "ghost-agent");
    const r = await callDwp("check_claim_status", { token: ghost, principalId: p.id });
    expect(r.status).toBe(401);
    expect(r.body.reason).toBe("UNKNOWN_DELEGATE");
    expect((await eventsFor(r.requestId))[0]).toMatchObject({ decision: "DENY", reason: "UNKNOWN_DELEGATE", lane: "UNTRUSTED", presentedClientId: "ghost-agent" });
  });

  it("an unregistered client_id cannot get a token → 401 UNKNOWN_DELEGATE, and the attempt is logged", async () => {
    const clientId = `nobody-${randomUUID()}`;
    const { res, body } = await agentToken(clientId, "x");
    expect(res.status).toBe(401);
    expect(body.error).toBe("UNKNOWN_DELEGATE");
    const ev = await prisma.activityEvent.findFirst({ where: { presentedClientId: clientId } });
    expect(ev).toMatchObject({ decision: "DENY", reason: "UNKNOWN_DELEGATE" });
  });

  it("wrong secret for a real delegate → 401 INVALID_AGENT_AUTHENTICATION", async () => {
    const { res, body } = await agentToken(CLIENT_ID, "wrong");
    expect(res.status).toBe(401);
    expect(body.error).toBe("INVALID_AGENT_AUTHENTICATION");
  });

  it("garbage bearer → 401 INVALID_AGENT_AUTHENTICATION", async () => {
    const r = await callDwp("check_claim_status", { token: "not-a-token" });
    expect(r.status).toBe(401);
    expect(r.body.reason).toBe("INVALID_AGENT_AUTHENTICATION");
    expect(await eventsFor(r.requestId)).toHaveLength(1);
  });
});

describe("F — missing relationship", () => {
  it("known delegate + known principal + service but no authority → 403 NO_AUTHORISATION", async () => {
    const p = await newPrincipal();
    const { token } = await demoAgent();
    const r = await callDwp("check_claim_status", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("NO_AUTHORISATION");
    expect((await eventsFor(r.requestId))[0]).toMatchObject({ decision: "DENY", reason: "NO_AUTHORISATION", principalId: p.id });
  });

  it("an unknown principal id looks the same → 403 NO_AUTHORISATION", async () => {
    const { token } = await demoAgent();
    const r = await callDwp("check_claim_status", { token, principalId: randomUUID() });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("NO_AUTHORISATION");
  });
});

describe("every attempt generates an activity event", () => {
  it("one event per attempt across ALLOW and every DENY path", async () => {
    const p = await newPrincipal();
    const other = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["check_claim_status"]);
    const { token } = await demoAgent();
    const ghost = await signAgentToken(randomUUID(), "ghost");

    const before = await prisma.activityEvent.count();
    const attempts = [
      callDwp("check_claim_status", { token, principalId: p.id }), // allow
      callDwp("withdraw_claim", { token, principalId: p.id }), // permission missing
      callDwp("check_claim_status", { token, principalId: other.id }), // no authorisation
      callDwp("check_claim_status", { token: ghost, principalId: p.id }), // unknown delegate
      callDwp("check_claim_status", { token: "junk" }), // invalid auth
      callDwp("check_claim_status", {}), // untrusted, no credentials
    ];
    const results = [];
    for (const a of attempts) results.push(await a);
    await revokeAuthorisation(authorisationId, p.id);
    results.push(await callDwp("check_claim_status", { token, principalId: p.id })); // revoked

    expect(await prisma.activityEvent.count()).toBe(before + results.length);
    for (const r of results) expect(await eventsFor(r.requestId)).toHaveLength(1);
    expect(results.map((r) => r.status)).toEqual([200, 403, 403, 401, 401, 401, 403]);
  });
});

describe("trusted lane vs untrusted lane", () => {
  it("untrusted traffic gets no machine-readable error and a much lower limit; trusted gets both", async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 250)}`;
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await callDwp("check_claim_status", { ip }));
    expect(results[0].lane).toBe("UNTRUSTED");
    expect(typeof results[0].body).toBe("string");
    expect(results.slice(0, 5).every((r) => r.status === 401)).toBe(true);
    expect(results[5].status).toBe(429);
    expect((await eventsFor(results[5].requestId))[0].reason).toBe("RATE_LIMITED");

    const p = await newPrincipal();
    await authorise(p.id, ["check_claim_status"]);
    const { token } = await demoAgent();
    for (let i = 0; i < 8; i++) {
      const r = await callDwp("check_claim_status", { token, principalId: p.id, ip });
      expect(r.status).toBe(200);
    }
  });
});

describe("HMRC-style request lifecycle and the check API", () => {
  it("only a service key may call the relationship check, and it answers in the documented shape", async () => {
    const p = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["submit_evidence"]);
    const { delegateId } = await demoAgent();
    const body = JSON.stringify({ principal_id: p.id, delegate_id: delegateId, service: "dwp-benefits", capability: "submit_evidence" });
    const h = { "content-type": "application/json" };

    expect((await fetch(`${BASE}/api/authorisations/check`, { method: "POST", headers: h, body })).status).toBe(401);
    const ok = await fetch(`${BASE}/api/authorisations/check`, { method: "POST", headers: { ...h, "x-service-key": process.env.DWP_SERVICE_KEY ?? "dev-dwp-service-key" }, body });
    expect(await ok.json()).toEqual({ authorised: true, authorisation_id: authorisationId, status: "ACTIVE" });
  });

  it("a principal can approve only what was requested, can reject, and the agent can cancel", async () => {
    const { approveRequest, rejectRequest } = await import("@/lib/requests");
    const p = await newPrincipal();
    const { token } = await demoAgent();
    const ask = async (caps: string[]) =>
      (await (await fetch(`${BASE}/api/authorisation-requests`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ service: "dwp-benefits", capabilities: caps }) })).json());

    const r1 = await ask(["check_claim_status"]);
    await expect(approveRequest(r1.id, p.id, ["withdraw_claim"])).rejects.toMatchObject({ code: "NOT_REQUESTED" });
    await expect(approveRequest(r1.id, p.id, [])).rejects.toMatchObject({ code: "NO_PERMISSIONS" });
    await rejectRequest(r1.id, p.id);
    await expect(approveRequest(r1.id, p.id)).rejects.toMatchObject({ code: "NOT_PENDING" });
    expect((await callDwp("check_claim_status", { token, principalId: p.id })).body.reason).toBe("NO_AUTHORISATION");

    const r2 = await ask(["check_claim_status"]);
    const cancel = await fetch(`${BASE}/api/authorisation-requests/${r2.id}/cancel`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect((await cancel.json()).status).toBe("CANCELLED");

    const bad = await fetch(`${BASE}/api/authorisation-requests`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ service: "dwp-benefits", capabilities: ["launch_missiles"] }) });
    expect(bad.status).toBe(400);
    expect((await fetch(`${BASE}/api/authorisation-requests`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
  });

  it("principal-facing endpoints refuse an agent token (principal identity ≠ delegate identity)", async () => {
    const { token } = await demoAgent();
    const r = await fetch(`${BASE}/api/authorisations`, { headers: { authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
    const approve = await fetch(`${BASE}/api/authorisation-requests/${randomUUID()}/approve`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect(approve.status).toBe(401);
  });
});
