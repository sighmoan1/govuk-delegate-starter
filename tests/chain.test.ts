import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, check, DELEGATE, SERVICE, demoAgent, createRequest, approveRequest } from "./helpers";

afterAll(() => prisma.$disconnect());

// Identify the agent. Authorise the mandate. (Limits on the person live in the service: see check-spends-nothing.test.ts.)
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
