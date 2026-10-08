import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, newPrincipal, authorise, demoAgent, revokeAuthorisation, signAgentToken, HMRC, DELEGATE, type Cap } from "./helpers";

afterAll(() => prisma.$disconnect());

// Scenarios A–F as a receiving service sees them: over HTTP, through the mock
// HMRC service, which asks GOV.UK Delegate on every request.

const ENDPOINT: Record<Cap, [string, string]> = {
  view_tax_code: ["GET", "/api/tax-code"],
  claim_job_expenses: ["POST", "/api/job-expenses"],
  update_employment: ["POST", "/api/employment"],
  change_refund_account: ["POST", "/api/refund-account"],
  change_address: ["POST", "/api/address"],
  view_claim_status: ["GET", "/api/claims"],
  respond_to_query: ["POST", "/api/claims/respond"],
  check_claim_progress: ["GET", "/api/claims/progress"],
};

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;

async function call(cap: Cap, o: { token?: string | null; principalId?: string; ip?: string; body?: unknown } = {}) {
  const [method, path] = ENDPOINT[cap];
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": o.ip ?? ip() };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.principalId) headers["x-principal-id"] = o.principalId;
  const started = Date.now();
  const res = await fetch(`${HMRC}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(o.body ?? {}) : undefined });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, text, lane: res.headers.get("x-trusted-lane"), contentType: res.headers.get("content-type") ?? "", retryAfter: res.headers.get("retry-after"), ms: Date.now() - started };
}

async function hmrcEvents(since: Date) {
  const { events } = await (await fetch(`${HMRC}/ops/events?since=${since.toISOString()}`)).json();
  return events as { lane: string; outcome: string; reason: string | null; capability: string | null; delegateCheckId: string | null; agentName: string | null }[];
}

describe("A — authorised action", () => {
  it("agent with permission → 200 ALLOW, acting for the person; logged by HMRC and by Delegate", async () => {
    const since = new Date();
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code", "claim_job_expenses"]);
    const r = await call("view_tax_code", { token, principalId: p.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ decision: "ALLOW", lane: "AUTHORISED_AGENT", acting_for: "Sam Taylor" });
    expect(r.body.result.tax_code).toBe("1257L");
    expect(r.lane).toBe("AUTHORISED_AGENT");

    const hmrc = (await hmrcEvents(since)).find((e) => e.delegateCheckId === r.body.delegate_check_id);
    expect(hmrc).toMatchObject({ lane: "AUTHORISED_AGENT", outcome: "ALLOWED", capability: "view_tax_code", agentName: "Personal assistant" });
    expect(await prisma.activityEvent.findUnique({ where: { id: r.body.delegate_check_id } })).toMatchObject({ decision: "ALLOW", principalId: p.id });

    const claim = await call("claim_job_expenses", { token, principalId: p.id });
    expect(claim.status).toBe(200);
    expect(claim.body.result.new_tax_code).toBe("1288L");
  });
});

describe("B — undelegated action", () => {
  it("permission the person never gave → 403 PERMISSION_MISSING, machine-readable", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const r = await call("change_refund_account", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ decision: "DENY", reason: "PERMISSION_MISSING", lane: "AUTHORISED_AGENT" });
  });
});

describe("C — revocation", () => {
  it("works, then the person removes access, then the same call is 403 AUTHORISATION_REVOKED", async () => {
    const p = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    expect((await call("view_tax_code", { token, principalId: p.id })).status).toBe(200);
    await revokeAuthorisation(authorisationId, p.id);
    const r = await call("view_tax_code", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("AUTHORISATION_REVOKED");
  });
});

describe("D — expiry", () => {
  it("expired permission → 403 AUTHORISATION_EXPIRED", async () => {
    const p = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    await prisma.authorisation.update({ where: { id: authorisationId }, data: { validUntil: new Date(Date.now() - 1000) } });
    const r = await call("view_tax_code", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("AUTHORISATION_EXPIRED");
  });
});

describe("E — unknown delegate", () => {
  it("a signed token for an agent Delegate does not know → 401 UNKNOWN_DELEGATE, untrusted lane", async () => {
    const p = await newPrincipal();
    const r = await call("view_tax_code", { token: await signAgentToken(randomUUID(), "ghost"), principalId: p.id });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ reason: "UNKNOWN_DELEGATE", lane: "UNTRUSTED" });
  });
  it("junk token → 401 INVALID_AGENT_AUTHENTICATION", async () => {
    const r = await call("view_tax_code", { token: "junk", principalId: randomUUID() });
    expect(r.status).toBe(401);
    expect(r.body.reason).toBe("INVALID_AGENT_AUTHENTICATION");
  });
});

describe("F — missing relationship", () => {
  it("known agent, known person, no permission → 403 NO_AUTHORISATION", async () => {
    const p = await newPrincipal();
    const { token } = await demoAgent();
    const r = await call("view_tax_code", { token, principalId: p.id });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("NO_AUTHORISATION");
  });
});

describe("the untrusted lane", () => {
  it("no identity: slow plain-text refusal pointing at Delegate, no structured body, then 429s", async () => {
    const since = new Date();
    const me = ip();
    const first = await call("view_tax_code", { ip: me });
    expect(first.status).toBe(401);
    expect(first.lane).toBe("UNTRUSTED");
    expect(first.contentType).toContain("text/plain");
    expect(typeof first.body).toBe("string");
    expect(first.text).toContain(`${HMRC}/.well-known/agent-access.json`);
    expect(first.ms).toBeGreaterThanOrEqual(1400);

    const rest = [];
    for (let i = 0; i < 6; i++) rest.push(await call("view_tax_code", { ip: me }));
    const throttled = rest.filter((r) => r.status === 429);
    expect(throttled.length).toBeGreaterThanOrEqual(2);
    expect(throttled[0].retryAfter).toBeTruthy();
    expect(throttled[0].contentType).toContain("text/plain");

    const mine = (await hmrcEvents(since)).filter((e) => e.lane === "UNTRUSTED");
    expect(mine.filter((e) => e.outcome === "REFUSED").length).toBeGreaterThanOrEqual(5);
    expect(mine.filter((e) => e.outcome === "THROTTLED").length).toBe(throttled.length);
  });

  it("an authorised agent is not slowed or limited like that", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const me = ip();
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await call("view_tax_code", { token, principalId: p.id, ip: me }));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(Math.max(...results.map((r) => r.ms))).toBeLessThan(1400);
  });
});

describe("every attempt is logged by HMRC", () => {
  it("one HMRC event per request across all lanes", async () => {
    const since = new Date();
    const p = await newPrincipal();
    const other = await newPrincipal();
    const { authorisationId, token } = await authorise(p.id, ["view_tax_code"]);
    const me = ip();
    const results = [
      await call("view_tax_code", { token, principalId: p.id }),
      await call("change_address", { token, principalId: p.id }),
      await call("view_tax_code", { token, principalId: other.id }),
      await call("view_tax_code", { token: await signAgentToken(randomUUID(), "ghost"), principalId: p.id }),
      await call("view_tax_code", { token: "junk", principalId: p.id }),
      await call("view_tax_code", { ip: me }),
    ];
    await revokeAuthorisation(authorisationId, p.id);
    results.push(await call("view_tax_code", { token, principalId: p.id }));
    const events = await hmrcEvents(since);
    expect(events.length).toBe(results.length);
    expect(results.map((r) => r.status)).toEqual([200, 403, 403, 401, 401, 401, 403]);
  });
});
