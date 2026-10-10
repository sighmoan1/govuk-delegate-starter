import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { findOrCreateTaxpayer, type Taxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { resetThroughput } from "@/lib/throughput";
import { backoffMs, claimNext, enqueueClaim, failExhaustedLeases, processClaimed, type Processor } from "@/lib/transaction-queue";
import { processClaimJob } from "@/lib/transactions";
import { reportOutcomes, runWorker, workOne } from "@/lib/worker";
import { fingerprint } from "@/lib/idempotency";
import { POST as claimApi } from "@/app/api/job-expenses/route";
import { GET as statusApi } from "@/app/api/transactions/[id]/route";

// Issue #21: HMRC receives a claim durably and records it later. Delegate
// is replaced by a table (token -> who it is and who it acts for), as in
// throughput.test.ts; everything else is HMRC's real code on a real database.
const delegate = vi.hoisted(() => ({
  agents: new Map<string, { delegateId: string; subject: string; deny: Set<string> }>(),
  revoked: new Set<string>(),
  outcomes: [] as { check_id: string; status: string; reference?: string | null; reason?: string | null; idempotency_key?: string }[],
  reportsWork: true,
}));
const mocks = vi.hoisted(() => ({ failAfterEnqueue: false, unreachable: false }));

vi.mock("@/lib/delegate-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/delegate-client")>();
  return {
    ...actual,
    askDelegate: async (i: { agent_token: string; capability: string }) => {
      const a = delegate.agents.get(i.agent_token);
      const check_id = randomUUID();
      if (!a) return { authorised: false, reason: "NO_AUTHORISATION", check_id };
      const who = { id: a.delegateId, name: `Agent ${a.delegateId}`, provider: "test" };
      if (delegate.revoked.has(i.agent_token)) return { authorised: false, reason: "AUTHORISATION_REVOKED", delegate: who, check_id };
      if (a.deny.has(i.capability)) return { authorised: false, reason: "PERMISSION_MISSING", delegate: who, check_id };
      return {
        authorised: true, status: "ACTIVE", authorisation_id: "a", principal_id: "p", subject: a.subject, check_id, delegate: who,
        chain: { mandate_id: `m-${a.delegateId}`, delegation_id: `d-${a.delegateId}`, parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" },
      };
    },
    reportOutcome: async (o: { check_id: string; status: string }) => {
      if (!delegate.reportsWork) return false;
      delegate.outcomes.push(o);
      return true;
    },
    recordReceipt: async () => "receipt-1",
    disputedReceipts: async () => ({ ok: true as const, disputed: [] as string[] }),
  };
});

// Lets a test make the store fail after the work item was written, to show the receipt does not survive.
vi.mock("@/lib/transaction-queue", async (orig) => {
  const real = await orig<typeof import("@/lib/transaction-queue")>();
  return {
    ...real,
    enqueueClaim: async (...a: Parameters<typeof real.enqueueClaim>) => {
      if (mocks.unreachable) {
        mocks.unreachable = false;
        throw new Prisma.PrismaClientInitializationError("Can't reach database server", "test");
      }
      const row = await real.enqueueClaim(...a);
      if (mocks.failAfterEnqueue) {
        mocks.failAfterEnqueue = false;
        throw new Prisma.PrismaClientKnownRequestError("injected: the store failed after the work item was written", { code: "P2028", clientVersion: "test" });
      }
      return row;
    },
  };
});

beforeEach(async () => {
  resetThroughput();
  delegate.agents.clear(); delegate.revoked.clear(); delegate.outcomes.length = 0; delegate.reportsWork = true;
  mocks.failAfterEnqueue = false; mocks.unreachable = false;
  delete process.env.HMRC_QUEUE_MAX_ATTEMPTS;
  await prisma.transaction.deleteMany(); // the queue is shared by every test in this database
});
afterEach(async () => { await prisma.transaction.deleteMany(); });
afterAll(async () => { resetThroughput(); await prisma.$disconnect(); });

const ORIGIN = "http://localhost:3302";
const person = () => findOrCreateTaxpayer(`urn:test:${randomUUID()}`);
const SELF = { kind: "SELF" } as const;

type Init = { method?: string; body?: unknown; key?: string; prefer?: boolean };
const asHuman = async (t: Taxpayer, path: string, init: Init = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { cookie: `${SESSION_COOKIE}=${await signSession(t.id)}`, "content-type": "application/json", ...(init.key ? { "idempotency-key": init.key } : {}), ...(init.prefer ? { prefer: "respond-async" } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const agentFor = (t: Taxpayer, delegateId = "prov", deny: string[] = []) => {
  const token = `tok-${delegateId}-${t.id}`;
  delegate.agents.set(token, { delegateId, subject: t.oneLoginSubject, deny: new Set(deny) });
  return token;
};
const asAgent = (token: string, t: Taxpayer, path: string, init: Init = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "x-principal-id": t.id, "content-type": "application/json", ...(init.key ? { "idempotency-key": init.key } : {}), ...(init.prefer ? { prefer: "respond-async" } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const anonymous = (path: string) => new Request(`${ORIGIN}${path}`, { headers: { "x-run-tag": "i21" } });
const j = async (res: Response) => ({ status: res.status, headers: res.headers, body: (await res.json().catch(() => null)) as any });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** An agent sends a claim to be processed later. */
const submit = async (t: Taxpayer, opts: { key?: string; evidence?: string; token?: string } = {}) =>
  j(await claimApi(asAgent(opts.token ?? agentFor(t), t, "/api/job-expenses", { method: "POST", body: opts.evidence ? { evidence: opts.evidence } : {}, key: opts.key ?? randomUUID(), prefer: true })));
const statusOf = async (req: Request, id: string) => j(await (statusApi as (r: Request, c: unknown) => Promise<Response>)(req, ctx(id)));

const txOf = (t: Taxpayer) => prisma.transaction.findMany({ where: { subject: t.oneLoginSubject }, orderBy: { receivedAt: "asc" } });
const claimsOf = (t: Taxpayer) => prisma.claim.count({ where: { taxpayerId: t.id, kind: "job_expenses" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (what: () => Promise<boolean>, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await what()) return; await sleep(25); }
  throw new Error("timed out waiting");
};

/** Put a claim straight on the queue (bypassing the domain rules, which cap one person at three open cases), at a chosen time. */
const queue = (t: Taxpayer, at: Date, evidence: string = randomUUID(), agent?: string) =>
  prisma.$transaction((tx) =>
    enqueueClaim(tx, {
      subject: t.oneLoginSubject, evidenceFingerprint: fingerprint(evidence), now: at,
      actor: agent ? { kind: "AGENT", name: agent, id: agent, chain: { mandate_id: "m", delegation_id: "d", parent_delegation_id: null, depth: 0, label: null, assurance: "REGISTERED" } } : SELF,
    }),
  );

describe("accepting: 202 only for work that is stored", () => {
  it("answers 202 with a receipt, a Location and QUEUED, and has recorded no claim yet", async () => {
    const t = await person();
    const r = await submit(t, { key: "k-1", evidence: "payslip.pdf" });
    expect(r.status).toBe(202);
    expect(r.body.decision).toBe("ALLOW");
    const rows = await txOf(t);
    expect(rows).toHaveLength(1);
    const id = rows[0].id;
    expect(id).toMatch(/^tx_[A-Za-z0-9_-]{22}$/);
    expect(r.headers.get("location")).toBe(`/api/transactions/${id}`);
    expect(r.headers.get("preference-applied")).toBe("respond-async");
    expect(r.body.result).toMatchObject({ accepted: true, transaction_id: id, status: "QUEUED", status_url: `/api/transactions/${id}`, synthetic: true });
    expect(r.body.result.receipt_note).toMatch(/not proof of a statutory filing date/);
    // Received, not recorded: nothing was claimed and the tax code is untouched.
    expect(await claimsOf(t)).toBe(0);
    expect((await prisma.taxpayer.findUniqueOrThrow({ where: { id: t.id } })).taxCode).toBe("1257L");
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(0);
    // The receipt and the idempotency record were committed together.
    expect(await prisma.idempotencyRecord.count({ where: { subject: t.oneLoginSubject, key: "k-1" } })).toBe(1);
    // It never says the claim is approved or eligible, and the reference is not the claim's.
    expect(JSON.stringify(r.body)).not.toMatch(/approv|eligib/i);
    expect(r.body.result.claim_reference).toBeUndefined();
  });

  it("is a signed-in person's choice too, and stays synchronous for anyone who does not ask", async () => {
    const t = await person();
    const asked = await j(await claimApi(await asHuman(t, "/api/job-expenses", { method: "POST", body: {}, key: "h-1", prefer: true })));
    expect(asked.status).toBe(202);
    const u = await person();
    const plain = await j(await claimApi(await asHuman(u, "/api/job-expenses", { method: "POST", body: {} })));
    expect(plain.status).toBe(200);
    expect(plain.body.result.claim_reference).toMatch(/^JE-/);
    expect(await claimsOf(u)).toBe(1);
    expect(await prisma.transaction.count({ where: { subject: u.oneLoginSubject } })).toBe(0);
  });

  it("requires an Idempotency-Key, so a client that never saw the answer can always retry safely", async () => {
    const t = await person();
    const r = await j(await claimApi(asAgent(agentFor(t), t, "/api/job-expenses", { method: "POST", body: {}, prefer: true })));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ decision: "DENY", reason: "IDEMPOTENCY_KEY_REQUIRED", kind: "REQUEST_ERROR" });
    expect(await txOf(t)).toHaveLength(0);
    expect(delegate.outcomes.at(-1)).toMatchObject({ status: "FAILED", reason: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("a retry with the same Idempotency-Key gets the same receipt and never queues a second job", async () => {
    const t = await person();
    const first = await submit(t, { key: "same", evidence: "a.pdf" });
    const again = await submit(t, { key: "same", evidence: "A.PDF " });
    expect([first.status, again.status]).toEqual([202, 202]);
    expect(again.body.result.transaction_id).toBe(first.body.result.transaction_id);
    expect(again.headers.get("location")).toBe(first.headers.get("location"));
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(again.body.idempotent_replay).toBe(true);
    expect(await txOf(t)).toHaveLength(1);
    const other = await submit(t, { key: "same", evidence: "different.pdf" });
    expect(other.status).toBe(409);
    expect(other.body.reason).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await txOf(t)).toHaveLength(1);
  });

  it("50 concurrent retries of one key make exactly one job, and all get the same receipt", async () => {
    const t = await person();
    const token = agentFor(t);
    const rs = await Promise.all(Array.from({ length: 50 }, () => submit(t, { key: "burst", evidence: "b.pdf", token })));
    expect(rs.every((r) => r.status === 202)).toBe(true);
    expect(new Set(rs.map((r) => r.body.result.transaction_id)).size).toBe(1);
    expect(rs.filter((r) => !r.body.idempotent_replay)).toHaveLength(1);
    expect(await txOf(t)).toHaveLength(1);
    expect(await prisma.idempotencyRecord.count({ where: { subject: t.oneLoginSubject } })).toBe(1);
  });

  it("claims already waiting count against the person's rules: the same evidence under a new key is a duplicate, and three open claims is the most", async () => {
    const t = await person();
    expect((await submit(t, { evidence: "one.pdf" })).status).toBe(202);
    const dup = await submit(t, { evidence: "one.pdf" });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ reason: "DUPLICATE_SUBMISSION", kind: "BUSINESS_REFUSAL" });
    const noNew = await submit(t, {});
    expect(noNew.body.reason).toBe("NEW_EVIDENCE_REQUIRED");
    expect((await submit(t, { evidence: "two.pdf" })).status).toBe(202);
    expect((await submit(t, { evidence: "three.pdf" })).status).toBe(202);
    const full = await submit(t, { evidence: "four.pdf" });
    expect(full.status).toBe(409);
    expect(full.body.reason).toBe("CAPACITY_EXCEEDED");
    expect(await txOf(t)).toHaveLength(3);
  });

  it("40 concurrent different-key submissions of one claim by one person are one claim, not forty", async () => {
    const t = await person();
    const token = agentFor(t);
    const rs = await Promise.all(Array.from({ length: 40 }, () => submit(t, { evidence: "same.pdf", token })));
    expect(rs.filter((r) => r.status === 202)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && r.body.reason === "DUPLICATE_SUBMISSION")).toHaveLength(39);
    expect(await txOf(t)).toHaveLength(1);
  });

  it("accepts concurrent submissions from 200 different people without losing or merging any", async () => {
    const people = await Promise.all(Array.from({ length: 200 }, () => person()));
    const rs = await Promise.all(people.map((p) => submit(p, { evidence: "x.pdf" })));
    expect(rs.every((r) => r.status === 202)).toBe(true);
    expect(new Set(rs.map((r) => r.body.result.transaction_id)).size).toBe(200);
    expect(await prisma.transaction.count({ where: { status: "QUEUED" } })).toBe(200);
    expect(await prisma.transaction.count()).toBe(200);
  });

  it("when HMRC cannot store the claim it is 503 with Retry-After, nothing is kept, and the retry works", async () => {
    const t = await person();
    mocks.failAfterEnqueue = true; // the work item was written, then the store failed before commit
    const down = await submit(t, { key: "k-down", evidence: "a.pdf" });
    expect(down.status).toBe(503);
    expect(down.headers.get("retry-after")).toBe("30");
    expect(down.body).toMatchObject({ decision: "DENY", reason: "SERVICE_UNAVAILABLE", kind: "UNAVAILABLE", retryable: true, retry_after_seconds: 30, accepted: false, entitlement_affected: false });
    expect(down.body.message).toMatch(/same Idempotency-Key/);
    expect(down.headers.get("location")).toBeNull();
    // Never 202 before the receipt and the job are both committed: neither is.
    expect(await txOf(t)).toHaveLength(0);
    expect(await prisma.idempotencyRecord.count({ where: { subject: t.oneLoginSubject } })).toBe(0);
    const event = await prisma.serviceEvent.findFirstOrThrow({ where: { subject: t.oneLoginSubject }, orderBy: { timestamp: "desc" } });
    expect(event).toMatchObject({ outcome: "REFUSED", reason: "SERVICE_UNAVAILABLE", outcomeClass: "UNAVAILABLE", retryAfterSeconds: 30 });
    const retry = await submit(t, { key: "k-down", evidence: "a.pdf" });
    expect(retry.status).toBe(202);
    expect(await txOf(t)).toHaveLength(1);
  });

  it("a database that is unreachable is the same 503, not a 500", async () => {
    const t = await person();
    const token = agentFor(t);
    mocks.unreachable = true;
    const down = await submit(t, { key: "k-unreachable", evidence: "a.pdf", token });
    expect(down.status).toBe(503);
    expect(down.body).toMatchObject({ kind: "UNAVAILABLE", accepted: false });
    expect(await txOf(t)).toHaveLength(0);
  });

  it("every attempt is in HMRC's log and Delegate is told ACCEPTED, with the receipt as the reference", async () => {
    const t = await person();
    const r = await submit(t, { key: "k-log", evidence: "a.pdf" });
    const retry = await submit(t, { key: "k-log", evidence: "a.pdf" });
    const events = await prisma.serviceEvent.findMany({ where: { subject: t.oneLoginSubject }, orderBy: { timestamp: "asc" } });
    expect(events.map((e) => [e.outcome, e.reason, e.outcomeClass])).toEqual([["ALLOWED", "ACCEPTED_FOR_PROCESSING", "UNIQUE_OPERATION"], ["ALLOWED", "IDEMPOTENT_REPLAY", "REPLAY"]]);
    expect(delegate.outcomes.map((o) => [o.status, o.reference])).toEqual([["ACCEPTED", r.body.result.transaction_id], ["ACCEPTED", r.body.result.transaction_id]]);
    expect(retry.status).toBe(202);
  });
});

describe("the worker: durable, safe across workers, bounded", () => {
  it("hundreds accepted while no worker runs all stay queued; a worker that starts later records every one exactly once", async () => {
    const people = await Promise.all(Array.from({ length: 300 }, () => person()));
    for (let i = 0; i < people.length; i += 50) {
      const rs = await Promise.all(people.slice(i, i + 50).map((p) => submit(p, { evidence: "e.pdf" })));
      expect(rs.every((r) => r.status === 202)).toBe(true);
    }
    expect(await prisma.transaction.count({ where: { status: "QUEUED" } })).toBe(300);
    expect(await prisma.claim.count({ where: { taxpayerId: { in: people.map((p) => p.id) } } })).toBe(0);
    await sleep(300); // time passes with nobody working: nothing is lost or changed
    expect(await prisma.transaction.count({ where: { status: "QUEUED" } })).toBe(300);

    const stop = new AbortController();
    const worker = runWorker({ concurrency: 8, pollMs: 20, signal: stop.signal });
    await until(async () => (await prisma.transaction.count({ where: { status: "COMPLETED" } })) === 300);
    stop.abort();
    await worker;
    const claims = await prisma.claim.findMany({ where: { taxpayerId: { in: people.map((p) => p.id) } } });
    expect(claims).toHaveLength(300);
    expect(new Set(claims.map((c) => c.taxpayerId)).size).toBe(300);
    const done = await prisma.transaction.findMany();
    expect(done.every((d) => d.attempts === 1 && d.status === "COMPLETED")).toBe(true);
    expect(new Set(done.map((d) => d.claimReference))).toEqual(new Set(claims.map((c) => c.reference)));
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: { in: people.map((p) => p.id) } } } })).toBe(300);
  });

  it("stopping lets the item in hand finish and leaves the rest queued; the next worker carries on", async () => {
    const people = await Promise.all(Array.from({ length: 5 }, () => person()));
    for (const p of people) await submit(p, { evidence: "e.pdf" });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const began: string[] = [];
    const slow: Processor = async (job, tx) => { began.push(job.id); await gate; await processClaimJob(job, tx); };

    const stop = new AbortController();
    let stopped = false;
    const first = runWorker({ concurrency: 1, pollMs: 10, signal: stop.signal, process: slow }).then(() => { stopped = true; });
    await until(async () => began.length === 1);
    expect(await prisma.transaction.count({ where: { status: "PROCESSING" } })).toBe(1);
    stop.abort();
    await sleep(150);
    expect(stopped).toBe(false); // still finishing what it holds
    release();
    await first;
    expect(began).toHaveLength(1);
    expect(await prisma.transaction.count({ where: { status: "COMPLETED" } })).toBe(1);
    expect(await prisma.transaction.count({ where: { status: "QUEUED" } })).toBe(4);

    const stop2 = new AbortController();
    const second = runWorker({ concurrency: 2, pollMs: 10, signal: stop2.signal });
    await until(async () => (await prisma.transaction.count({ where: { status: "COMPLETED" } })) === 5);
    stop2.abort();
    await second;
    expect(await prisma.claim.count({ where: { taxpayerId: { in: people.map((p) => p.id) } } })).toBe(5);
  });

  it("six workers at once never take the same item, and no one is recorded twice", async () => {
    const people = await Promise.all(Array.from({ length: 100 }, () => person()));
    for (let i = 0; i < people.length; i += 50) await Promise.all(people.slice(i, i + 50).map((p) => submit(p, { evidence: "e.pdf" })));
    const seen = new Map<string, number>();
    const counted: Processor = async (job, tx) => { seen.set(job.id, (seen.get(job.id) ?? 0) + 1); await processClaimJob(job, tx); };
    const stop = new AbortController();
    const workers = Array.from({ length: 6 }, () => runWorker({ concurrency: 3, pollMs: 10, signal: stop.signal, process: counted }));
    await until(async () => (await prisma.transaction.count({ where: { status: "COMPLETED" } })) === 100);
    stop.abort();
    await Promise.all(workers);
    expect(seen.size).toBe(100);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
    expect(await prisma.claim.count({ where: { taxpayerId: { in: people.map((p) => p.id) } } })).toBe(100);
  });

  it("one worker never has more items in hand than its concurrency", async () => {
    const people = await Promise.all(Array.from({ length: 12 }, () => person()));
    for (const p of people) await submit(p, { evidence: "e.pdf" });
    let inFlight = 0;
    let most = 0;
    const measured: Processor = async (job, tx) => { inFlight += 1; most = Math.max(most, inFlight); await sleep(30); await processClaimJob(job, tx); inFlight -= 1; };
    const stop = new AbortController();
    const w = runWorker({ concurrency: 3, pollMs: 10, signal: stop.signal, process: measured });
    await until(async () => (await prisma.transaction.count({ where: { status: "COMPLETED" } })) === 12);
    stop.abort();
    await w;
    expect(most).toBe(3);
  });

  it("a worker that dies holding an item: after its lease runs out another worker records it, once", async () => {
    const t = await person();
    await submit(t, { evidence: "e.pdf" });
    const t0 = new Date();
    const lost = await claimNext({ now: t0, leaseMs: 60_000 }); // the worker takes it and is never heard of again
    expect(lost?.attempts).toBe(1);
    expect((await txOf(t))[0].status).toBe("PROCESSING");
    expect(await claimNext({ now: new Date(t0.getTime() + 30_000) })).toBeNull(); // lease still holds
    expect(await workOne({ now: () => new Date(t0.getTime() + 61_000) })).toBe("COMPLETED");
    const [row] = await txOf(t);
    expect(row).toMatchObject({ status: "COMPLETED", attempts: 2 });
    expect(await claimsOf(t)).toBe(1);
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(1);
  });

  it("a worker whose lease was taken over cannot change anything when it comes back", async () => {
    const t = await person();
    await submit(t, { evidence: "e.pdf" });
    const t0 = new Date();
    const slow = (await claimNext({ now: t0, leaseMs: 1_000 }))!;
    const fast = (await claimNext({ now: new Date(t0.getTime() + 2_000) }))!;
    expect(fast.id).toBe(slow.id);
    expect(fast.leaseToken).not.toBe(slow.leaseToken);
    expect(await processClaimed(fast, processClaimJob)).toBe("COMPLETED");
    const ran = vi.fn<Processor>(async (job, tx) => processClaimJob(job, tx));
    expect(await processClaimed(slow, ran)).toBe("LOST_LEASE");
    expect(ran).not.toHaveBeenCalled();
    expect(await claimsOf(t)).toBe(1);
    // ...and it cannot fail the item the other worker finished either.
    expect((await txOf(t))[0]).toMatchObject({ status: "COMPLETED", attempts: 2 });
  });

  it("a worker holding a stale lease that tries first changes nothing either", async () => {
    const t = await person();
    await submit(t, { evidence: "e.pdf" });
    const t0 = new Date();
    const slow = (await claimNext({ now: t0, leaseMs: 1_000 }))!;
    const fast = (await claimNext({ now: new Date(t0.getTime() + 2_000) }))!;
    expect(await processClaimed(slow, processClaimJob)).toBe("LOST_LEASE");
    expect((await txOf(t))[0].status).toBe("PROCESSING");
    expect(await claimsOf(t)).toBe(0);
    expect(await processClaimed(fast, processClaimJob)).toBe("COMPLETED");
    expect(await claimsOf(t)).toBe(1);
  });
});

describe("retry, backoff and giving up", () => {
  it("a failed attempt is retried after a growing delay, then FAILED and inspectable, never retried by itself again", async () => {
    process.env.HMRC_QUEUE_MAX_ATTEMPTS = "3";
    const t = await person();
    const receipt = await submit(t, { key: "k-fail", evidence: "e.pdf" });
    const id = receipt.body.result.transaction_id as string;
    const t0 = new Date();
    const at = (ms: number) => () => new Date(t0.getTime() + ms);
    const settings = { backoffBaseMs: 1_000, backoffCapMs: 60_000 };
    const boom: Processor = async () => { throw new Error("the back-end fell over: secret-internal-detail"); };

    expect(await workOne({ now: at(0), process: boom, ...settings })).toBe("RETRY");
    let row = (await txOf(t))[0];
    expect(row).toMatchObject({ status: "QUEUED", attempts: 1, leaseToken: null });
    expect(row.nextAttemptAt.getTime()).toBe(t0.getTime() + 1_000);
    expect(row.lastError).toMatch(/secret-internal-detail/);
    expect(await claimNext({ now: at(500)() })).toBeNull(); // not yet

    expect(await workOne({ now: at(1_000), process: boom, ...settings })).toBe("RETRY");
    row = (await txOf(t))[0];
    expect(row.nextAttemptAt.getTime()).toBe(t0.getTime() + 1_000 + 2_000); // doubled
    expect(await workOne({ now: at(2_500), process: boom, ...settings })).toBeNull();

    expect(await workOne({ now: at(3_000), process: boom, ...settings })).toBe("FAILED");
    row = (await txOf(t))[0];
    expect(row).toMatchObject({ status: "FAILED", attempts: 3, leaseToken: null });
    expect(row.failedAt).not.toBeNull();
    expect(await workOne({ now: at(10 * 60_000), process: boom, ...settings })).toBeNull(); // left alone
    expect(await claimsOf(t)).toBe(0);

    // The client can see it, without the operator's detail.
    const status = await statusOf(asAgent(agentFor(t), t, `/api/transactions/${id}`), id);
    expect(status.status).toBe(200);
    expect(status.body.result).toMatchObject({ status: "FAILED", attempts: 3, failure: { code: "PROCESSING_FAILED", retry_with_new_request: true } });
    expect(JSON.stringify(status.body)).not.toMatch(/secret-internal-detail|approv|eligib/i);
    expect(status.body.result.claim_reference).toBeUndefined();

    // Delegate is told, and the person's place is free again for a new request.
    expect(delegate.outcomes.filter((o) => o.status === "FAILED")).toEqual([expect.objectContaining({ reason: "PROCESSING_FAILED", idempotency_key: `tx:${id}:FAILED` })]);
    expect((await submit(t, { evidence: "e.pdf" })).status).toBe(202);
  });

  it("an attempt that wrote some things and then failed leaves nothing behind; the retry makes the claim once", async () => {
    const t = await person();
    await submit(t, { evidence: "e.pdf" });
    let first = true;
    const flaky: Processor = async (job, tx) => {
      await processClaimJob(job, tx); // claim, tax code and HMRC's question are written ...
      if (first) { first = false; throw new Error("... and then the attempt fails"); }
    };
    const t0 = new Date();
    expect(await workOne({ now: () => t0, process: flaky, backoffBaseMs: 1_000 })).toBe("RETRY");
    expect(await claimsOf(t)).toBe(0);
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(0);
    expect((await prisma.taxpayer.findUniqueOrThrow({ where: { id: t.id } })).taxCode).toBe("1257L");
    expect(await workOne({ now: () => new Date(t0.getTime() + 1_000), process: flaky })).toBe("COMPLETED");
    expect(await claimsOf(t)).toBe(1);
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(1);
    expect((await txOf(t))[0]).toMatchObject({ status: "COMPLETED", attempts: 2, lastError: null });
  });

  it("an item whose worker dies on every allowed attempt becomes FAILED instead of looping", async () => {
    const t = await person();
    await queue(t, new Date(), "e", undefined);
    await prisma.transaction.updateMany({ where: { subject: t.oneLoginSubject }, data: { maxAttempts: 2 } });
    const t0 = new Date();
    expect((await claimNext({ now: t0, leaseMs: 1_000 }))?.attempts).toBe(1);
    expect((await claimNext({ now: new Date(t0.getTime() + 2_000), leaseMs: 1_000 }))?.attempts).toBe(2);
    expect(await claimNext({ now: new Date(t0.getTime() + 4_000) })).toBeNull();
    expect((await txOf(t))[0]).toMatchObject({ status: "FAILED", attempts: 2, lastError: "LEASE_EXPIRED_ON_LAST_ATTEMPT" });
    expect(await failExhaustedLeases(new Date(t0.getTime() + 5_000))).toBe(0);
  });

  it("backs off exponentially up to a cap", () => {
    const s = { backoffBaseMs: 5_000, backoffCapMs: 300_000 };
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => backoffMs(n, s) / 1000)).toEqual([5, 10, 20, 40, 80, 160, 300, 300]);
  });
});

describe("fairness: by person, in order received, whoever sent it", () => {
  const order = async (n: number, extra?: (served: number) => Promise<void>) => {
    const served: string[] = [];
    const record: Processor = async (job, tx) => { served.push(job.subject); await processClaimJob(job, tx); };
    for (let i = 0; i < n; i++) {
      await extra?.(i);
      if ((await workOne({ process: record })) === null) break;
    }
    return served;
  };

  it("one person with a long backlog cannot keep others waiting: each person gets a turn in turn", async () => {
    const [a, b, c] = [await person(), await person(), await person()];
    const t0 = Date.now() - 60_000; // all received a minute ago, so all are due
    for (let i = 0; i < 12; i++) await queue(a, new Date(t0 + i), `a-${i}`, "bulk-provider");
    await queue(b, new Date(t0 + 100), "b-0", "bulk-provider"); // later, and from the same provider as the backlog
    await queue(c, new Date(t0 + 101), "c-0");
    const served = await order(14);
    expect(served.slice(0, 3)).toEqual([a, b, c].map((p) => p.oneLoginSubject));
    expect(served.indexOf(b.oneLoginSubject)).toBeLessThan(3);
    expect(served.indexOf(c.oneLoginSubject)).toBeLessThan(3);
    expect(served.slice(3).every((s) => s === a.oneLoginSubject)).toBe(true);
    expect(served).toHaveLength(14);
  });

  it("someone who arrives while a backlog is being worked goes next, not last", async () => {
    const [a, b, d] = [await person(), await person(), await person()];
    const t0 = Date.now() - 60_000; // all received a minute ago, so all are due
    for (let i = 0; i < 8; i++) await queue(a, new Date(t0 + i), `a-${i}`);
    await queue(b, new Date(t0 + 50), "b-0");
    const served = await order(11, async (i) => { if (i === 2) await queue(d, new Date(t0 + 60), "d-0"); });
    // d was never served, so goes before a, who has had a turn
    expect(served.slice(0, 4)).toEqual([a, b, d, a].map((p) => p.oneLoginSubject));
  });

  it("a person's own claims are recorded in the order received, one at a time", async () => {
    const a = await person();
    const t0 = Date.now() - 60_000; // all received a minute ago, so all are due
    const rows = [];
    for (let i = 0; i < 3; i++) rows.push(await queue(a, new Date(t0 + i * 10), `e-${i}`));
    const refs: string[] = [];
    const record: Processor = async (job, tx) => { refs.push(job.id); await processClaimJob(job, tx); };
    while ((await workOne({ process: record })) !== null);
    expect(refs).toEqual(rows.map((r) => r.id));
    const claims = await prisma.claim.findMany({ where: { taxpayerId: a.id }, orderBy: { createdAt: "asc" } });
    expect(claims.map((c) => c.summary.includes("new evidence added"))).toEqual([false, true, true]); // the first is the claim, later ones amend it
  });

  it("several workers still handle only one item per person at a time", async () => {
    const people = [await person(), await person(), await person()];
    const t0 = Date.now() - 60_000; // all received a minute ago, so all are due
    for (const [pi, p] of people.entries()) for (let i = 0; i < 5; i++) await queue(p, new Date(t0 + pi * 100 + i), `${pi}-${i}`);
    const inFlight = new Map<string, number>();
    let most = 0;
    const measured: Processor = async (job, tx) => {
      const n = (inFlight.get(job.subject) ?? 0) + 1;
      inFlight.set(job.subject, n);
      most = Math.max(most, n);
      await sleep(20);
      await processClaimJob(job, tx);
      inFlight.set(job.subject, n - 1);
    };
    const stop = new AbortController();
    const ws = Array.from({ length: 4 }, () => runWorker({ concurrency: 2, pollMs: 10, signal: stop.signal, process: measured }));
    await until(async () => (await prisma.transaction.count({ where: { status: "COMPLETED" } })) === 15);
    stop.abort();
    await Promise.all(ws);
    expect(most).toBe(1);
    for (const p of people) expect(await claimsOf(p)).toBe(5);
  });
});

describe("the status endpoint", () => {
  it("shows QUEUED, PROCESSING and COMPLETED to the person and to their agent, and the claim reference only once it exists", async () => {
    const t = await person();
    const token = agentFor(t);
    const receipt = await submit(t, { key: "k-s", evidence: "e.pdf", token });
    const id = receipt.body.result.transaction_id as string;
    const path = `/api/transactions/${id}`;

    const queued = await statusOf(asAgent(token, t, path), id);
    expect(queued.status).toBe(200);
    expect(queued.body.result).toMatchObject({ transaction_id: id, status: "QUEUED", status_url: path });
    expect(queued.body.result.claim_reference).toBeUndefined();

    const held = (await claimNext())!; // a worker has it, and is working
    expect((await statusOf(await asHuman(t, path), id)).body.result).toMatchObject({ status: "PROCESSING", attempts: 1 });
    expect(await processClaimed(held, processClaimJob)).toBe("COMPLETED");

    const person_ = await statusOf(await asHuman(t, path), id);
    expect(person_.status).toBe(200);
    expect(person_.body.result).toMatchObject({ status: "COMPLETED", submitted_by: { kind: "AGENT", name: "Agent prov" } });
    const claim = await prisma.claim.findFirstOrThrow({ where: { taxpayerId: t.id } });
    expect(person_.body.result.claim_reference).toBe(claim.reference);
    expect(person_.body.result.status_meaning).toMatch(/not a decision/);
    expect(JSON.stringify(person_.body)).not.toMatch(/approv|eligib/i);

    // A retry of the original request now says where it has got to, not where it was.
    const replay = await submit(t, { key: "k-s", evidence: "e.pdf", token });
    expect(replay.status).toBe(202);
    expect(replay.body.result).toMatchObject({ transaction_id: id, status: "COMPLETED", claim_reference: claim.reference });
  });

  it("is only for the person it is about: other people, other people's agents and strangers learn nothing, not even that it exists", async () => {
    const owner = await person();
    const other = await person();
    const receipt = await submit(owner, { evidence: "e.pdf" });
    const id = receipt.body.result.transaction_id as string;
    const path = `/api/transactions/${id}`;
    const nothing = await statusOf(await asHuman(other, `/api/transactions/tx_${"A".repeat(22)}`), `tx_${"A".repeat(22)}`);

    const asOther = await statusOf(await asHuman(other, path), id);
    expect(asOther.status).toBe(404);
    expect(asOther.body).toMatchObject({ decision: "DENY", reason: "TRANSACTION_NOT_FOUND", kind: "BUSINESS_REFUSAL" });
    const same = (b: any) => ({ reason: b.reason, kind: b.kind, message: b.message, retryable: b.retryable });
    expect(same(asOther.body)).toEqual(same(nothing.body));
    const otherAgent = await statusOf(asAgent(agentFor(other, "someone-else"), other, path), id);
    expect(otherAgent.status).toBe(404);
    expect(same(otherAgent.body)).toEqual(same(nothing.body));
    expect(JSON.stringify([asOther.body, otherAgent.body])).not.toContain(id);

    // An agent can't look at one person's receipt while claiming to act for another.
    const lying = await statusOf(asAgent(agentFor(other, "mallory"), owner, path), id);
    expect(lying.status).toBe(404);

    const stranger = await statusOf(anonymous(path), id);
    expect(stranger.status).toBe(401);
    expect(JSON.stringify(stranger.body)).not.toContain("QUEUED");
  });

  it("an agent needs permission to view claims, and a revoked one is refused", async () => {
    const t = await person();
    const receipt = await submit(t, { evidence: "e.pdf" });
    const id = receipt.body.result.transaction_id as string;
    const path = `/api/transactions/${id}`;
    const noView = await statusOf(asAgent(agentFor(t, "no-view", ["view_claim_status"]), t, path), id);
    expect(noView.status).toBe(403);
    expect(noView.body.reason).toBe("PERMISSION_MISSING");
    const revoked = agentFor(t, "gone");
    delegate.revoked.add(revoked);
    const gone = await statusOf(asAgent(revoked, t, path), id);
    expect(gone.status).toBe(403);
    expect(gone.body.reason).toBe("AUTHORISATION_REVOKED");
  });

  it("looking at status is a cheap read: it does not use the person's few scheduled progress checks", async () => {
    const t = await person();
    const token = agentFor(t);
    const receipt = await submit(t, { evidence: "e.pdf", token });
    const id = receipt.body.result.transaction_id as string;
    for (let i = 0; i < 20; i++) expect((await statusOf(asAgent(token, t, `/api/transactions/${id}`), id)).status).toBe(200);
    expect(await prisma.principalUsage.count({ where: { subject: t.oneLoginSubject } })).toBe(0);
  });
});

describe("revocation after acceptance (chosen mock behaviour: received claims are still recorded)", () => {
  it("stops new submissions and status reads by the agent, keeps what was already received, and records who sent it", async () => {
    const t = await person();
    const token = agentFor(t);
    const receipt = await submit(t, { key: "k-r", evidence: "e.pdf", token });
    const id = receipt.body.result.transaction_id as string;
    const checkId = (await txOf(t))[0].delegateCheckId;
    expect(checkId).not.toBeNull();

    delegate.revoked.add(token); // the person removes the agent's permission

    const after = await submit(t, { key: "k-r2", evidence: "second.pdf", token });
    expect(after.status).toBe(403);
    expect(after.body).toMatchObject({ decision: "DENY", reason: "AUTHORISATION_REVOKED" });
    expect(await txOf(t)).toHaveLength(1); // nothing new was accepted
    expect((await statusOf(asAgent(token, t, `/api/transactions/${id}`), id)).status).toBe(403);

    // What was received before is not silently cancelled, and its history says which agent sent it.
    expect(await workOne()).toBe("COMPLETED");
    const claim = await prisma.claim.findFirstOrThrow({ where: { taxpayerId: t.id } });
    expect(claim).toMatchObject({ submittedBy: "AGENT", agentName: "Agent prov", mandateId: "m-prov", delegationId: "d-prov", reference: (await txOf(t))[0].claimReference });
    // The outcome is reported against the check that authorised it, after the authority has gone.
    expect(delegate.outcomes.filter((o) => o.check_id === checkId).map((o) => o.status)).toEqual(["ACCEPTED", "COMPLETED"]);
    expect(delegate.outcomes.at(-1)).toMatchObject({ status: "COMPLETED", reference: claim.reference });

    // The person can still see it.
    const seen = await statusOf(await asHuman(t, `/api/transactions/${id}`), id);
    expect(seen.body.result).toMatchObject({ status: "COMPLETED", claim_reference: claim.reference, submitted_by: { kind: "AGENT", name: "Agent prov" } });
  });
});

describe("outcome reporting to Delegate", () => {
  it("a report that could not be delivered is sent on a later sweep, once", async () => {
    const t = await person();
    await submit(t, { evidence: "e.pdf" });
    delegate.outcomes.length = 0;
    delegate.reportsWork = false; // Delegate is down when the claim is recorded
    expect(await workOne()).toBe("COMPLETED");
    expect((await txOf(t))[0].outcomeReported).toBe(false);
    expect(delegate.outcomes).toHaveLength(0);
    delegate.reportsWork = true;
    expect(await reportOutcomes()).toBe(1);
    expect(await reportOutcomes()).toBe(0);
    expect(delegate.outcomes.map((o) => o.status)).toEqual(["COMPLETED"]);
    expect(delegate.outcomes[0].idempotency_key).toBe(`tx:${(await txOf(t))[0].id}:COMPLETED`);
    expect((await txOf(t))[0].outcomeReported).toBe(true);
  });
});
