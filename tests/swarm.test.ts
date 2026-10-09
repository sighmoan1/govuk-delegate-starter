import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, newPrincipal, authorise, DELEGATE, HMRC } from "./helpers";
import { classify, runExperiments, transportOf, type Env, type ScenarioId, type ScenarioResult, type SwarmRun } from "../apps/about/src/lib/swarm";
import { ASSUMPTIONS, POLICIES, SIM_SEED, simulate, simulateAll } from "../apps/about/src/lib/swarm-sim";

afterAll(() => prisma.$disconnect());

// Can a swarm beat the system? Measured two ways, kept apart.
//
//   REAL        runExperiments() runs the seven scenarios through HMRC's real API, GOV.UK Delegate's real check, the real
//               queue and worker, with fresh synthetic people. What it counts is technical load (requests, authority
//               checks, 429s and 503s, back-end work) separately from service outcomes (claims received, queued, recorded,
//               duplicates absorbed). The same function drives the about site's page.
//   SIMULATED   swarm-sim.ts compares an agent-level throttle, a person-level technical throttle and fair scheduling in a
//               seeded model. It does not touch the services. Its tests check the model, not the world.
//
// What these tests do not assert: any number of requests a person or agent may make. Those limits are demo-only and
// illustrative (docs/DECISIONS.md, Decision 23), so a test may ask what a throttle did to a claim, never how many requests
// it takes to trip one. Needs the worker running (`npm run dev` starts it, or `npm run worker -w apps/hmrc`).

const DEMO_KEY = process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key";
const env: Env = { delegate: DELEGATE, hmrc: HMRC, demoKey: DEMO_KEY };

const by = (run: SwarmRun) => Object.fromEntries(run.results.map((r) => [r.id, r])) as Record<ScenarioId, ScenarioResult>;
const claims = (r: ScenarioResult) => r.transport.byOp.claim;
const recorded = (r: ScenarioResult) => r.server!.queue.byStatus.COMPLETED ?? 0;

/** Every claim is bounded by the passing checks listed with the result. A failure names the sentence that did not hold. */
function expectChecksHold(r: ScenarioResult) {
  expect(r.error, `scenario ${r.id} errored`).toBeUndefined();
  expect(r.invariants.filter((i) => !i.ok).map((i) => i.text), `scenario ${r.id}`).toEqual([]);
}

describe("real: the seven scenarios at N = 10 (every check holds, claims and traffic counted apart)", () => {
  let run: SwarmRun;
  let r: Record<ScenarioId, ScenarioResult>;
  beforeAll(async () => {
    run = await runExperiments(env, { n: 10 });
    r = by(run);
  }, 300_000);

  it("every scenario's own checks hold", () => {
    expect(run.results.map((x) => x.id)).toEqual(["A", "B", "Bp", "C", "D", "E", "F"]);
    for (const x of run.results) expectChecksHold(x);
  });

  it("A, B and B′: ten attempts at one person's claim are one claim, however they are sent", () => {
    for (const x of [r.A, r.B, r.Bp]) {
      expect(x.demanded).toBe(1);
      expect(x.server!.queue.received).toBe(1);
      expect(x.server!.queue.claimsRecorded).toBe(1);
      expect(claims(x).received).toBe(1);
      // Every other attempt was refused as a duplicate, or held back for traffic. None made a second claim.
      expect(claims(x).received + claims(x).duplicate + claims(x).throttled).toBe(10);
      expect(x.transport.receipts).toBe(1);
    }
    // Two different ways of hiding behind the person's authority look the same to HMRC's accounting.
    expect(claims(r.B)).toEqual(claims(r.A));
    expect(claims(r.Bp)).toEqual(claims(r.A));
  });

  it("an authorised check is not a claim: the checks outnumber the claims, and hidden sessions cause none", () => {
    expect(r.A.server!.events!.authorisedChecks).toBe(20);
    expect(r.A.server!.queue.received).toBe(1);
    expect(r.B.server!.events!.authorisedChecks).toBe(20);
    expect(r.Bp.server!.events!.authorisedChecks).toBe(0);
  });

  it("C: ten different people's claims are all kept and recorded", () => {
    expect(r.C.demanded).toBe(10);
    expect(r.C.server!.queue.received).toBe(10);
    expect(r.C.server!.queue.peopleWithAClaim).toBe(10);
    expect(recorded(r.C)).toBe(10);
    expect(claims(r.C).duplicate).toBe(0);
  });

  it("D: a burst of claims, each sent twice, makes one claim per person; the repeats are replays", () => {
    expect(r.D.demanded).toBe(11); // ten people through one operator, and a bystander who signed in themselves
    expect(r.D.server!.queue.received).toBe(11);
    expect(recorded(r.D)).toBe(11);
    expect(claims(r.D).replay).toBe(10);
    expect(r.D.transport.receipts).toBe(11);
    expect(r.D.bystander?.ok).toBe(true);
    expect(r.D.bystander?.receivedToRecordedMs).not.toBeNull();
  });

  it("E: a retry storm for one accepted claim makes no second claim, before or after it is recorded", () => {
    expect(r.E.demanded).toBe(1);
    expect(r.E.server!.queue.received).toBe(1);
    expect(r.E.server!.queue.claimsRecorded).toBe(1);
    expect(r.E.transport.attempts).toBe(1 + 10 + 10);
    expect(r.E.transport.receipts).toBe(1);
    expect(claims(r.E).received).toBe(1);
    expect(claims(r.E).replay + claims(r.E).throttled).toBe(20);
    // The retries are cheap reads, not 20 more submissions.
    expect(r.E.server!.events!.admittedWorkByCostClass.write).toBe(1);
  });

  it("F: a status-poll flood leaves the claim, and a bystander, alone", () => {
    expect(recorded(r.F)).toBe(2);
    expect(r.F.bystander?.ok).toBe(true);
    expect(r.F.bystander?.throttled).toBe(0);
    // Whatever the flood cost the flooder, it cost the claims nothing: no claim was created or lost.
    expect(r.F.server!.queue.claimsRecorded).toBe(2);
    expect(r.F.transport.byOp.status.ok).toBeGreaterThan(0);
  });

  it("technical load and service outcomes are reported apart, and the log agrees with what the client saw", () => {
    for (const x of run.results) {
      const e = x.server!.events!;
      expect(e.httpRequests, `${x.id}: HMRC's log against the client's count`).toBeGreaterThanOrEqual(x.transport.attempts - x.transport.networkErrors);
      expect(e.technicalThrottles, `${x.id}: 429s`).toBe(x.transport.total.throttled);
      expect(e.unavailable, `${x.id}: 503s`).toBe(x.transport.total.unavailable);
      expect(x.transport.throttledWithoutRetryAfter).toBe(0);
      expect(x.transport.throttleSaidEntitlementAffected).toBe(0);
      // Requests that ran are not claims: HMRC's own count of requests that ran first time exceeds the claims.
      expect(e.uniqueOperations).toBeGreaterThanOrEqual(x.server!.queue.received);
    }
  });

  it("GOV.UK Delegate's own record of checks matches HMRC's count of authorised checks (A, C)", async () => {
    for (const x of [r.A, r.C]) {
      const delegateSide = await prisma.activityEvent.count({ where: { principalId: { in: x.principalIds }, decision: "ALLOW", capability: { not: null } } });
      expect(delegateSide, `${x.id}`).toBe(x.server!.events!.authorisedChecks);
    }
  });

  it("worker processing time and queue wait are measured for every claim", () => {
    for (const x of [r.C, r.D]) {
      const q = x.server!.queue;
      expect(q.processingMs.n).toBe(q.received);
      expect(q.waitMs.n).toBe(q.received);
      expect(q.receiptToRecordedMs.n).toBe(q.received);
      expect(q.drainMs).not.toBeNull();
    }
  });
});

describe("real: acceptance at N = 100", () => {
  let r: Record<ScenarioId, ScenarioResult>;
  beforeAll(async () => {
    r = by(await runExperiments(env, { n: 100, only: ["A", "C", "D", "E", "F"] }));
  }, 600_000);

  it("100 duplicate requests yield one business action, not 100 entitlements", () => {
    for (const x of [r.A, r.E]) {
      expectChecksHold(x);
      expect(x.server!.queue.received).toBe(1);
      expect(x.server!.queue.claimsRecorded).toBe(1);
      expect(x.transport.receipts).toBe(1);
    }
    // A: 100 attempts at one claim by fresh keys. One received; the rest are refused duplicates or held back, never claims.
    expect(claims(r.A).received).toBe(1);
    expect(claims(r.A).received + claims(r.A).duplicate + claims(r.A).throttled).toBe(100);
    // E: one claim and 200 retries of it. No retry made a second write.
    expect(claims(r.E).received).toBe(1);
    expect(claims(r.E).replay + claims(r.E).throttled).toBe(200);
    expect(r.E.server!.events!.admittedWorkByCostClass.write).toBe(1);
  });

  it("100 valid submissions from 100 distinct people are all preserved, even though they are recorded gradually", () => {
    for (const x of [r.C, r.D]) {
      expectChecksHold(x);
      expect(x.server!.queue.received).toBe(x.demanded);
      expect(recorded(x)).toBe(x.demanded);
      expect(x.server!.queue.peopleWithAClaim).toBe(x.demanded);
      expect(x.server!.queue.openNow).toBe(0);
      expect(x.server!.queue.byStatus.FAILED ?? 0).toBe(0);
    }
    expect(r.C.demanded).toBe(100);
    expect(r.D.demanded).toBe(101);
    // No claim of the 100 was refused for being many: nothing in C was a duplicate.
    expect(claims(r.C).duplicate).toBe(0);
    // Any 429 or 503 along the way was a request to come back, and the people came back: nothing was lost.
    expect(claims(r.C).throttled + claims(r.C).unavailable + r.C.transport.networkErrors).toBe(r.C.transport.retries);
    expect(claims(r.D).throttled + claims(r.D).unavailable + r.D.transport.networkErrors).toBe(r.D.transport.retries);
  });

  it("the dashboard's two groups are separate: many more requests and checks than claims", () => {
    expect(r.D.transport.attempts).toBeGreaterThanOrEqual(2 * 100 + 1);
    expect(r.D.server!.events!.authorisedChecks).toBeGreaterThanOrEqual(2 * 100);
    expect(r.D.server!.queue.received).toBe(101);
    expect(r.F.transport.attempts).toBeGreaterThan(100);
    expect(r.F.server!.queue.received).toBe(2);
  });

  it("a status-poll flood on one claim is slowed with 429s that say when to return, without touching the claim or the bystander", () => {
    expectChecksHold(r.F);
    expect(recorded(r.F)).toBe(2);
    expect(r.F.bystander?.ok).toBe(true);
    expect(r.F.transport.total.throttled).toBe(r.F.server!.events!.technicalThrottles);
    expect(r.F.transport.throttledWithoutRetryAfter).toBe(0);
    expect(r.F.transport.throttleSaidEntitlementAffected).toBe(0);
    // A flood is traffic, not a claim: it never shows up as a business refusal beyond the five attempts to read someone else's id.
    expect(r.F.server!.events!.businessRefusals).toBeLessThanOrEqual(5);
    // No request ended in anything but a clear answer.
    expect(r.F.transport.total.failed).toBe(0);
  });
});

describe("real: no cross-user state mixing", () => {
  const CAPS = ["claim_job_expenses", "view_claim_status", "view_tax_code"] as const;
  const headers = (token: string, id: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, "x-principal-id": id, "content-type": "application/json", ...extra });

  it("one person cannot read another person's receipt: the answer is the same as for an id that does not exist", async () => {
    const [p, q] = [await newPrincipal(), await newPrincipal()];
    const [a, b] = [await authorise(p.id, [...CAPS]), await authorise(q.id, [...CAPS])];
    const res = await fetch(`${HMRC}/api/job-expenses`, { method: "POST", headers: headers(a.token, p.id, { prefer: "respond-async", "idempotency-key": randomUUID() }), body: "{}" });
    expect(res.status).toBe(202);
    const mine = (await res.json()).result.transaction_id as string;
    const read = async (token: string, id: string, txId: string) => {
      const x = await fetch(`${HMRC}/api/transactions/${txId}`, { headers: headers(token, id) });
      const body = await x.json();
      return { status: x.status, reason: body.reason, kind: body.kind };
    };
    expect((await read(a.token, p.id, mine)).status).toBe(200);
    const theirs = await read(b.token, q.id, mine);
    const unknown = await read(b.token, q.id, "tx_does-not-exist");
    expect(theirs).toEqual(unknown);
    expect(theirs.status).toBe(404);
  });

  it("two people sending the same Idempotency-Key get two claims, not one", async () => {
    const [p, q] = [await newPrincipal(), await newPrincipal()];
    const [a, b] = [await authorise(p.id, [...CAPS]), await authorise(q.id, [...CAPS])];
    const key = randomUUID();
    const send = async (token: string, id: string) => {
      const x = await fetch(`${HMRC}/api/job-expenses`, { method: "POST", headers: headers(token, id, { prefer: "respond-async", "idempotency-key": key }), body: "{}" });
      return { status: x.status, replay: x.headers.get("idempotent-replayed"), tx: (await x.json()).result?.transaction_id as string };
    };
    const [x, y] = await Promise.all([send(a.token, p.id), send(b.token, q.id)]);
    expect([x.status, y.status]).toEqual([202, 202]);
    expect(x.replay).toBeNull();
    expect(y.replay).toBeNull();
    expect(x.tx).not.toBe(y.tx);
  });

  it("one person's traffic does not draw on another's: whatever a flood costs its person, a bystander's identical requests all succeed", async () => {
    const [flooder, bystander] = [await newPrincipal(), await newPrincipal()];
    const [a, b] = [await authorise(flooder.id, [...CAPS]), await authorise(bystander.id, [...CAPS])];
    const look = (token: string, id: string) => fetch(`${HMRC}/api/tax-code`, { headers: headers(token, id) }).then((x) => x.status);
    const [flood, calm] = await Promise.all([
      Promise.all(Array.from({ length: 90 }, () => look(a.token, flooder.id))),
      Promise.all(Array.from({ length: 20 }, () => look(b.token, bystander.id))),
    ]);
    expect(calm.every((s) => s === 200)).toBe(true);
    // Every answer the flooder got was a clear one, and none was a failure.
    expect(flood.every((s) => s === 200 || s === 429)).toBe(true);
  });

  it("an agent's identity assurance buys no extra capacity: the same traffic gets the same answers at any assurance level", async () => {
    const [p, q] = [await newPrincipal(), await newPrincipal()];
    const [a, b] = [await authorise(p.id, ["view_tax_code"]), await authorise(q.id, ["view_tax_code"])];
    await prisma.delegation.updateMany({ where: { mandateId: b.authorisationId }, data: { assurance: "VERIFIED" } });
    const tally = async (token: string, id: string) => {
      const res = await Promise.all(Array.from({ length: 80 }, () => fetch(`${HMRC}/api/tax-code`, { headers: headers(token, id) }).then((x) => x.status)));
      return res.reduce<Record<string, number>>((t, s) => ({ ...t, [s]: (t[s] ?? 0) + 1 }), {});
    };
    expect(await tally(b.token, q.id)).toEqual(await tally(a.token, p.id));
  });
});

describe("real: a burst of status checks on one claim", () => {
  it("is answered, every time: checking a claim does not hold a second database connection while it holds the first", async () => {
    // Found by the status-poll experiment: the status read asked the pool for another connection while the person's
    // lock held one, so a few dozen concurrent checks on one claim took every connection and answered 500.
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["claim_job_expenses", "view_claim_status"]);
    const h = { authorization: `Bearer ${token}`, "x-principal-id": p.id, "content-type": "application/json" };
    const made = await fetch(`${HMRC}/api/job-expenses`, { method: "POST", headers: { ...h, prefer: "respond-async", "idempotency-key": randomUUID() }, body: "{}" });
    const id = (await made.json()).result.transaction_id as string;
    const answers = await Promise.all(Array.from({ length: 40 }, () => fetch(`${HMRC}/api/transactions/${id}`, { headers: h }).then((x) => x.status)));
    // Some may be held back for traffic if the limit is low; none may be a server error.
    expect(answers.filter((s) => s !== 200 && s !== 429)).toEqual([]);
    expect(answers.filter((s) => s === 200).length).toBeGreaterThan(0);
  });
});

describe("real: the accounting is reproducible", () => {
  it("running the same scenarios twice, with new people, gives the same claim and duplicate counts", async () => {
    const signature = (x: ScenarioResult) => ({
      id: x.id, demanded: x.demanded, received: x.server!.queue.received, recorded: recorded(x), people: x.server!.queue.peopleWithAClaim,
      claimsReceived: claims(x).received, replays: claims(x).replay, duplicates: claims(x).duplicate, receipts: x.transport.receipts,
    });
    const once = await runExperiments(env, { n: 10, only: ["A", "C", "E"] });
    const twice = await runExperiments(env, { n: 10, only: ["A", "C", "E"] });
    expect(once.runId).not.toBe(twice.runId);
    expect(once.results.map(signature)).toEqual(twice.results.map(signature));
  }, 300_000);
});

describe("accounting: how requests are classified (no services needed)", () => {
  const a = (status: number, reason: string | null = null, replay = false) => ({ status, reason, replay });
  it("keeps receipts, replays, duplicates, throttles and unavailability apart", () => {
    expect(classify(a(202))).toBe("received");
    expect(classify(a(202, null, true))).toBe("replay");
    expect(classify(a(200))).toBe("ok");
    expect(classify(a(409, "DUPLICATE_SUBMISSION"))).toBe("duplicate");
    expect(classify(a(409, "NEW_EVIDENCE_REQUIRED"))).toBe("duplicate");
    expect(classify(a(409, "CAPACITY_EXCEEDED"))).toBe("refused");
    expect(classify(a(404, "TRANSACTION_NOT_FOUND"))).toBe("refused");
    expect(classify(a(429, "RATE_LIMITED"))).toBe("throttled");
    expect(classify(a(503, "SERVICE_UNAVAILABLE"))).toBe("unavailable");
    expect(classify(a(403, "NO_AUTHORISATION"))).toBe("no_authority");
    expect(classify(a(0, "NETWORK_ERROR"))).toBe("failed");
    expect(classify(a(500))).toBe("failed");
  });

  it("counts a throttle without Retry-After, and a receipt count that differs from the request count", () => {
    const base = { op: "claim" as const, replay: false, ms: 5, agent: true, retry: false, entitlementAffected: false, reason: null };
    const t = transportOf([
      { ...base, status: 202, retryAfter: null, txId: "tx_1" },
      { ...base, status: 202, replay: true, retryAfter: null, txId: "tx_1" },
      { ...base, status: 429, retryAfter: null, txId: null },
      { ...base, status: 429, retryAfter: "3", txId: null, entitlementAffected: true },
    ]);
    expect(t.attempts).toBe(4);
    expect(t.receipts).toBe(1);
    expect(t.throttledWithoutRetryAfter).toBe(1);
    expect(t.throttleSaidEntitlementAffected).toBe(1);
    expect(t.byOp.claim).toMatchObject({ received: 1, replay: 1, throttled: 2 });
  });
});

describe("simulated: protections compared in a seeded model (not evidence about the real service)", () => {
  const sims = simulateAll();
  const row = (w: string, p: string) => sims.find((s) => s.workload.id === w)!.rows.find((x) => x.policy.id === p)!.metrics;

  it("is reproducible: the same seed gives the same tables, a different seed a different one", () => {
    expect(simulateAll(SIM_SEED)).toEqual(simulateAll(SIM_SEED));
    expect(simulateAll(SIM_SEED + 1)).not.toEqual(simulateAll(SIM_SEED));
  });

  it("covers every workload under every protection", () => {
    expect(sims.map((s) => s.workload.id)).toEqual(["retry_storm", "distinct_burst", "poll_flood", "heavy_person"]);
    for (const s of sims) expect(s.rows.map((r) => r.policy.id)).toEqual(POLICIES.map((p) => p.id));
  });

  it("never lets a duplicate create a business action, under any protection", () => {
    for (const s of sims) for (const r of s.rows) {
      expect(r.metrics.businessActions, `${s.workload.id} / ${r.policy.id}`).toBeLessThanOrEqual(r.metrics.demanded);
      expect(r.metrics.received).toBeLessThanOrEqual(r.metrics.demanded);
      expect(r.metrics.completed).toBeLessThanOrEqual(r.metrics.received);
    }
  });

  it("keeps the 100 distinct people's claims under every protection, with a horizon long enough to finish", () => {
    for (const r of sims.find((s) => s.workload.id === "distinct_burst")!.rows) {
      expect(r.metrics.demanded, r.policy.id).toBe(101);
      expect(r.metrics.received, r.policy.id).toBe(101);
      expect(r.metrics.completed, r.policy.id).toBe(101);
    }
  });

  it("an agent-level throttle slows the people behind the agent, after the authority check has been paid; the person-level throttle leaves distinct people alone", () => {
    const none = row("distinct_burst", "none"), agent = row("distinct_burst", "agent_60"), person = row("distinct_burst", "person_throttle");
    expect(agent.throttled429).toBeGreaterThan(none.throttled429);
    expect(agent.lightP95S!).toBeGreaterThan(none.lightP95S!);
    expect(person.throttled429).toBe(0);
    // The check precedes every limit, so every request the throttle turned away had already cost a check.
    expect(agent.authorityChecks).toBeGreaterThanOrEqual(agent.throttled429);
  });

  it("fair scheduling by person helps the crowd when one person has many items, and does nothing for a bystander in a crowd of different people", () => {
    expect(row("heavy_person", "fair_person").lightP50S!).toBeLessThan(row("heavy_person", "none").lightP50S!);
    expect(row("distinct_burst", "fair_person").bystanderS!).toBeCloseTo(row("distinct_burst", "none").bystanderS!, 0);
    expect(row("distinct_burst", "fair_provider").bystanderS!).toBeLessThan(row("distinct_burst", "none").bystanderS!);
  });

  it("repeats of a request HMRC already holds are absorbed, whatever the protection", () => {
    expect(row("retry_storm", "none").duplicatesAbsorbed).toBe(100);
    expect(simulate("retry_storm", POLICIES.find((p) => p.id === "as_built")!).businessActions).toBe(21);
  });

  it("states its assumptions", () => {
    expect(ASSUMPTIONS.workers).toBeGreaterThan(0);
    expect(ASSUMPTIONS.horizonS).toBeGreaterThan(0);
  });
});
