import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { findOrCreateTaxpayer } from "@/lib/taxpayers";

// A change HMRC makes on the strength of the person's approval of THAT change
// (issue #19). GOV.UK Delegate is replaced by a fake that records every call and
// can be made to fail, so these tests can reach states a running Delegate never
// produces: it is unreachable, it refuses, HMRC's own write fails after the
// reservation, the report of completion is lost. Delegate's side of the protocol
// is tested against the real thing in tests/step-up.test.ts at the repo root.

const mocks = vi.hoisted(() => ({ failNextChange: false }));
vi.mock("@/lib/taxpayers", async (orig) => {
  const real = await orig<typeof import("@/lib/taxpayers")>();
  return {
    ...real,
    changeRefundAccount: (...a: Parameters<typeof real.changeRefundAccount>) => {
      if (mocks.failNextChange) { mocks.failNextChange = false; throw new Error("boom: HMRC's own write failed"); }
      return real.changeRefundAccount(...a);
    },
  };
});
import { POST as refundApi } from "@/app/api/refund-account/route";
import { POST as claimApi } from "@/app/api/job-expenses/route";

afterAll(() => prisma.$disconnect());

type Call = { path: string; body: any };
type Fake = {
  calls: Call[];
  state: "APPROVED" | "REDEEMED" | "IN_PROGRESS" | "AWAITING_APPROVAL";
  reserve: "ok" | "refuse-in-use" | "down";
  done: "ok" | "down";
  subject: string;
};

let fake: Fake;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const callsTo = (suffix: string) => fake.calls.filter((c) => c.path.endsWith(suffix));

beforeEach(() => {
  process.env.HMRC_SERVICE_KEY = "k";
  process.env.DELEGATE_RETRY_DELAY_MS = "1";
  mocks.failNextChange = false;
  fake = { calls: [], state: "APPROVED", reserve: "ok", done: "ok", subject: `urn:test:${randomUUID()}` };
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    fake.calls.push({ path, body });
    if (path === "/api/outcomes") return json(201, { outcome_id: "o1" });
    if (path === "/api/authorisations/check") {
      const stepUp = body.proposal
        ? { state: fake.state, proposal_id: "step-1", proposal_hash: "hash", message: "", ...(fake.state === "AWAITING_APPROVAL" ? { user_code: "ABCD-2345", approve_url: "http://x/approve?code=ABCD-2345", details: [{ label: "Sort code", value: "20-00-00" }] } : {}) }
        : undefined;
      const delegate = { id: "d1", name: "Test agent", provider: "Test" };
      if (fake.state === "AWAITING_APPROVAL" && body.proposal) return json(200, { authorised: false, reason: "STEP_UP_REQUIRED", delegate, step_up: stepUp, check_id: "chk" });
      return json(200, {
        authorised: true, status: "ACTIVE", authorisation_id: "m1", principal_id: "p1", subject: fake.subject, delegate,
        chain: { mandate_id: "m1", delegation_id: "dl1", parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" },
        check_id: "chk", ...(stepUp ? { step_up: stepUp } : {}),
      });
    }
    if (path === "/api/step-ups/reserve") {
      if (fake.reserve === "down") throw new TypeError("fetch failed");
      if (fake.reserve === "refuse-in-use") return json(409, { reserved: false, reason: "STEP_UP_IN_USE", state: "IN_PROGRESS", message: "Another operation is using this approval.", retry_after_seconds: 42 }, { "retry-after": "42" });
      return json(200, { reserved: true, reservation_id: body.reservation_id });
    }
    if (path === "/api/step-ups/complete") return fake.done === "down" ? json(503, {}) : json(200, { state: "USED", duplicate: false });
    if (path === "/api/step-ups/release") return json(200, { released: true });
    return json(404, {});
  });
});
afterEach(() => vi.unstubAllGlobals());

const DETAILS = { account_name: "Sam Taylor", sort_code: "20-00-00", account_number: "55779911" };
const req = (path: string, key: string | null, body: unknown = DETAILS) =>
  new Request(`http://localhost:3302${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer agent-token", "x-principal-id": "p1", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(body),
  });
const refund = (key: string | null, body?: unknown) => refundApi(req("/api/refund-account", key, body));
const changes = async () => {
  const t = await findOrCreateTaxpayer(fake.subject);
  return prisma.claim.count({ where: { taxpayerId: t.id, kind: "refund_account" } });
};
const records = () => prisma.idempotencyRecord.count({ where: { subject: fake.subject } });

describe("what HMRC tells Delegate", () => {
  it("sends the client's key and the normalised content of the change, to the check and again to the reservation", async () => {
    const key = randomUUID();
    const res = await refund(key, { account_name: "  Sam   Taylor ", sort_code: "200000", account_number: "5577 9911" });
    expect(res.status).toBe(200);
    const proposal = { idempotency_key: key, payload: DETAILS };
    expect(callsTo("/check")[0].body.proposal).toEqual(proposal);
    expect(callsTo("/reserve")[0].body.proposal).toEqual(proposal);
    expect(callsTo("/reserve")[0].body.reservation_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks nothing of Delegate's approval for capabilities that need none", async () => {
    const res = await claimApi(req("/api/job-expenses", randomUUID(), {}));
    expect(res.status).toBe(200);
    expect(callsTo("/check")[0].body.proposal).toBeUndefined();
    expect(callsTo("/reserve")).toHaveLength(0);
  });
});

describe("the approval is used only when HMRC admits the change", () => {
  it("makes the change once and spends the approval after the commit, with HMRC's reference", async () => {
    const res = await refund(randomUUID());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(callsTo("/reserve")).toHaveLength(1);
    expect(callsTo("/complete")).toEqual([{ path: "/api/step-ups/complete", body: expect.objectContaining({ proposal_id: "step-1", reference: body.result.change_reference }) }]);
    expect(callsTo("/release")).toHaveLength(0);
    expect(await changes()).toBe(1);
  });

  it("waits for the person: no reservation, nothing made, and the details come back", async () => {
    fake.state = "AWAITING_APPROVAL";
    const res = await refund(randomUUID());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: "STEP_UP_REQUIRED", step_up: { state: "AWAITING_APPROVAL", user_code: "ABCD-2345", details: [{ label: "Sort code", value: "20-00-00" }] } });
    expect(callsTo("/reserve")).toHaveLength(0);
    expect(await changes()).toBe(0);
  });

  it("HMRC's own rules turn the change down before any reservation: nothing is reserved, so nothing can be spent", async () => {
    expect((await refund(randomUUID())).status).toBe(200); // uses the one refund-account change a person gets
    fake.calls.length = 0;
    const res = await refund(randomUUID(), { ...DETAILS, account_number: "11112222" });
    expect(res.status).toBe(429);
    expect(callsTo("/reserve")).toHaveLength(0);
    expect(callsTo("/complete")).toHaveLength(0);
    expect(await changes()).toBe(1);
  });

  it("HMRC's own write fails after the reservation: it rolls back, the approval is handed back, nothing is recorded", async () => {
    mocks.failNextChange = true;
    const key = randomUUID();
    await expect(refund(key)).rejects.toThrow("boom");
    const reserved = callsTo("/reserve")[0].body.reservation_id;
    expect(callsTo("/release")).toHaveLength(1);
    expect(callsTo("/release")[0].body).toMatchObject({ proposal_id: "step-1", reservation_id: reserved });
    expect(callsTo("/complete")).toHaveLength(0);
    expect(await changes()).toBe(0);
    expect(await records()).toBe(0);
    // The failure left HMRC clean, so the same request now succeeds.
    expect((await refund(key)).status).toBe(200);
    expect(await changes()).toBe(1);
  });
});

describe("service failure", () => {
  it("Delegate unreachable at the reservation: 503, nothing made or recorded, and the retry is a first try", async () => {
    fake.reserve = "down";
    const key = randomUUID();
    const res = await refund(key);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ decision: "DENY", reason: "DELEGATE_UNAVAILABLE", retryable: true });
    expect(callsTo("/reserve").length).toBeGreaterThan(1); // retried with the same reservation id
    expect(new Set(callsTo("/reserve").map((c) => c.body.reservation_id)).size).toBe(1);
    expect(await changes()).toBe(0);
    expect(await records()).toBe(0);
    fake.reserve = "ok";
    expect((await refund(key)).status).toBe(200);
    expect(await changes()).toBe(1);
  });

  it("the approval is held by another operation: 409 with retry-after, nothing made", async () => {
    fake.reserve = "refuse-in-use";
    const res = await refund(randomUUID());
    expect(res.status).toBe(409);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(await res.json()).toMatchObject({ reason: "STEP_UP_IN_USE", step_up_state: "IN_PROGRESS" });
    expect(await changes()).toBe(0);
    expect(callsTo("/release")).toHaveLength(0); // it never held it
  });

  it("the report of completion is lost: the caller still gets the change that was made, and the next retry finishes the report", async () => {
    fake.done = "down";
    const key = randomUUID();
    const first = await refund(key);
    expect(first.status).toBe(200);
    const ref = (await first.json()).result.change_reference;
    expect(await changes()).toBe(1);
    // Delegate still shows it unspent (as it would after a crash between HMRC's commit and the report).
    fake.done = "ok";
    fake.calls.length = 0;
    const retry = await refund(key);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ idempotent_replay: true, result: { change_reference: ref } });
    expect(callsTo("/reserve")).toHaveLength(0); // a retry of a committed change never reserves again
    expect(callsTo("/complete")).toHaveLength(1);
    expect(await changes()).toBe(1);
  });

  it("a retry once the approval is recorded as spent is answered from HMRC's stored result and touches nothing", async () => {
    const key = randomUUID();
    const first = await (await refund(key)).json();
    fake.state = "REDEEMED";
    fake.calls.length = 0;
    const retry = await refund(key);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ idempotent_replay: true, result: { change_reference: first.result.change_reference } });
    expect(callsTo("/reserve")).toHaveLength(0);
    expect(callsTo("/complete")).toHaveLength(0);
    expect(await changes()).toBe(1);
  });

  it("Delegate says the approval was spent but HMRC holds no such change: refused, never re-run", async () => {
    fake.state = "REDEEMED";
    const res = await refund(randomUUID());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "STEP_UP_ALREADY_USED" });
    expect(callsTo("/reserve")).toHaveLength(0);
    expect(await changes()).toBe(0);
  });
});

describe("changed content and concurrency", () => {
  it("the same key with different content is refused by HMRC itself, even though Delegate says APPROVED", async () => {
    const key = randomUUID();
    expect((await refund(key)).status).toBe(200);
    fake.calls.length = 0;
    const res = await refund(key, { ...DETAILS, account_number: "11112222" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
    expect(callsTo("/reserve")).toHaveLength(0);
    expect(await changes()).toBe(1);
  });

  it("twenty racing copies of one approved change: one reservation, one change, one completion report", async () => {
    const key = randomUUID();
    const rs = await Promise.all(Array.from({ length: 20 }, () => refund(key)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const bodies = await Promise.all(rs.map((r) => r.json()));
    expect(new Set(bodies.map((b) => b.result.change_reference)).size).toBe(1);
    expect(bodies.filter((b) => !b.idempotent_replay)).toHaveLength(1);
    expect(callsTo("/reserve")).toHaveLength(1);
    expect(await changes()).toBe(1);
    expect(await records()).toBe(1);
  });
});
