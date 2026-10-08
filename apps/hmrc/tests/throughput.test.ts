import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { findOrCreateTaxpayer, type Taxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { requestMetrics } from "@/lib/events";
import { admitRequest, configureThroughput, currentLimits, resetThroughput, type Admission } from "@/lib/throughput";
import { runOperation } from "@/lib/operation";
import { GET as taxCodeApi } from "@/app/api/tax-code/route";
import { GET as progressApi } from "@/app/api/claims/progress/route";
import { POST as claimApi } from "@/app/api/job-expenses/route";
import { POST as respondApi } from "@/app/api/claims/respond/route";

// GOV.UK Delegate is a separate service. These tests are about HMRC's own
// admission and rules, so its check is replaced by a table: token -> who it is
// and which person it acts for. Delegate's checks spend nothing either way.
const delegate = vi.hoisted(() => ({
  agents: new Map<string, { delegateId: string; subject: string }>(),
  outcomes: [] as { check_id: string; status: string; reason?: string | null }[],
  down: false,
}));
vi.mock("@/lib/delegate-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/delegate-client")>();
  return {
    ...actual,
    askDelegate: async (i: { agent_token: string }) => {
      if (delegate.down) throw new actual.DelegateUnavailableError("check", true, "injected");
      const a = delegate.agents.get(i.agent_token);
      const check_id = randomUUID();
      if (!a) return { authorised: false, reason: "NO_AUTHORISATION", check_id };
      return {
        authorised: true, status: "ACTIVE", authorisation_id: "a", principal_id: "p", subject: a.subject, check_id,
        delegate: { id: a.delegateId, name: `Agent ${a.delegateId}`, provider: "test" },
        chain: { mandate_id: "m", delegation_id: `d-${a.delegateId}`, parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" },
      };
    },
    reportOutcome: async (o: { check_id: string; status: string; reason?: string | null }) => { delegate.outcomes.push(o); return true; },
    recordReceipt: async () => "receipt-1",
    disputedReceipts: async () => ({ ok: true as const, disputed: [] as string[] }),
  };
});

beforeEach(() => { resetThroughput(); delegate.agents.clear(); delegate.outcomes.length = 0; delegate.down = false; });
afterEach(() => { delete process.env.HMRC_SHED_LOAD; });
afterAll(async () => { resetThroughput(); await prisma.$disconnect(); });

const person = () => findOrCreateTaxpayer(`urn:test:${randomUUID()}`);
const ORIGIN = "http://localhost:3302";

const asHuman = async (t: Taxpayer, path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { cookie: `${SESSION_COOKIE}=${await signSession(t.id)}`, "content-type": "application/json", ...(init.key ? { "idempotency-key": init.key } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

/** An agent provider acting for a person. Same token = same provider (delegate id). */
const agentFor = (t: Taxpayer, delegateId: string) => {
  const token = `tok-${delegateId}-${t.id}`;
  delegate.agents.set(token, { delegateId, subject: t.oneLoginSubject });
  return token;
};
const asAgent = (token: string, t: Taxpayer, path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "x-principal-id": t.id, "content-type": "application/json", ...(init.key ? { "idempotency-key": init.key } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const j = async (res: Response) => ({ status: res.status, headers: res.headers, body: (await res.json()) as any });
const events = (t: Taxpayer) => prisma.serviceEvent.findMany({ where: { subject: t.oneLoginSubject }, orderBy: { timestamp: "asc" } });
const claimsOf = (t: Taxpayer) => prisma.claim.count({ where: { taxpayerId: t.id, kind: "job_expenses" } });
const refused = (a: Admission) => (a.ok ? null : a.refusal);

describe("admission: explicit limits per operation, cost class and scope", () => {
  it("each operation has its own cost class: throttling an expensive lookup does not touch writes", () => {
    configureThroughput({ principal: { expensive_query: 2 } });
    const s = `urn:test:${randomUUID()}`;
    const view = () => admitRequest({ capability: "view_tax_code", subject: s });
    expect(view().ok).toBe(true);
    expect(view().ok).toBe(true);
    const third = refused(view());
    expect(third).toMatchObject({ kind: "TECHNICAL_THROTTLE", reason: "RATE_LIMITED", scope: "principal", costClass: "expensive_query", operation: "view_tax_code", rule: "principal_expensive_query_per_minute", limit: 2 });
    expect(third && "retryAfterSeconds" in third && third.retryAfterSeconds).toBeGreaterThan(0);
    // The same person's writes are in another class and are untouched.
    for (const cap of ["claim_job_expenses", "respond_to_query", "change_address"]) expect(admitRequest({ capability: cap, subject: s }).ok).toBe(true);
  });

  it("many principals at one agent provider share the provider's budget; another provider is unaffected", () => {
    configureThroughput({ operator: { agent: { write: 3 } } });
    const provider = { kind: "agent" as const, key: "provider-A" };
    const people = Array.from({ length: 4 }, () => `urn:test:${randomUUID()}`);
    const results = people.map((subject) => admitRequest({ capability: "claim_job_expenses", operator: provider, subject }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(refused(results[3])).toMatchObject({ kind: "TECHNICAL_THROTTLE", scope: "operator", costClass: "write", rule: "operator_agent_write_per_minute", limit: 3 });
    // The person who was held back is not at fault, and another provider can still act for them.
    expect(admitRequest({ capability: "claim_job_expenses", operator: { kind: "agent", key: "provider-B" }, subject: people[3] }).ok).toBe(true);
  });

  it("mixed agents for one person draw on one person-level budget, and a human gets the same one", () => {
    configureThroughput({ principal: { read: 4 } });
    const s = `urn:test:${randomUUID()}`;
    const ask = (op: { kind: "human" | "agent"; key: string }) => admitRequest({ capability: "view_claim_status", operator: op, subject: s });
    const out = [ask({ kind: "agent", key: "A" }), ask({ kind: "agent", key: "B" }), ask({ kind: "human", key: "sam" }), ask({ kind: "agent", key: "C" }), ask({ kind: "agent", key: "A" })];
    expect(out.map((r) => r.ok)).toEqual([true, true, true, true, false]);
    expect(refused(out[4])).toMatchObject({ scope: "principal", limit: 4 });
    // The person budget has no entry for who is asking: an agent cannot have more than a person.
    expect(Object.keys(currentLimits().principal).sort()).toEqual(["expensive_query", "read", "status_poll", "write"]);
  });

  it("service-wide protection applies to everyone, by cost class", () => {
    configureThroughput({ service: { status_poll: 2 } });
    const poll = () => admitRequest({ capability: "check_claim_progress", subject: `urn:test:${randomUUID()}`, operator: { kind: "agent", key: `p-${randomUUID()}` } });
    expect([poll().ok, poll().ok, poll().ok]).toEqual([true, true, false]);
    expect(refused(poll())).toMatchObject({ scope: "service", costClass: "status_poll" });
  });

  it("an idempotent retry costs a read, not another write", () => {
    configureThroughput({ principal: { write: 1 } });
    const s = `urn:test:${randomUUID()}`;
    const key = `${s}:claim_job_expenses:k1`;
    const first = admitRequest({ capability: "claim_job_expenses", subject: s, retryKey: key });
    expect(first).toMatchObject({ ok: true, costClass: "write" });
    for (let i = 0; i < 20; i++) expect(admitRequest({ capability: "claim_job_expenses", subject: s, retryKey: key })).toMatchObject({ ok: true, costClass: "read" });
    // A genuinely new attempt is a write, and the tiny test limit is spent.
    expect(refused(admitRequest({ capability: "claim_job_expenses", subject: s, retryKey: `${s}:claim_job_expenses:k2` }))).toMatchObject({ scope: "principal", costClass: "write" });
  });

  it("temporary unavailability is a 503-class refusal with retry guidance, not a throttle", () => {
    process.env.HMRC_SHED_LOAD = "1";
    expect(refused(admitRequest({ capability: "claim_job_expenses", subject: "urn:test:x" }))).toMatchObject({ kind: "UNAVAILABLE", reason: "SERVICE_UNAVAILABLE", retryAfterSeconds: 30 });
  });
});

describe("routes: 429 and 503 are machine-readable, retryable and distinct from business outcomes", () => {
  it("the person's hourly tax-code limit is a 429 with Retry-After, never CAPACITY_EXCEEDED, and does not touch their claim", async () => {
    const t = await person();
    for (let i = 0; i < 60; i++) expect((await taxCodeApi(await asHuman(t, "/api/tax-code"))).status).toBe(200);
    const over = await j(await taxCodeApi(await asHuman(t, "/api/tax-code")));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(over.body).toMatchObject({
      decision: "DENY", reason: "RATE_LIMITED", kind: "TECHNICAL_THROTTLE", scope: "principal", cost_class: "expensive_query", operation: "view_tax_code",
      rule: "tax_code_views_per_hour", limit: 60, retryable: true, entitlement_affected: false,
    });
    expect(over.body.retry_after_seconds).toBe(Number(over.headers.get("retry-after")));
    expect(JSON.stringify(over.body)).not.toContain("CAPACITY_EXCEEDED");
    // Being held back from looking something up does not stop the person claiming.
    expect((await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {} }))).status).toBe(200);
    expect(await claimsOf(t)).toBe(1);
  });

  it("progress checks: the fifth in a day is a 429 for the poll, and the person's claims are unaffected", async () => {
    const t = await person();
    const token = agentFor(t, "poller");
    for (let i = 0; i < 4; i++) expect((await progressApi(asAgent(token, t, "/api/claims/progress"))).status).toBe(200);
    const fifth = await j(await progressApi(asAgent(token, t, "/api/claims/progress")));
    expect(fifth.status).toBe(429);
    expect(fifth.body).toMatchObject({ reason: "RATE_LIMITED", kind: "TECHNICAL_THROTTLE", cost_class: "status_poll", rule: "claim_progress_checks_per_day", limit: 4, retryable: true });
    expect(Number(fifth.headers.get("retry-after"))).toBeGreaterThan(3_600);
    expect(delegate.outcomes.at(-1)).toMatchObject({ status: "FAILED", reason: "RATE_LIMITED" });
    // A second agent for the same person shares the same polling allowance.
    const other = await j(await progressApi(asAgent(agentFor(t, "poller-2"), t, "/api/claims/progress")));
    expect(other.status).toBe(429);
  });

  it("an agent provider over its operator budget gets a 429 for that traffic only; nobody's entitlement is touched", async () => {
    configureThroughput({ operator: { agent: { write: 2 } } });
    const people = await Promise.all([person(), person(), person()]);
    const tokens = people.map((p) => agentFor(p, "busy-provider"));
    const res = [];
    for (let i = 0; i < people.length; i++) res.push(await j(await claimApi(asAgent(tokens[i], people[i], "/api/job-expenses", { method: "POST", body: {} }))));
    expect(res.map((r) => r.status)).toEqual([200, 200, 429]);
    expect(res[2].body).toMatchObject({ reason: "RATE_LIMITED", kind: "TECHNICAL_THROTTLE", scope: "operator", cost_class: "write", entitlement_affected: false, retryable: true });
    expect(Number(res[2].headers.get("retry-after"))).toBeGreaterThan(0);
    expect(delegate.outcomes.at(-1)).toMatchObject({ status: "FAILED", reason: "RATE_LIMITED" });
    // The held-back person has no claim and has used none of their own allowances ...
    expect(await claimsOf(people[2])).toBe(0);
    expect(await prisma.principalUsage.count({ where: { subject: people[2].oneLoginSubject } })).toBe(0);
    // ... and can make the claim themselves, because the throttle was about the provider's traffic.
    expect((await claimApi(await asHuman(people[2], "/api/job-expenses", { method: "POST", body: {} }))).status).toBe(200);
  });

  it("temporary unavailability is 503 with Retry-After, changes nothing, and a retry then works", async () => {
    const t = await person();
    process.env.HMRC_SHED_LOAD = "1";
    const shed = await j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {}, key: "k-503" })));
    expect(shed.status).toBe(503);
    expect(Number(shed.headers.get("retry-after"))).toBe(30);
    expect(shed.body).toMatchObject({ reason: "SERVICE_UNAVAILABLE", kind: "UNAVAILABLE", retryable: true, entitlement_affected: false });
    expect(await claimsOf(t)).toBe(0);
    delete process.env.HMRC_SHED_LOAD;
    const retry = await j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {}, key: "k-503" })));
    expect(retry.status).toBe(200);
    expect(await claimsOf(t)).toBe(1);
  });

  it("GOV.UK Delegate being down is also 503 with Retry-After, not a refusal of authority", async () => {
    const t = await person();
    delegate.down = true;
    const res = await j(await claimApi(asAgent(agentFor(t, "x"), t, "/api/job-expenses", { method: "POST", body: {} })));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.body).toMatchObject({ reason: "DELEGATE_UNAVAILABLE", kind: "UNAVAILABLE", retryable: true });
    expect(await claimsOf(t)).toBe(0);
  });
});

describe("a business refusal is not a rate-limit refusal", () => {
  it("duplicate and new-evidence refusals are 409 with no Retry-After, logged and counted as business refusals", async () => {
    const t = await person();
    const token = agentFor(t, "ai");
    expect((await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: { evidence: "payslip.pdf" } }))).status).toBe(200);
    const noEvidence = await j(await claimApi(asAgent(token, t, "/api/job-expenses", { method: "POST", body: {} })));
    const dupe = await j(await claimApi(asAgent(token, t, "/api/job-expenses", { method: "POST", body: { evidence: " PAYSLIP.pdf" } })));
    for (const [r, reason] of [[noEvidence, "NEW_EVIDENCE_REQUIRED"], [dupe, "DUPLICATE_SUBMISSION"]] as const) {
      expect(r.status).toBe(409);
      expect(r.headers.get("retry-after")).toBeNull();
      expect(r.body).toMatchObject({ reason, kind: "BUSINESS_REFUSAL", retryable: false });
      expect(r.body).not.toHaveProperty("retry_after_seconds");
    }
    const log = await events(t);
    expect(log.filter((e) => e.outcome === "THROTTLED")).toHaveLength(0);
    expect(log.filter((e) => e.outcomeClass === "BUSINESS_REFUSAL")).toHaveLength(2);
    expect(requestMetrics(log)).toMatchObject({ httpRequests: 3, uniqueOperations: 1, businessRefusals: 2, technicalThrottles: 0, authorisedChecks: 2 });
  });

  it("the open-case limit (provisional policy) is a 409 business refusal named CAPACITY_EXCEEDED, never a 429", async () => {
    const t = await person();
    for (const evidence of ["one", "two", "three"]) expect((await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: { evidence } }))).status).toBe(200);
    const fourth = await j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: { evidence: "four" } })));
    expect(fourth.status).toBe(409);
    expect(fourth.headers.get("retry-after")).toBeNull();
    expect(fourth.body).toMatchObject({ reason: "CAPACITY_EXCEEDED", kind: "BUSINESS_REFUSAL", rule: "max_open_cases", limit: 3, retryable: false });
    const last = (await events(t)).at(-1)!;
    expect(last).toMatchObject({ outcome: "REFUSED", outcomeClass: "BUSINESS_REFUSAL", throttleScope: null, retryAfterSeconds: null });
  });

  it("a throttle is logged as a throttle and a refusal as a refusal, in the same metrics", async () => {
    configureThroughput({ principal: { expensive_query: 1 } });
    const t = await person();
    await taxCodeApi(await asHuman(t, "/api/tax-code"));
    await taxCodeApi(await asHuman(t, "/api/tax-code")); // throttled
    await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {} }));
    await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {} })); // business refusal
    const log = await events(t);
    expect(log.map((e) => e.outcomeClass)).toEqual(["UNIQUE_OPERATION", "TECHNICAL_THROTTLE", "UNIQUE_OPERATION", "BUSINESS_REFUSAL"]);
    expect(log[1]).toMatchObject({ outcome: "THROTTLED", reason: "RATE_LIMITED", throttleScope: "principal", costClass: "expensive_query" });
    expect(log[1].retryAfterSeconds).toBeGreaterThan(0);
    expect(requestMetrics(log)).toMatchObject({ httpRequests: 4, uniqueOperations: 2, technicalThrottles: 1, businessRefusals: 1, replays: 0 });
  });
});

describe("integrity rules hold for humans and AI alike, and across sub-agents", () => {
  it("one claim per tax year: a person, an agent and a hundred sub-agents together make one claim", async () => {
    const t = await person();
    const requests = [
      async () => claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {} })),
      ...Array.from({ length: 100 }, (_, i) => async () => claimApi(asAgent(agentFor(t, `sub-${i}`), t, "/api/job-expenses", { method: "POST", body: {} }))),
    ];
    const results = await Promise.all(requests.map((r) => r().then(j)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    // Every other request got a business answer or, if a traffic budget was exceeded, a clearly separate technical one.
    for (const r of results.filter((r) => r.status !== 200)) expect([409, 429]).toContain(r.status);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.reason === "NEW_EVIDENCE_REQUIRED")).toBe(true);
    expect(await claimsOf(t)).toBe(1);
  });

  it("one answer per query: the second answer is a DUPLICATE_SUBMISSION whoever sends it", async () => {
    const t = await person();
    await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {} }));
    const q = (await prisma.claimQuery.findFirstOrThrow({ where: { claim: { taxpayerId: t.id } } })).id;
    const first = await j(await respondApi(asAgent(agentFor(t, "ai-1"), t, "/api/claims/respond", { method: "POST", body: { query_id: q, answer: "First" } })));
    expect(first.status).toBe(200);
    const byHuman = await j(await respondApi(await asHuman(t, "/api/claims/respond", { method: "POST", body: { query_id: q, answer: "Second" } })));
    const byAi = await j(await respondApi(asAgent(agentFor(t, "ai-2"), t, "/api/claims/respond", { method: "POST", body: { query_id: q, answer: "Third" } })));
    for (const r of [byHuman, byAi]) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ reason: "DUPLICATE_SUBMISSION", kind: "BUSINESS_REFUSAL", rule: "one_answer_per_query" });
      expect(r.headers.get("retry-after")).toBeNull();
    }
    expect((await prisma.claimQuery.findUniqueOrThrow({ where: { id: q } })).answer).toBe("First");
  });

  it("the refund-account change limit (provisional policy) is a business refusal, not a throttle", async () => {
    const t = await person();
    const first = await runOperation(t, "change_refund_account", {}, async () => ({ change_reference: "RA-1" }));
    const second = await runOperation(t, "change_refund_account", {}, async () => ({ change_reference: "RA-2" }));
    expect(first.ok).toBe(true);
    expect(second.ok === false && second.refusal).toMatchObject({ kind: "BUSINESS_REFUSAL", reason: "CAPACITY_EXCEEDED", rule: "refund_account_changes_per_30_days", limit: 1 });
  });
});

describe("idempotent replays", () => {
  it("are not new unique operations and are not throttled as writes", async () => {
    configureThroughput({ principal: { write: 1 } });
    const t = await person();
    const key = randomUUID();
    const send = async () => j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: { evidence: "e.pdf" }, key })));
    const first = await send();
    expect(first.status).toBe(200);
    const replays = [];
    for (let i = 0; i < 5; i++) replays.push(await send());
    expect(replays.every((r) => r.status === 200 && r.body.idempotent_replay === true && r.headers.get("idempotent-replayed") === "true")).toBe(true);
    expect(new Set(replays.map((r) => r.body.result.claim_reference))).toEqual(new Set([first.body.result.claim_reference]));
    expect(await claimsOf(t)).toBe(1);
    const log = await events(t);
    expect(requestMetrics(log)).toMatchObject({ httpRequests: 6, uniqueOperations: 1, replays: 5, technicalThrottles: 0 });
    expect(log.filter((e) => e.outcomeClass === "REPLAY").every((e) => e.costClass === "read")).toBe(true);
    // The replays did not use the write budget: with it spent by the first claim, a new write is the one that is throttled.
    const fresh = await j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: { evidence: "other.pdf" }, key: randomUUID() })));
    expect(fresh.status).toBe(429);
    expect(fresh.body.scope).toBe("principal");
    expect(await claimsOf(t)).toBe(1);
  });
});
