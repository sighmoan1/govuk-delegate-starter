import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { findOrCreateTaxpayer, type Taxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { configureThroughput, resetThroughput, PRINCIPAL_WINDOWS } from "@/lib/throughput";
import { progressVersion, ifNoneMatchHolds, etagOf, registerProgressVersionInput, type VersionedClaim } from "@/lib/progress-version";
import { GET as progressApi } from "@/app/api/claims/progress/route";
import { GET as statusApi } from "@/app/api/claims/route";
import { POST as claimApi } from "@/app/api/job-expenses/route";
import { POST as employmentApi } from "@/app/api/employment/route";
import { POST as respondApi } from "@/app/api/claims/respond/route";

// Issue #23: GET /api/claims/progress with ETag / If-None-Match / 304, freshness and back-off guidance,
// private no-store, and per-person isolation. Delegate is a separate service, so its check is
// replaced by a table (token -> person), and which answers have been disputed is controlled by the test.
const delegate = vi.hoisted(() => ({
  agents: new Map<string, { delegateId: string; subject: string }>(),
  disputed: new Set<string>(),
  receipts: 0,
  disputeCheckDown: false,
}));
vi.mock("@/lib/delegate-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/delegate-client")>();
  return {
    ...actual,
    askDelegate: async (i: { agent_token: string }) => {
      const a = delegate.agents.get(i.agent_token);
      const check_id = randomUUID();
      if (!a) return { authorised: false, reason: "NO_AUTHORISATION", check_id };
      return {
        authorised: true, status: "ACTIVE", authorisation_id: "a", principal_id: "p", subject: a.subject, check_id,
        delegate: { id: a.delegateId, name: `Agent ${a.delegateId}`, provider: "test" },
        chain: { mandate_id: "m", delegation_id: `d-${a.delegateId}`, parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" },
      };
    },
    reportOutcome: async () => true,
    recordReceipt: async () => `receipt-${++delegate.receipts}`,
    disputedReceipts: async (ids: string[]) => (delegate.disputeCheckDown ? { ok: false as const } : { ok: true as const, disputed: ids.filter((id) => delegate.disputed.has(id)) }),
  };
});

beforeEach(() => { resetThroughput(); delegate.agents.clear(); delegate.disputed.clear(); delegate.disputeCheckDown = false; });
afterAll(async () => { resetThroughput(); await prisma.$disconnect(); });

const person = () => findOrCreateTaxpayer(`urn:test:${randomUUID()}`);
const ORIGIN = "http://localhost:3302";
const PATH = "/api/claims/progress";

const agentFor = (t: Taxpayer, delegateId = "poller") => {
  const token = `tok-${delegateId}-${t.id}`;
  delegate.agents.set(token, { delegateId, subject: t.oneLoginSubject });
  return token;
};
const asAgent = (token: string, t: Taxpayer, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "x-principal-id": t.id, "content-type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const j = async (res: Response) => {
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
};

/** A fresh daily allowance: tests that need more than four polls for one person clear the window (as time passing would). */
const newDay = (t: Taxpayer) => prisma.principalUsage.deleteMany({ where: { subject: t.oneLoginSubject } });

const poll = async (token: string, t: Taxpayer, headers: Record<string, string> = {}, query = "") => j(await progressApi(asAgent(token, t, `${PATH}${query}`, { headers })));
const send = async (token: string, t: Taxpayer, path: string, body: unknown = {}) => j(await (path === "/api/job-expenses" ? claimApi : path === "/api/employment" ? employmentApi : respondApi)(asAgent(token, t, path, { method: "POST", body })));

/** A person with one working-from-home claim and HMRC's one open question. */
async function claimed() {
  const t = await person();
  const token = agentFor(t);
  expect((await send(token, t, "/api/job-expenses")).status).toBe(200);
  const q = await prisma.claimQuery.findFirstOrThrow({ where: { claim: { taxpayerId: t.id } } });
  return { t, token, queryId: q.id };
}
const answer = (token: string, t: Taxpayer, query_id: string, text = "Policy applies from 6 April.") =>
  send(token, t, "/api/claims/respond", { query_id, answer: text, confirmed_by_person: true });
const etag = (r: { headers: Headers }) => r.headers.get("etag")!;

describe("ETag and conditional requests", () => {
  it("a first poll returns the status with a weak ETag, observed_at and the version it was made from", async () => {
    const { t, token } = await claimed();
    const r = await poll(token, t);
    expect(r.status).toBe(200);
    expect(etag(r)).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(r.body.result.version).toBe(etag(r).slice(3, -1));
    expect(new Date(r.body.result.observed_at).getTime()).toBeGreaterThan(Date.now() - 5_000);
    expect(r.body.result.checked_at).toBe(r.body.result.observed_at);
    expect(r.body.result.claims).toHaveLength(1);
  });

  it("unchanged state gets 304 Not Modified with no body; the ETag, no-store and poll interval are repeated", async () => {
    const { t, token } = await claimed();
    const first = await poll(token, t);
    const again = await poll(token, t, { "if-none-match": etag(first) });
    expect(again.status).toBe(304);
    expect(again.text).toBe("");
    expect(etag(again)).toBe(etag(first));
    expect(again.headers.get("cache-control")).toBe("private, no-store");
    expect(again.headers.get("x-suggested-poll-interval")).toBe(first.headers.get("x-suggested-poll-interval"));
    expect(again.headers.get("x-trusted-lane")).toBe("AUTHORISED_AGENT");
  });

  it("compares If-None-Match the way HTTP says: lists, weak and strong forms and *; anything else gets the full status", async () => {
    const { t, token } = await claimed();
    const first = await poll(token, t);
    const e = etag(first);
    const strong = e.slice(2);
    for (const header of [e, strong, `"nothing", ${e}`, `W/"other",${strong}`, "*"]) {
      expect((await poll(token, t, { "if-none-match": header })).status, header).toBe(304);
      await newDay(t); // not what is under test here: stay inside the allowance
    }
    // The digest can already end in 0: always flip, rather than occasionally
    // resending the matching tag and incorrectly expecting a full response.
    const different = `${e.slice(0, -2)}${e.at(-2) === "0" ? "1" : "0"}"`;
    expect(different).not.toBe(e);
    for (const header of ['W/"0000"', different, "", "garbage"]) {
      expect((await poll(token, t, { "if-none-match": header })).status, header).toBe(200);
      await newDay(t);
    }
  });

  it("ifNoneMatchHolds and progressVersion behave as units", () => {
    expect(ifNoneMatchHolds(null, "abc")).toBe(false);
    expect(ifNoneMatchHolds('W/"abc"', "abc")).toBe(true);
    expect(ifNoneMatchHolds('"abd", "abc"', "abc")).toBe(true);
    expect(ifNoneMatchHolds('"abcd"', "abc")).toBe(false);
    expect(etagOf("abc")).toBe('W/"abc"');
    const claim = (over: Partial<VersionedClaim> = {}): VersionedClaim => ({ id: "c1", reference: "R1", kind: "job_expenses", summary: "s", status: "OPEN", createdAt: new Date(1000), queries: [], ...over });
    const query = { id: "q1", status: "OPEN", askedAt: new Date(1000), answeredAt: null, stateChangedAt: new Date(1000), answerVersion: 0, answerWithdrawn: false, confirmedByPerson: false };
    const base = progressVersion("p1", [claim({ queries: [query] })], true);
    expect(progressVersion("p1", [claim({ queries: [query] })], true)).toBe(base); // stable
    expect(progressVersion("p1", [claim({ queries: [{ ...query, id: "q0" }, query].reverse() as never })], true)).not.toBe(base);
    const changes: [string, string][] = [
      ["another person", progressVersion("p2", [claim({ queries: [query] })], true)],
      ["claim status", progressVersion("p1", [claim({ status: "CLOSED", queries: [query] })], true)],
      ["answered", progressVersion("p1", [claim({ queries: [{ ...query, status: "ANSWERED", answeredAt: new Date(2000), stateChangedAt: new Date(2000) }] })], true)],
      ["reopened after a dispute", progressVersion("p1", [claim({ queries: [{ ...query, answerWithdrawn: true, answerVersion: 1, stateChangedAt: new Date(3000) }] })], true)],
      ["dispute check unavailable", progressVersion("p1", [claim({ queries: [query] })], false)],
      ["an extra input", progressVersion("p1", [claim({ queries: [query] })], true, ["queue:1"])],
    ];
    for (const [what, v] of changes) expect(v, what).not.toBe(base);
    expect(new Set(changes.map(([, v]) => v)).size).toBe(changes.length);
    // Input order does not matter.
    const two = [claim({ id: "a" }), claim({ id: "b", reference: "R2" })];
    expect(progressVersion("p1", [...two].reverse(), true)).toBe(progressVersion("p1", two, true));
  });
});

describe("the ETag changes whenever the status substantively changes", () => {
  it("a new claim, a reply, a dispute that withdraws the reply, and a fresh reply each give a new ETag and the full status; the old ETag is never 304 again", async () => {
    const { t, token, queryId } = await claimed();
    const seen: string[] = [];
    const next = async (expectChange: boolean) => {
      await newDay(t);
      const prev = seen.at(-1);
      const r = await poll(token, t, prev ? { "if-none-match": prev } : {});
      expect(r.status).toBe(expectChange ? 200 : 304);
      if (r.status === 200) { expect(seen).not.toContain(etag(r)); seen.push(etag(r)); }
      return r;
    };

    const first = await next(true);
    expect(first.body.result.claims[0]).toMatchObject({ status: "AWAITING_YOUR_REPLY", answered_queries: 0 });
    await next(false);

    // HMRC's question is answered.
    await answer(token, t, queryId);
    const answered = await next(true);
    expect(answered.body.result.claims[0]).toMatchObject({ status: "BEING_REVIEWED", answered_queries: 1 });
    await next(false);

    // The person disputes the answer: the next poll reconciles it, reopens the question and says so.
    const q = await prisma.claimQuery.findUniqueOrThrow({ where: { id: queryId } });
    delegate.disputed.add(q.receiptId!);
    const withdrawn = await next(true);
    expect(withdrawn.body.result.claims[0]).toMatchObject({ status: "AWAITING_YOUR_REPLY", answered_queries: 0 });
    expect(withdrawn.body.result.claims[0].open_queries[0]).toMatchObject({ query_id: queryId, earlier_answer_withdrawn: expect.any(String) });
    await next(false);

    // A new answer to the same question.
    expect((await answer(token, t, queryId, "Policy applies from 1 April.")).status).toBe(200);
    await next(true);
    await next(false);

    // A correction/new submission is another claim.
    expect((await send(token, t, "/api/employment", { details: "New employer" })).status).toBe(200);
    const corrected = await next(true);
    expect(corrected.body.result.claims).toHaveLength(2);
    await next(false);

    // Every ETag we ever held, other than the current one, now gets the full status.
    for (const old of seen.slice(0, -1)) {
      await newDay(t);
      expect((await poll(token, t, { "if-none-match": old })).status).toBe(200);
    }
  });

  it("a change made while the agent was backing off is not missed: the old ETag gets the new status afterwards", async () => {
    const { t, token, queryId } = await claimed();
    const first = await poll(token, t);
    await answer(token, t, queryId);
    const later = await poll(token, t, { "if-none-match": etag(first) });
    expect(later.status).toBe(200);
    expect(later.body.result.claims[0].answered_queries).toBe(1);
  });

  it("a status that may be stale is never called unchanged: with the dispute check down the full body is sent, with a notice", async () => {
    const { t, token, queryId } = await claimed();
    await answer(token, t, queryId); // an agent's answer is what HMRC must ask Delegate about
    const ok = await poll(token, t);
    expect(ok.body.result.dispute_check).toBe("OK");
    delegate.disputeCheckDown = true;
    const r = await poll(token, t, { "if-none-match": etag(ok) });
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ dispute_check: "UNAVAILABLE", dispute_check_notice: expect.any(String) });
    expect(etag(r)).not.toBe(etag(ok));
  });

  it("the version does not depend on ?since, and changed_since still works alongside", async () => {
    const { t, token, queryId } = await claimed();
    const a = await poll(token, t, {}, `?since=${encodeURIComponent(new Date().toISOString())}`);
    expect(a.body.result.changed_since).toBe(false);
    await newDay(t);
    const b = await poll(token, t, {}, "?since=2000-01-01T00:00:00Z");
    expect(b.body.result.changed_since).toBe(true);
    expect(etag(b)).toBe(etag(a));
    await newDay(t);
    expect((await poll(token, t, { "if-none-match": etag(a) }, "?since=garbage")).status).toBe(304);
    await answer(token, t, queryId);
    await newDay(t);
    const c = await poll(token, t, { "if-none-match": etag(a) }, `?since=${encodeURIComponent(a.body.result.observed_at)}`);
    expect(c.status).toBe(200);
    expect(c.body.result.changed_since).toBe(true);
  });

  it("other status sources can feed the version through the registered extension point", async () => {
    const { t, token } = await claimed();
    const before = await poll(token, t);
    let queue = "empty";
    const unregister = registerProgressVersionInput(async (id) => (id === t.id ? `queue:${queue}` : "queue:none"));
    try {
      await newDay(t);
      const withInput = await poll(token, t);
      expect(etag(withInput)).not.toBe(etag(before)); // registering a source is itself a change of version
      await newDay(t);
      expect((await poll(token, t, { "if-none-match": etag(withInput) })).status).toBe(304);
      queue = "1 queued";
      await newDay(t);
      expect((await poll(token, t, { "if-none-match": etag(withInput) })).status).toBe(200);
    } finally {
      unregister();
    }
  });
});

describe("one person's ETag exposes nothing of another's", () => {
  it("the same claim state for two people gives different ETags; each person presenting the other's gets their own full status", async () => {
    const a = await claimed();
    const b = await claimed();
    const ra = await poll(a.token, a.t);
    const rb = await poll(b.token, b.t);
    expect(etag(ra)).not.toBe(etag(rb));

    const crossed = await poll(b.token, b.t, { "if-none-match": etag(ra) });
    expect(crossed.status).toBe(200);
    expect(crossed.body.result.claims.map((c: { reference: string }) => c.reference)).toEqual(rb.body.result.claims.map((c: { reference: string }) => c.reference));
    expect(crossed.text).not.toContain(ra.body.result.claims[0].reference);
    expect(etag(crossed)).toBe(etag(rb));
    // `*` and the wildcard cannot be used to ask about someone else either: it only ever refers to the caller's own state.
    expect((await poll(a.token, a.t, { "if-none-match": etag(ra) })).status).toBe(304);
  });

  it("an agent authorised for one person cannot name another in x-principal-id to reach their status or match their ETag", async () => {
    const a = await claimed();
    const b = await claimed();
    const ra = await poll(a.token, a.t);
    // b's token, a's principal id: Delegate's answer decides whose records these are, and it says b's.
    const spoof = await j(await progressApi(asAgent(b.token, a.t, PATH, { headers: { "if-none-match": etag(ra) } })));
    expect(spoof.status).toBe(200);
    expect(spoof.text).not.toContain(ra.body.result.claims[0].reference);
    expect(spoof.body.result.taxpayer).toBe(b.t.name);
  });

  it("an unidentified caller presenting an ETag gets a refusal, not a 304 and not an ETag", async () => {
    const a = await claimed();
    const ra = await poll(a.token, a.t);
    const stranger = await j(await progressApi(new Request(`${ORIGIN}${PATH}`, { headers: { "if-none-match": etag(ra), "x-forwarded-for": "203.0.113.9" } })));
    expect(stranger.status).toBe(401);
    expect(stranger.headers.get("etag")).toBeNull();
    expect(stranger.headers.get("cache-control")).toBe("private, no-store");
    const unknownToken = await poll("not-a-token", a.t, { "if-none-match": etag(ra) });
    expect(unknownToken.status).toBe(403);
    expect(unknownToken.headers.get("etag")).toBeNull();
  });

  it("a signed-in person gets the same behaviour on their own session", async () => {
    const t = await person();
    const cookie = `${SESSION_COOKIE}=${await signSession(t.id)}`;
    const own = await j(await progressApi(new Request(`${ORIGIN}${PATH}`, { headers: { cookie } })));
    expect(own.status).toBe(200);
    const again = await j(await progressApi(new Request(`${ORIGIN}${PATH}`, { headers: { cookie, "if-none-match": etag(own) } })));
    expect(again.status).toBe(304);
    expect(again.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("repeated polling, back-off and retry guidance", () => {
  it("guides the agent: polling only, no push, an interval that fits the allowance, and where the limit lives", async () => {
    const { t, token } = await claimed();
    const r = await poll(token, t);
    const w = PRINCIPAL_WINDOWS.check_claim_progress;
    const p = r.body.result.polling;
    expect(p).toMatchObject({ delivery: "polling_only", push_or_webhooks: false, suggested_next_poll_seconds: Math.ceil(w.windowMs / 1000 / w.limit), limit: { rule: w.rule, checks: w.limit, per_seconds: w.windowMs / 1000 } });
    expect(r.headers.get("x-suggested-poll-interval")).toBe(String(p.suggested_next_poll_seconds));
    // The existing capacity meter is still reported alongside.
    expect(r.body.capacity).toMatchObject({ rule: w.rule, limit: w.limit, used: 1 });
    // Honest about not pushing: nothing in the guidance promises webhooks or subscriptions.
    expect(JSON.stringify(p).toLowerCase()).not.toMatch(/subscribe|webhook url|callback url/);
  });

  it("an agent that keeps to its allowance gets 200 then 304s; the poll over it is 429 with Retry-After, no ETag and no claim of a problem with the claim; waiting loses nothing", async () => {
    const { t, token, queryId } = await claimed();
    const first = await poll(token, t);
    for (let i = 0; i < 3; i++) expect((await poll(token, t, { "if-none-match": etag(first) })).status).toBe(304);

    const over = await poll(token, t, { "if-none-match": etag(first) });
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ decision: "DENY", reason: "RATE_LIMITED", kind: "TECHNICAL_THROTTLE", rule: PRINCIPAL_WINDOWS.check_claim_progress.rule, retryable: true, entitlement_affected: false });
    expect(Number(over.headers.get("retry-after"))).toBe(over.body.retry_after_seconds);
    expect(over.body.retry_after_seconds).toBeGreaterThan(0);
    expect(over.headers.get("etag")).toBeNull();
    expect(over.headers.get("cache-control")).toBe("private, no-store");
    expect(over.text).not.toMatch(/invalid|not found|no claim/i);

    // Something happens while the agent is waiting.
    expect((await answer(token, t, queryId)).status).toBe(200);

    // After waiting out Retry-After (modelled by the window moving on) its old ETag gets the change.
    await newDay(t);
    const back = await poll(token, t, { "if-none-match": etag(first) });
    expect(back.status).toBe(200);
    expect(back.body.result.claims[0].answered_queries).toBe(1);
    expect(etag(back)).not.toBe(etag(first));
  });

  it("a 304 is a check: it is counted against the person's allowance and appears in the log, like any poll", async () => {
    const { t, token } = await claimed();
    const first = await poll(token, t);
    expect((await poll(token, t, { "if-none-match": etag(first) })).status).toBe(304);
    expect(await prisma.principalUsage.count({ where: { subject: t.oneLoginSubject, rule: PRINCIPAL_WINDOWS.check_claim_progress.rule } })).toBe(2);
    const logged = await prisma.serviceEvent.count({ where: { subject: t.oneLoginSubject, capability: "check_claim_progress", outcome: "ALLOWED" } });
    expect(logged).toBe(2);
  });

  it("the per-minute traffic limit is 429 with Retry-After and rate-limit headers too, and is not a verdict on the claim", async () => {
    configureThroughput({ principal: { status_poll: 2 } });
    const { t, token } = await claimed();
    const first = await poll(token, t);
    expect((await poll(token, t, { "if-none-match": etag(first) })).status).toBe(304);
    const over = await poll(token, t, { "if-none-match": etag(first) });
    expect(over.status).toBe(429);
    expect(over.body).toMatchObject({ kind: "TECHNICAL_THROTTLE", scope: "principal", cost_class: "status_poll", entitlement_affected: false });
    const wait = Number(over.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    expect(over.headers.get("x-ratelimit-limit")).toBe("2");
    expect(over.headers.get("cache-control")).toBe("private, no-store");
  });

  it("a person polling does not use another person's allowance, and one person's 304s do not hide another's changes", async () => {
    const a = await claimed();
    const b = await claimed();
    const ra = await poll(a.token, a.t);
    const rb = await poll(b.token, b.t);
    for (let i = 0; i < 3; i++) await poll(a.token, a.t, { "if-none-match": etag(ra) });
    expect((await poll(a.token, a.t)).status).toBe(429);
    await answer(b.token, b.t, b.queryId);
    const changed = await poll(b.token, b.t, { "if-none-match": etag(rb) });
    expect(changed.status).toBe(200);
    expect(changed.body.result.claims[0].answered_queries).toBe(1);
  });
});

describe("private, no-store: nothing personal is served from or kept in a shared cache", () => {
  it("every kind of response from the progress endpoint says private, no-store and varies on the credentials", async () => {
    configureThroughput({ principal: { status_poll: 3 } });
    const { t, token } = await claimed();
    const responses = [
      await poll(token, t), // 200
      await poll(token, t, { "if-none-match": "*" }), // 304
      await j(await progressApi(new Request(`${ORIGIN}${PATH}`, { headers: { "x-forwarded-for": "203.0.113.10" } }))), // 401
      await poll("not-a-token", t), // 403
    ];
    await poll(token, t); // third admitted poll
    responses.push(await poll(token, t)); // 429
    expect(responses.map((r) => r.status)).toEqual([200, 304, 401, 403, 429]);
    for (const r of responses) {
      const cc = r.headers.get("cache-control")!;
      expect(cc, `${r.status}`).toBe("private, no-store");
      expect(cc).not.toMatch(/public|s-maxage|max-age/);
      expect(r.headers.get("vary")!.toLowerCase()).toContain("authorization");
      expect(r.headers.get("vary")!.toLowerCase()).toContain("cookie");
    }
    // Only the 200 and 304 carry a validator, and only for the person asking.
    expect(responses.map((r) => r.headers.get("etag") !== null)).toEqual([true, true, false, false, false]);
    expect(responses[1].text).toBe("");
  });

  it("the progress route is the one that changed: other status routes still answer as before (scope: progress only)", async () => {
    const { t, token } = await claimed();
    const r = await j(await statusApi(asAgent(token, t, "/api/claims")));
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBeNull();
    expect(r.body.result.version).toBeUndefined();
  });
});

// Integration regression: a poll already holds a transaction and the person's lock.
// Reading through the global client here starves even a small connection pool.
describe("concurrent progress polls alongside a bystander", () => {
  it("finishes a 40-poll burst without pool starvation and keeps the bystander's state isolated", async () => {
    const a = await claimed();
    const b = await claimed();
    const first = await poll(a.token, a.t);
    const responses = await Promise.all([
      ...Array.from({ length: 40 }, () => poll(a.token, a.t, { "if-none-match": etag(first) })),
      poll(b.token, b.t),
    ]);
    expect(responses.slice(0, 40).every((r) => [304, 429].includes(r.status))).toBe(true);
    expect(responses.slice(0, 40).filter((r) => r.status === 304)).toHaveLength(3);
    const other = responses[40];
    expect(other.status).toBe(200);
    expect(other.body.result.claims).toHaveLength(1);
    expect(other.text).not.toContain(a.queryId);
    expect(await prisma.claim.count({ where: { taxpayerId: a.t.id } })).toBe(1);
    for (const r of responses.filter((r) => r.status === 429)) {
      expect(r.body.entitlement_affected).toBe(false);
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    }
  });
});
