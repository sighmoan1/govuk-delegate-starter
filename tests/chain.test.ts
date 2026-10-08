import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma, newPrincipal, authorise, check, DELEGATE, SERVICE, demoAgent, createRequest, approveRequest } from "./helpers";

afterAll(() => prisma.$disconnect());

// Identify the agent. Authorise the mandate. Limit the principal.
// These tests talk to GOV.UK Delegate over HTTP; set-up reaches into its code.

async function subDelegate(token: string, principalId: string, capabilities: string[], label?: string) {
  const res = await fetch(`${DELEGATE}/api/delegations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ principal_id: principalId, service: SERVICE, capabilities, label }),
  });
  return { status: res.status, body: await res.json() };
}

describe("root principal → mandate → delegation chain", () => {
  it("a sub-agent inherits the root principal and mandate, and every check records the chain", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["view_tax_code", "claim_job_expenses"]);

    const root = await check({ agent_token: token, principal_id: sam.id });
    expect(root.body.chain).toMatchObject({ mandate_id: authorisationId, depth: 0, parent_delegation_id: null, assurance: "REGISTERED" });

    const child = await subDelegate(token, sam.id, ["view_tax_code"], "worker 1");
    expect(child.status).toBe(201);
    expect(child.body).toMatchObject({ mandate_id: authorisationId, depth: 1, parent_delegation_id: root.body.chain.delegation_id });

    const r = await check({ agent_token: child.body.token, principal_id: sam.id });
    expect(r.body).toMatchObject({ authorised: true, principal_id: sam.id, subject: sam.oneLoginSubjectId });
    expect(r.body.chain).toMatchObject({ mandate_id: authorisationId, delegation_id: child.body.delegation_id, depth: 1, label: "worker 1" });

    const ev = await prisma.activityEvent.findUniqueOrThrow({ where: { id: r.body.check_id } });
    expect(ev).toMatchObject({ principalId: sam.id, authorisationId, delegationId: child.body.delegation_id, parentDelegationId: root.body.chain.delegation_id, depth: 1 });
  });

  it("a sub-agent can't widen its parent's authority, or act for anyone else", async () => {
    const sam = await newPrincipal();
    const other = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code", "claim_job_expenses"]);
    const child = await subDelegate(token, sam.id, ["view_tax_code"]);

    // Its own checks are limited to what it was given.
    expect((await check({ agent_token: child.body.token, principal_id: sam.id, capability: "claim_job_expenses" })).body.reason).toBe("PERMISSION_MISSING");
    // It can't pass on more than it holds.
    const widen = await subDelegate(child.body.token, sam.id, ["view_tax_code", "claim_job_expenses"]);
    expect(widen.status).toBe(403);
    expect(widen.body.error).toBe("PERMISSION_MISSING");
    // Its token names Sam's mandate, so it can't be used for another person.
    expect((await check({ agent_token: child.body.token, principal_id: other.id })).body.reason).toBe("NO_AUTHORISATION");
  });

  it("delegation depth is limited by the mandate", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const d1 = await subDelegate(token, sam.id, ["view_tax_code"]);
    const d2 = await subDelegate(d1.body.token, sam.id, ["view_tax_code"]);
    expect(d2.body.depth).toBe(2);
    const d3 = await subDelegate(d2.body.token, sam.id, ["view_tax_code"]);
    expect(d3.status).toBe(403);
    expect(d3.body.error).toBe("DELEGATION_DEPTH_EXCEEDED");
  });

  it("revoking the mandate stops every delegation under it", async () => {
    const { revokeAuthorisation } = await import("@/lib/requests");
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["view_tax_code"]);
    const child = await subDelegate(token, sam.id, ["view_tax_code"]);
    await revokeAuthorisation(authorisationId, sam.id);
    expect((await check({ agent_token: child.body.token, principal_id: sam.id })).body.reason).toBe("AUTHORISATION_REVOKED");
  });
});

describe("ancestors are checked on every use", () => {
  async function threeLevels() {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code", "claim_job_expenses"]);
    const a = await subDelegate(token, sam.id, ["view_tax_code", "claim_job_expenses"], "a");
    const b = await subDelegate(a.body.token, sam.id, ["view_tax_code", "claim_job_expenses"], "b");
    const side = await subDelegate(token, sam.id, ["view_tax_code"], "side");
    return { sam, token, a, b, side };
  }

  it("all valid: the whole chain is usable", async () => {
    const { sam, a, b } = await threeLevels();
    expect((await check({ agent_token: a.body.token, principal_id: sam.id })).body.authorised).toBe(true);
    expect((await check({ agent_token: b.body.token, principal_id: sam.id })).body.authorised).toBe(true);
  });

  it("revoking an intermediate delegation denies its descendants at once, not its siblings", async () => {
    const { sam, a, b, side } = await threeLevels();
    expect((await check({ agent_token: b.body.token, principal_id: sam.id })).body.authorised).toBe(true);
    await prisma.delegation.update({ where: { id: a.body.delegation_id }, data: { status: "REVOKED" } });
    expect((await check({ agent_token: a.body.token, principal_id: sam.id })).body.authorised).toBe(false);
    const r = await check({ agent_token: b.body.token, principal_id: sam.id });
    expect(r.body.authorised).toBe(false);
    expect(r.body.reason).toBe("AUTHORISATION_REVOKED");
    expect((await check({ agent_token: side.body.token, principal_id: sam.id })).body.authorised).toBe(true);
  });

  it("narrowing a parent removes that permission from existing descendants", async () => {
    const { sam, a, b } = await threeLevels();
    await prisma.delegation.update({ where: { id: a.body.delegation_id }, data: { capabilities: ["view_tax_code"] } });
    const gone = await check({ agent_token: b.body.token, principal_id: sam.id, capability: "claim_job_expenses" });
    expect(gone.body.authorised).toBe(false);
    expect(gone.body.reason).toBe("PERMISSION_MISSING");
    expect((await check({ agent_token: b.body.token, principal_id: sam.id, capability: "view_tax_code" })).body.authorised).toBe(true);
  });

  it("cycles and malformed depth never authorise", async () => {
    const { sam, a, b } = await threeLevels();
    await prisma.delegation.update({ where: { id: a.body.delegation_id }, data: { parentDelegationId: b.body.delegation_id } });
    expect((await check({ agent_token: b.body.token, principal_id: sam.id })).body.authorised).toBe(false);
    const t = await threeLevels();
    await prisma.delegation.update({ where: { id: t.b.body.delegation_id }, data: { depth: 5 } });
    expect((await check({ agent_token: t.b.body.token, principal_id: t.sam.id })).body.authorised).toBe(false);
  });
});

describe("capacity belongs to the principal, not to each agent", () => {
  const LIMIT = 6;
  let original = 300;
  beforeAll(async () => {
    const s = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
    original = s.principalActionsPerHour;
    await prisma.service.update({ where: { slug: SERVICE }, data: { principalActionsPerHour: LIMIT } });
  });
  afterAll(async () => {
    await prisma.service.update({ where: { slug: SERVICE }, data: { principalActionsPerHour: original } });
  });

  async function allowedOf(results: { body: { authorised: boolean } }[]) {
    return results.filter((r) => r.body.authorised).length;
  }

  it("1 agent × 12 actions, 12 sub-agents × 1 action, and 2 separate mandates all share one budget", async () => {
    // A: one agent, many actions
    const a = await newPrincipal();
    const { token: ta } = await authorise(a.id, ["view_tax_code"]);
    const A = await Promise.all(Array.from({ length: 12 }, () => check({ agent_token: ta, principal_id: a.id })));
    expect(await allowedOf(A)).toBe(LIMIT);
    const refused = A.find((r) => !r.body.authorised)!;
    expect(refused.body.reason).toBe("CAPACITY_EXCEEDED");
    expect(refused.body.capacity).toMatchObject({ rule: "agent_actions_per_hour", limit: LIMIT, remaining: 0 });

    // B: one person, many sub-agents, one action each
    const b = await newPrincipal();
    const { token: tb } = await authorise(b.id, ["view_tax_code"]);
    const kids = await Promise.all(Array.from({ length: 12 }, (_, i) => subDelegate(tb, b.id, ["view_tax_code"], `worker ${i}`)));
    const B = await Promise.all(kids.map((k) => check({ agent_token: k.body.token, principal_id: b.id })));
    expect(await allowedOf(B)).toBe(LIMIT);

    // B2: the same person grants two separate mandates (two agents); still one budget.
    const c = await newPrincipal();
    const { token: t1 } = await authorise(c.id, ["view_tax_code"]);
    const ghostAgent = await prisma.delegate.create({
      data: { name: "Second agent", type: "SOFTWARE_AGENT", provider: "Test", clientId: `second-${Date.now()}`, clientSecretHash: "x", redirectUris: [] },
    });
    const { signAgentToken } = await import("@/lib/agent-auth");
    const t2 = await signAgentToken(ghostAgent.id, ghostAgent.clientId);
    const req2 = await prisma.authorisationRequest.create({
      data: {
        delegateId: ghostAgent.id,
        serviceId: (await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } })).id,
        expiresAt: new Date(Date.now() + 86_400_000),
        permissions: { create: [{ capabilityId: (await prisma.capability.findFirstOrThrow({ where: { code: "view_tax_code" } })).id }] },
      },
    });
    await approveRequest(req2.id, c.id);
    const C = await Promise.all(Array.from({ length: 12 }, (_, i) => check({ agent_token: i % 2 ? t1 : t2, principal_id: c.id })));
    expect(await allowedOf(C)).toBe(LIMIT);
  });

  it("a different person has their own budget", async () => {
    const people = await Promise.all(Array.from({ length: 3 }, () => newPrincipal()));
    const results = await Promise.all(
      people.map(async (p) => {
        const { token } = await authorise(p.id, ["view_tax_code"]);
        return check({ agent_token: token, principal_id: p.id });
      }),
    );
    expect(results.every((r) => r.body.authorised)).toBe(true);
  });
});

describe("step-up for consequential actions", () => {
  it("changing the refund bank account needs the person's fresh approval each time, whoever asks", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const first = await check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" });
    expect(first.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED" });
    expect(first.body.step_up.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(first.body.step_up.approve_url).toContain("/approve?code=");

    // Sam approves once (as the approve page does).
    await prisma.stepUp.update({ where: { userCode: first.body.step_up.user_code }, data: { status: "APPROVED", approvedAt: new Date() } });
    expect((await check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" })).body.authorised).toBe(true);
    // Used up: the next one needs approval again.
    expect((await check({ agent_token: token, principal_id: sam.id, capability: "change_refund_account" })).body.reason).toBe("STEP_UP_REQUIRED");
  });
});

describe("request flow still creates the root delegation", () => {
  it("approving a request makes the agent the root of the chain", async () => {
    const sam = await newPrincipal();
    const { token } = await demoAgent();
    const created = (await createRequest(token)).body;
    const auth = await approveRequest(created.id, sam.id);
    const root = await prisma.delegation.findFirstOrThrow({ where: { mandateId: auth.id } });
    expect(root).toMatchObject({ depth: 0, parentDelegationId: null, capabilities: ["view_tax_code"] });
  });
});
