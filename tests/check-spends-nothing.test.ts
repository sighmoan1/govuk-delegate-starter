import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, check, revokeAuthorisation, DELEGATE, HMRC, SERVICE } from "./helpers";

afterAll(() => prisma.$disconnect());

// Issue #17: asking Delegate "may this agent act?" is a lookup. A yes proves
// identity + live mandate + capability (+ assurance). It spends none of the
// person's allowance. HMRC's own business limits are separate and unchanged.

const N = 100;

async function subDelegate(token: string, principalId: string, label: string) {
  const res = await fetch(`${DELEGATE}/api/delegations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ principal_id: principalId, service: SERVICE, capabilities: ["view_tax_code"], label }),
  });
  return (await res.json()) as { token: string; delegation_id: string };
}

/** Everything in a check response except the per-check id. */
const stable = (b: Record<string, unknown>) => {
  const { check_id: _id, ...rest } = b;
  return rest;
};

describe("Delegate: a positive check spends nothing", () => {
  it(`${N} repeated valid checks by one agent stay authorised, identical, logged, and create no quota records`, async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["view_tax_code"]);
    const before = await prisma.activityEvent.count({ where: { principalId: sam.id } });

    const results = [];
    for (let i = 0; i < N; i++) results.push(await check({ agent_token: token, principal_id: sam.id }));

    expect(results.every((r) => r.status === 200 && r.body.authorised === true)).toBe(true);
    // Same response every time (bar the check id), and nothing resembling a spent allowance.
    expect(new Set(results.map((r) => JSON.stringify(stable(r.body)))).size).toBe(1);
    for (const r of results) {
      expect(r.body).not.toHaveProperty("capacity");
      expect(JSON.stringify(r.body)).not.toMatch(/capacity|remaining|resets_at|actions_per_hour/i);
    }
    expect(results[0].body).toMatchObject({ authorised: true, principal_id: sam.id, subject: sam.oneLoginSubjectId, chain: { mandate_id: authorisationId, depth: 0 } });

    // Every check is still logged: one ALLOW event each, with distinct ids.
    expect(new Set(results.map((r) => r.body.check_id)).size).toBe(N);
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id } })).toBe(before + N);
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id, decision: "ALLOW", reason: "VALID_AUTHORISATION" } })).toBe(N);

    // No per-person counter exists to be written to.
    const [{ t }] = await prisma.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.capacity_use')::text AS t`;
    expect(t).toBeNull();
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name IN ('service','activity_event') AND column_name ~ 'capacity|actions_per_hour'`;
    expect(cols).toEqual([]);
  });

  it(`${N} repeated checks spread across sub-agents stay authorised too`, async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const kids = await Promise.all(Array.from({ length: 10 }, (_, i) => subDelegate(token, sam.id, `worker ${i}`)));
    const results = await Promise.all(Array.from({ length: N }, (_, i) => check({ agent_token: kids[i % kids.length].token, principal_id: sam.id })));
    expect(results.every((r) => r.body.authorised === true && !("capacity" in r.body))).toBe(true);
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id, decision: "ALLOW" } })).toBe(N);
  });

  it("a denial is no more 'capacity' than an approval: refusal bodies carry the reason, not a quota", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const denied = await check({ agent_token: token, principal_id: sam.id, capability: "change_address" });
    expect(denied.body).toMatchObject({ authorised: false, reason: "PERMISSION_MISSING" });
    expect(denied.body).not.toHaveProperty("capacity");
  });

  it("revoked, expired and undelegated still DENY after many allowed checks, each one logged", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["view_tax_code"]);
    for (let i = 0; i < 25; i++) expect((await check({ agent_token: token, principal_id: sam.id })).body.authorised).toBe(true);

    // undelegated capability
    const undelegated = await check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" });
    expect(undelegated.body).toMatchObject({ authorised: false, reason: "PERMISSION_MISSING" });
    // a different person the agent was never authorised for
    const stranger = await newPrincipal();
    expect((await check({ agent_token: token, principal_id: stranger.id })).body).toMatchObject({ authorised: false, reason: "NO_AUTHORISATION" });
    // revoked
    await revokeAuthorisation(authorisationId, sam.id);
    const revoked = await check({ agent_token: token, principal_id: sam.id });
    expect(revoked.body).toMatchObject({ authorised: false, reason: "AUTHORISATION_REVOKED" });

    // expired
    const lee = await newPrincipal();
    const second = await authorise(lee.id, ["view_tax_code"]);
    for (let i = 0; i < 5; i++) await check({ agent_token: second.token, principal_id: lee.id });
    await prisma.authorisation.update({ where: { id: second.authorisationId }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect((await check({ agent_token: second.token, principal_id: lee.id })).body).toMatchObject({ authorised: false, reason: "AUTHORISATION_EXPIRED" });

    for (const r of [undelegated, revoked]) {
      expect(await prisma.activityEvent.findUniqueOrThrow({ where: { id: r.body.check_id } })).toMatchObject({ decision: "DENY", reason: r.body.reason });
    }
  });

  it("the high-risk step-up gate still applies, and an approval is still used up by exactly one positive check", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const first = await check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" });
    expect(first.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED" });
    await prisma.stepUp.update({ where: { userCode: first.body.step_up.user_code }, data: { status: "APPROVED", approvedAt: new Date() } });
    const results = await Promise.all(Array.from({ length: 5 }, () => check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" })));
    expect(results.filter((r) => r.body.authorised).length).toBe(1);
    expect(results.filter((r) => r.body.reason === "STEP_UP_REQUIRED").length).toBe(4);
  });
});

// ── HMRC level: its own limits are untouched and are the only ones that count.

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;
async function viewTaxCode(token: string, principalId: string) {
  const res = await fetch(`${HMRC}/api/tax-code`, { headers: { authorization: `Bearer ${token}`, "x-principal-id": principalId, "x-forwarded-for": ip() } });
  return { status: res.status, body: (await res.json()) as any };
}
const hmrcEvents = async (since: Date) => ((await (await fetch(`${HMRC}/ops/events?since=${since.toISOString()}`)).json()) as any).events as { outcome: string; reason: string | null; delegateCheckId: string | null; rule: string | null }[];

describe("HMRC: Delegate checks no longer eat HMRC's person-level allowance", () => {
  it(`after ${N} bare Delegate checks, HMRC still has its full allowance and counts only its own use`, async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    for (let i = 0; i < N; i++) expect((await check({ agent_token: token, principal_id: sam.id })).body.authorised).toBe(true);

    const first = await viewTaxCode(token, sam.id);
    expect(first.status).toBe(200);
    expect(first.body.decision).toBe("ALLOW");
    // HMRC's own counter starts at 1 (its own transaction), regardless of the 100 checks.
    expect(first.body.capacity).toMatchObject({ rule: "tax_code_views_per_hour", limit: 60, used: 1 });
    // And HMRC no longer relays any Delegate "capacity".
    expect(first.body).not.toHaveProperty("delegate_capacity");
  });

  it("HMRC's own business limit still refuses (CAPACITY_EXCEEDED from HMRC), while Delegate allowed every check", async () => {
    const since = new Date();
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const outcomes = [];
    for (let i = 0; i < 62; i++) outcomes.push(await viewTaxCode(token, sam.id));
    expect(outcomes.filter((o) => o.status === 200).length).toBe(60);
    const refused = outcomes.filter((o) => o.status === 429);
    expect(refused.length).toBe(2);
    expect(refused[0].body).toMatchObject({ reason: "CAPACITY_EXCEEDED", rule: "tax_code_views_per_hour", limit: 60 });
    expect(refused[0].body.rule).not.toMatch(/^delegate:/);

    // Delegate allowed all 62 checks: the refusals were HMRC's business rule, not Delegate's.
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id, decision: "ALLOW" } })).toBe(62);
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id, decision: "DENY" } })).toBe(0);
    const events = await hmrcEvents(since);
    expect(events.filter((e) => outcomes.some((o) => o.body.delegate_check_id && o.body.delegate_check_id === e.delegateCheckId) && e.rule?.startsWith("delegate:")).length).toBe(0);
  });

  it("no permission means no HMRC transaction: the request is refused before anything runs", async () => {
    const since = new Date();
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const res = await fetch(`${HMRC}/api/refund-account`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-principal-id": sam.id, "x-forwarded-for": ip() },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ decision: "DENY", reason: "PERMISSION_MISSING" });
    expect(body).not.toHaveProperty("result");
    const ev = (await hmrcEvents(since)).find((e) => e.delegateCheckId === body.delegate_check_id);
    expect(ev).toMatchObject({ outcome: "REFUSED", reason: "PERMISSION_MISSING" });
  });
});
