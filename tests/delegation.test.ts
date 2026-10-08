import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prisma, newPrincipal, authorise, demoAgent, check, eventById, revokeAuthorisation, signAgentToken, agentToken,
  createRequest, approveRequest, DELEGATE, CLIENT_ID,
} from "./helpers";
import { loadRequest, rejectRequest, returnTo } from "@/lib/requests";

afterAll(() => prisma.$disconnect());

// Scenarios A–F at the level of GOV.UK Delegate's check API: what any service
// gets back when it asks. tests/hmrc.test.ts runs the same scenarios through
// the HMRC service over HTTP.

describe("A — authorised action", () => {
  it("live relationship covering the capability → authorised, with the person's One Login subject", async () => {
    const p = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code", "claim_job_expenses"]);
    const r = await check({ agent_token: token, principal_id: p.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ authorised: true, status: "ACTIVE", authorisation_id: authorisationId, principal_id: p.id, subject: p.oneLoginSubjectId });
    expect(r.body.delegate.name).toBe("Personal assistant");
    expect(await eventById(r.body.check_id)).toMatchObject({ decision: "ALLOW", reason: "VALID_AUTHORISATION", lane: "AUTHORISED_AGENT", principalId: p.id, authorisationId, capability: "view_tax_code" });
  });
});

describe("B — undelegated action", () => {
  it("capability never requested → PERMISSION_MISSING", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const r = await check({ agent_token: token, principal_id: p.id, capability: "change_refund_account" });
    expect(r.body).toMatchObject({ authorised: false, reason: "PERMISSION_MISSING", status: "ACTIVE" });
    expect(r.body.subject).toBeUndefined();
    expect(await eventById(r.body.check_id)).toMatchObject({ decision: "DENY", reason: "PERMISSION_MISSING" });
  });

  it("requested but narrowed out by the person → PERMISSION_MISSING", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code", "update_employment"], ["view_tax_code"]);
    expect((await check({ agent_token: token, principal_id: p.id, capability: "update_employment" })).body.reason).toBe("PERMISSION_MISSING");
    expect((await check({ agent_token: token, principal_id: p.id })).body.authorised).toBe(true);
  });
});

describe("C — revocation", () => {
  it("authorised → person removes access → the same check is AUTHORISATION_REVOKED", async () => {
    const p = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    expect((await check({ agent_token: token, principal_id: p.id })).body.authorised).toBe(true);
    await revokeAuthorisation(authorisationId, p.id);
    const r = await check({ agent_token: token, principal_id: p.id });
    expect(r.body).toMatchObject({ authorised: false, reason: "AUTHORISATION_REVOKED", status: "REVOKED", authorisation_id: authorisationId });
    expect(await eventById(r.body.check_id)).toMatchObject({ decision: "DENY", reason: "AUTHORISATION_REVOKED", authorisationId });
  });
});

describe("D — expiry", () => {
  it("relationship past its end → AUTHORISATION_EXPIRED, and the row is marked EXPIRED", async () => {
    const p = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    await prisma.authorisation.update({ where: { id: authorisationId }, data: { validUntil: new Date(Date.now() - 1000) } });
    const r = await check({ agent_token: token, principal_id: p.id });
    expect(r.body).toMatchObject({ authorised: false, reason: "AUTHORISATION_EXPIRED" });
    expect((await prisma.authorisation.findUnique({ where: { id: authorisationId } }))!.status).toBe("EXPIRED");
  });
});

describe("E — unknown delegate", () => {
  it("a validly signed token for a delegate that does not exist → UNKNOWN_DELEGATE, logged as untrusted", async () => {
    const p = await newPrincipal();
    const ghost = await signAgentToken(randomUUID(), "ghost-agent");
    const r = await check({ agent_token: ghost, principal_id: p.id });
    expect(r.body).toMatchObject({ authorised: false, reason: "UNKNOWN_DELEGATE" });
    expect(await eventById(r.body.check_id)).toMatchObject({ decision: "DENY", lane: "UNTRUSTED", presentedClientId: "ghost-agent" });
  });

  it("garbage or missing token → INVALID_AGENT_AUTHENTICATION", async () => {
    for (const t of ["not-a-token", null]) {
      const r = await check({ agent_token: t, principal_id: randomUUID() });
      expect(r.body.reason).toBe("INVALID_AGENT_AUTHENTICATION");
      expect(await eventById(r.body.check_id)).toMatchObject({ decision: "DENY", lane: "UNTRUSTED" });
    }
  });

  it("agent sign-in: unknown client and wrong secret both fail and are logged", async () => {
    const clientId = `nobody-${randomUUID()}`;
    const a = await agentToken(clientId, "x");
    expect(a.res.status).toBe(401);
    expect(a.body.error).toBe("UNKNOWN_DELEGATE");
    expect(await prisma.activityEvent.findFirst({ where: { presentedClientId: clientId } })).toMatchObject({ decision: "DENY" });
    const b = await agentToken(CLIENT_ID, "wrong");
    expect(b.res.status).toBe(401);
    expect(b.body.error).toBe("INVALID_AGENT_AUTHENTICATION");
  });
});

describe("F — missing relationship", () => {
  it("known delegate, known person, no authority → NO_AUTHORISATION", async () => {
    const p = await newPrincipal();
    const { token } = await demoAgent();
    const r = await check({ agent_token: token, principal_id: p.id });
    expect(r.body).toMatchObject({ authorised: false, reason: "NO_AUTHORISATION" });
    expect(await eventById(r.body.check_id)).toMatchObject({ decision: "DENY", principalId: p.id });
  });

  it("an unknown principal id looks the same → NO_AUTHORISATION", async () => {
    const { token } = await demoAgent();
    expect((await check({ agent_token: token, principal_id: randomUUID() })).body.reason).toBe("NO_AUTHORISATION");
  });
});

describe("every check generates exactly one activity event", () => {
  it("across ALLOW and every DENY path", async () => {
    const p = await newPrincipal();
    const other = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    const ghost = await signAgentToken(randomUUID(), "ghost");
    const before = await prisma.activityEvent.count();
    const results = [
      await check({ agent_token: token, principal_id: p.id }),
      await check({ agent_token: token, principal_id: p.id, capability: "change_address" }),
      await check({ agent_token: token, principal_id: other.id }),
      await check({ agent_token: ghost, principal_id: p.id }),
      await check({ agent_token: "junk", principal_id: p.id }),
    ];
    await revokeAuthorisation(authorisationId, p.id);
    results.push(await check({ agent_token: token, principal_id: p.id }));
    expect(await prisma.activityEvent.count()).toBe(before + results.length);
    expect(results.map((r) => r.body.reason ?? "VALID_AUTHORISATION")).toEqual([
      "VALID_AUTHORISATION", "PERMISSION_MISSING", "NO_AUTHORISATION", "UNKNOWN_DELEGATE", "INVALID_AGENT_AUTHENTICATION", "AUTHORISATION_REVOKED",
    ]);
  });
});

describe("only a registered service may ask", () => {
  it("no key, wrong key, or a key for a different service → 401, nothing logged, no subject", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const before = await prisma.activityEvent.count();
    for (const [key, body] of [[null, {}], ["wrong", {}], ["dev-hmrc-service-key", { service: "no-such-service" }]] as const) {
      const r = await check({ agent_token: token, principal_id: p.id, ...body }, key);
      expect(r.status).toBe(401);
      expect(r.body.error).toBe("INVALID_SERVICE_AUTHENTICATION");
      expect(r.body.subject).toBeUndefined();
    }
    expect(await prisma.activityEvent.count()).toBe(before);
  });
});

describe("HMRC-style request lifecycle", () => {
  it("approve only what was requested; reject; cancel; validate capabilities and identity", async () => {
    const p = await newPrincipal();
    const { token } = await demoAgent();
    const r1 = (await createRequest(token)).body;
    await expect(approveRequest(r1.id, p.id, ["change_address"])).rejects.toMatchObject({ code: "NOT_REQUESTED" });
    await expect(approveRequest(r1.id, p.id, [])).rejects.toMatchObject({ code: "NO_PERMISSIONS" });
    await rejectRequest(r1.id, p.id);
    await expect(approveRequest(r1.id, p.id)).rejects.toMatchObject({ code: "NOT_PENDING" });
    expect((await check({ agent_token: token, principal_id: p.id })).body.reason).toBe("NO_AUTHORISATION");

    const r2 = (await createRequest(token)).body;
    const cancel = await fetch(`${DELEGATE}/api/authorisation-requests/${r2.id}/cancel`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    expect((await cancel.json()).status).toBe("CANCELLED");

    expect((await createRequest(token, { capabilities: ["launch_missiles"] })).res.status).toBe(400);
    expect((await fetch(`${DELEGATE}/api/authorisation-requests`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    // Principal identity ≠ delegate identity: an agent token cannot act as the person.
    expect((await fetch(`${DELEGATE}/api/authorisations`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it("the agent learns exactly what was granted after the person narrows the request", async () => {
    const { token } = await demoAgent();
    const created = (await createRequest(token, { capabilities: ["view_tax_code", "claim_job_expenses", "update_employment"] })).body;
    const p = await newPrincipal();
    await approveRequest(created.id, p.id, ["view_tax_code", "claim_job_expenses"]);
    const seen = await (await fetch(`${DELEGATE}/api/authorisation-requests/${created.id}`, { headers: { authorization: `Bearer ${token}` } })).json();
    expect(seen.principal_id).toBe(p.id);
    expect(seen.granted_capabilities.sort()).toEqual(["claim_job_expenses", "view_tax_code"]);
  });
});

describe("redirect hand-off (consent screen → agent)", () => {
  const AGENT = "https://assistant.example";

  it("rejects a return_url the agent has not registered", async () => {
    const { token } = await demoAgent();
    for (const url of ["https://evil.example/callback", `${AGENT}/somewhere-else`, "javascript:alert(1)"]) {
      const { res, body } = await createRequest(token, { return_url: url });
      expect(res.status, url).toBe(400);
      expect(body.error).toBe("UNREGISTERED_RETURN_URL");
    }
  });

  it("accepts the registered return_url with the agent's own query, and carries the outcome back", async () => {
    const { token } = await demoAgent();
    const { res, body: created } = await createRequest(token, { return_url: `${AGENT}/callback?run=abc` });
    expect(res.status).toBe(201);
    expect(created.consent_url).toBe(`${DELEGATE}/consent/${created.id}`);
    const p = await newPrincipal();
    await approveRequest(created.id, p.id);
    const back = new URL(returnTo((await loadRequest(created.id))!, "approved")!);
    expect(back.pathname).toBe("/callback");
    expect(back.searchParams.get("run")).toBe("abc");
    expect(back.searchParams.get("request_id")).toBe(created.id);
    expect(back.searchParams.get("status")).toBe("approved");
  });

  it("the consent decision endpoint refuses cross-origin posts and sends anonymous people to sign in", async () => {
    const { token } = await demoAgent();
    const created = (await createRequest(token)).body;
    const post = (headers: Record<string, string>) =>
      fetch(`${DELEGATE}/consent/${created.id}/decision`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
        body: "decision=approve&c=view_tax_code",
      });
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    const anon = await post({ origin: DELEGATE });
    expect(anon.status).toBe(303);
    expect(anon.headers.get("location")).toContain("/auth/login");
    expect((await loadRequest(created.id))!.status).toBe("PENDING");
  });
});
