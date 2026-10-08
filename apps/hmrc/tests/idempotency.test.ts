import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { withPrincipalCapacity } from "@/lib/capacity";
import { answerQuery, changeAddress, claimJobExpenses, findOrCreateTaxpayer, type Taxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE } from "@/lib/session";
import { POST as submitClaimForm } from "@/app/(public)/claim/submit/route";
import { POST as replyForm } from "@/app/(public)/query/reply/route";
import { POST as claimApi } from "@/app/api/job-expenses/route";
import { POST as respondApi } from "@/app/api/claims/respond/route";

afterAll(() => prisma.$disconnect());

// Synthetic people only: each test makes its own, so tests never share state.
const person = () => findOrCreateTaxpayer(`urn:test:${randomUUID()}`);
const SELF = { kind: "SELF" } as const;
const CLAIM = "claim_job_expenses";
const RESPOND = "respond_to_query";

const claim = (t: Taxpayer, key: string | null, evidence?: string) =>
  withPrincipalCapacity(t, CLAIM, { evidence }, (admitted, tx) => claimJobExpenses(t, SELF, admitted, tx), { idempotencyKey: key });
const answer = (t: Taxpayer, key: string | null, query_id: string, text: string) =>
  withPrincipalCapacity(t, RESPOND, { query_id, answer: text, confirmed_by_person: true }, (_a, tx) => answerQuery(t, SELF, { query_id, answer: text, confirmed_by_person: true }, tx), { idempotencyKey: key });

const claimsOf = (t: Taxpayer) => prisma.claim.count({ where: { taxpayerId: t.id, kind: "job_expenses" } });
const recordsOf = (t: Taxpayer, operation?: string) => prisma.idempotencyRecord.count({ where: { subject: t.oneLoginSubject, ...(operation ? { operation } : {}) } });
const openQuery = async (t: Taxpayer) => (await prisma.claimQuery.findFirstOrThrow({ where: { claim: { taxpayerId: t.id } } })).id;
const refusalOf = (r: { ok: boolean; refusal?: { reason: string } }) => (r.ok ? null : r.refusal?.reason ?? null);

describe("same attempt: Idempotency-Key", () => {
  it("100 concurrent identical retries create exactly one claim; every success references it", async () => {
    const t = await person();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 100 }, () => claim(t, key, "payslip.pdf")));
    expect(results.every((r) => r.ok)).toBe(true);
    const oks = results.flatMap((r) => (r.ok ? [r] : []));
    expect(oks.filter((r) => !r.replayed)).toHaveLength(1);
    expect(oks.filter((r) => r.replayed)).toHaveLength(99);
    expect(new Set(oks.map((r) => r.result.claim_reference)).size).toBe(1);
    expect(await claimsOf(t)).toBe(1);
    expect(await recordsOf(t)).toBe(1);
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(1); // HMRC's one question, not 100
    const record = await prisma.idempotencyRecord.findFirstOrThrow({ where: { subject: t.oneLoginSubject } });
    expect(record.reference).toBe(oks[0].result.claim_reference);
    expect(record.status).toBe("COMPLETED");
  });

  it("treats evidence that differs only in case and spacing as the same request", async () => {
    const t = await person();
    const key = randomUUID();
    const first = await claim(t, key, "Payslip.PDF");
    const second = await claim(t, key, "  payslip.pdf ");
    expect(first.ok && second.ok && second.replayed).toBe(true);
    expect(await claimsOf(t)).toBe(1);
  });

  it("answers a lost response: the same key later returns the original outcome, without running again", async () => {
    const t = await person();
    const key = randomUUID();
    const lost = await claim(t, key, "a.pdf"); // committed; the client never saw the reply
    expect(lost.ok && !lost.replayed).toBe(true);
    let ran = false;
    const again = await withPrincipalCapacity(t, CLAIM, { evidence: "a.pdf" }, async () => { ran = true; return {}; }, { idempotencyKey: key });
    expect(ran).toBe(false);
    expect(again.ok && again.replayed).toBe(true);
    if (lost.ok && again.ok) expect(again.result).toEqual(lost.result);
  });

  it("refuses a key reused for different content, and overwrites nothing", async () => {
    const t = await person();
    const key = randomUUID();
    const first = await claim(t, key, "first.pdf");
    const before = await prisma.idempotencyRecord.findFirstOrThrow({ where: { subject: t.oneLoginSubject } });
    const clash = await claim(t, key, "something-else.pdf");
    expect(refusalOf(clash)).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await claimsOf(t)).toBe(1);
    const after = await prisma.idempotencyRecord.findFirstOrThrow({ where: { subject: t.oneLoginSubject } });
    expect(after.payloadDigest).toBe(before.payloadDigest);
    expect(after.reference).toBe(first.ok ? first.result.claim_reference : "");
    // ...and the original is still retrievable with the original content.
    const retry = await claim(t, key, "first.pdf");
    expect(retry.ok && retry.replayed).toBe(true);
  });

  it("rejects a malformed key without running anything", async () => {
    const t = await person();
    for (const bad of ["", "has space", "x".repeat(129), "tab\there"]) expect(refusalOf(await claim(t, bad))).toBe("INVALID_IDEMPOTENCY_KEY");
    expect(await claimsOf(t)).toBe(0);
  });

  it("scopes keys to the person: two people can use the same key", async () => {
    const [a, b] = [await person(), await person()];
    const key = randomUUID();
    const [ra, rb] = await Promise.all([claim(a, key), claim(b, key)]);
    expect(ra.ok && !ra.replayed && rb.ok && !rb.replayed).toBe(true);
    expect(await claimsOf(a)).toBe(1);
    expect(await claimsOf(b)).toBe(1);
  });

  it("ignores the key for operations that don't support it yet", async () => {
    const t = await person();
    const run = () => withPrincipalCapacity(t, "change_address", {}, (_a, tx) => changeAddress(t, SELF, tx), { idempotencyKey: "same-key" });
    expect((await run()).ok).toBe(true);
    expect((await run()).ok).toBe(true);
    expect(await recordsOf(t)).toBe(0);
  });
});

describe("equivalent claim, different key: HMRC's business rules still apply", () => {
  it("two agents racing for one person, each with its own key, make one claim", async () => {
    const t = await person();
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => claim(t, `agent-${i % 2 ? "a" : "b"}-${i}`, "payslip.pdf")));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(new Set(results.map(refusalOf).filter(Boolean))).toEqual(new Set(["DUPLICATE_SUBMISSION"]));
    expect(await claimsOf(t)).toBe(1);
    expect(await recordsOf(t)).toBe(1); // refused attempts leave no record
  });

  it("a second claim without new evidence is refused under a new key; with new evidence it is an amendment", async () => {
    const t = await person();
    expect((await claim(t, "k1")).ok).toBe(true);
    expect(refusalOf(await claim(t, "k2"))).toBe("NEW_EVIDENCE_REQUIRED");
    const amend = await claim(t, "k3", "new-evidence.pdf");
    expect(amend.ok && !amend.replayed && amend.result.claim_reference !== undefined).toBe(true);
    expect(await claimsOf(t)).toBe(2);
  });

  it("racing answers to one question under different keys: one answer", async () => {
    const t = await person();
    await claim(t, null);
    const q = await openQuery(t);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => answer(t, `a-${i}`, q, `Policy applied from 1 April ${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.claimQuery.count({ where: { id: q, status: "ANSWERED" } })).toBe(1);
  });
});

describe("answering HMRC's question: Idempotency-Key", () => {
  it("100 concurrent identical answers record one answer", async () => {
    const t = await person();
    await claim(t, null);
    const q = await openQuery(t);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 100 }, () => answer(t, key, q, "From 1 April 2026.")));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(await recordsOf(t, RESPOND)).toBe(1);
    expect((await prisma.claimQuery.findUniqueOrThrow({ where: { id: q } })).answer).toBe("From 1 April 2026.");
  });

  it("refuses the same key with a different answer; the first answer stands", async () => {
    const t = await person();
    await claim(t, null);
    const q = await openQuery(t);
    const key = randomUUID();
    await answer(t, key, q, "First answer");
    expect(refusalOf(await answer(t, key, q, "A different answer"))).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await prisma.claimQuery.findUniqueOrThrow({ where: { id: q } })).answer).toBe("First answer");
  });
});

describe("failure injection: no success without a durable record, no stuck PENDING", () => {
  it("a crash inside the handler rolls back the claim, the tax code change and the record; the retry is a clean first try", async () => {
    const t = await person();
    const key = randomUUID();
    const boom = withPrincipalCapacity(t, CLAIM, { evidence: "e.pdf" }, async (admitted, tx) => {
      await claimJobExpenses(t, SELF, admitted, tx); // claim, question and tax code written...
      throw new Error("injected: process dies before commit");
    }, { idempotencyKey: key });
    await expect(boom).rejects.toThrow("injected");
    expect(await claimsOf(t)).toBe(0);
    expect(await prisma.claimQuery.count({ where: { claim: { taxpayerId: t.id } } })).toBe(0);
    expect(await recordsOf(t)).toBe(0);
    expect((await prisma.taxpayer.findUniqueOrThrow({ where: { id: t.id } })).taxCode).toBe("1257L");

    const retry = await claim(t, key, "e.pdf");
    expect(retry.ok && !retry.replayed).toBe(true);
    expect(await claimsOf(t)).toBe(1);
    expect(await recordsOf(t)).toBe(1);
  });

  it("a failure while writing the record (duplicate key slipped past the lock) rolls the business write back too", async () => {
    const t = await person();
    const key = randomUUID();
    // Another writer's record appears after this attempt's lookup: only the unique index can stop us now.
    const racing = withPrincipalCapacity(t, CLAIM, { evidence: "e.pdf" }, async (admitted, tx) => {
      const result = await claimJobExpenses(t, SELF, admitted, tx);
      await prisma.idempotencyRecord.create({
        data: { subject: t.oneLoginSubject, operation: CLAIM, key, payloadDigest: "other", response: {}, admitted: {} },
      });
      return result;
    }, { idempotencyKey: key });
    await expect(racing).rejects.toMatchObject({ code: "P2002" });
    expect(await claimsOf(t)).toBe(0);
    expect(await recordsOf(t)).toBe(1); // only the other writer's
  });

  it("a timed-out attempt leaves nothing behind: the lock and the transaction are released", async () => {
    const t = await person();
    const key = randomUUID();
    const slow = withPrincipalCapacity(t, CLAIM, {}, async (admitted, tx) => {
      await claimJobExpenses(t, SELF, admitted, tx);
      await new Promise((r) => setTimeout(r, 300));
      throw new Error("injected: deadline exceeded");
    }, { idempotencyKey: key });
    // A retry arriving meanwhile waits for the person's lock, then sees no record and does the work once.
    await new Promise((r) => setTimeout(r, 100));
    const retry = claim(t, key);
    await expect(slow).rejects.toThrow("injected");
    const r = await retry;
    expect(r.ok && !r.replayed).toBe(true);
    expect(await claimsOf(t)).toBe(1);
    expect(await recordsOf(t)).toBe(1);
  });

  it("the table cannot represent a PENDING record", async () => {
    const t = await person();
    await expect(
      prisma.idempotencyRecord.create({ data: { subject: t.oneLoginSubject, operation: CLAIM, key: "x", payloadDigest: "d", status: "PENDING" as never, response: {}, admitted: {} } }),
    ).rejects.toThrow();
  });
});

// The website forms and the agent API use the same function with the same protection.
describe("human and API paths share the protection", () => {
  const cookie = async (t: Taxpayer) => `${SESSION_COOKIE}=${await signSession(t.id)}`;
  const form = async (path: string, t: Taxpayer, fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return new Request(`http://localhost:3302${path}`, { method: "POST", headers: { cookie: await cookie(t) }, body: fd });
  };
  const json = async (path: string, t: Taxpayer, body: unknown, key?: string) =>
    new Request(`http://localhost:3302${path}`, {
      method: "POST",
      headers: { cookie: await cookie(t), "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
      body: JSON.stringify(body),
    });
  const where = (res: Response) => res.headers.get("location") ?? "";

  it("a claim form submitted many times with one submission id is one claim, and every response says so", async () => {
    const t = await person();
    const id = randomUUID();
    const responses = await Promise.all(Array.from({ length: 30 }, async () => submitClaimForm(await form("/claim/submit", t, { submission_id: id }))));
    const targets = new Set(responses.map(where));
    expect(targets.size).toBe(1);
    expect([...targets][0]).toMatch(/\/your-tax\?claimed=JE-/);
    expect(await claimsOf(t)).toBe(1);
    expect(await recordsOf(t)).toBe(1);
  });

  it("a second form with a fresh submission id is a new attempt, so HMRC's one-claim rule refuses it", async () => {
    const t = await person();
    await submitClaimForm(await form("/claim/submit", t, { submission_id: randomUUID() }));
    const second = await submitClaimForm(await form("/claim/submit", t, { submission_id: randomUUID() }));
    expect(where(second)).toMatch(/refused=NEW_EVIDENCE_REQUIRED/);
    expect(await claimsOf(t)).toBe(1);
  });

  it("a form without a submission id still works (and is covered by HMRC's business rules)", async () => {
    const t = await person();
    expect(where(await submitClaimForm(await form("/claim/submit", t, {})))).toMatch(/claimed=JE-/);
    expect(await recordsOf(t)).toBe(0);
  });

  it("an answer form submitted twice with one submission id records one answer", async () => {
    const t = await person();
    await submitClaimForm(await form("/claim/submit", t, { submission_id: randomUUID() }));
    const q = await openQuery(t);
    const id = randomUUID();
    const res = await Promise.all([1, 2, 3, 4, 5].map(async () => replyForm(await form("/query/reply", t, { submission_id: id, query_id: q, answer: "From 1 April 2026." }))));
    expect(new Set(res.map(where))).toEqual(new Set(["http://localhost:3302/your-tax?replied=1"]));
    expect(await recordsOf(t, RESPOND)).toBe(1);
  });

  it("the JSON API honours Idempotency-Key for a signed-in person: 50 retries, one claim, replayed flag and header set", async () => {
    const t = await person();
    const key = randomUUID();
    const res = await Promise.all(Array.from({ length: 50 }, async () => claimApi(await json("/api/job-expenses", t, { evidence: "p.pdf" }, key))));
    expect(res.map((r) => r.status)).toEqual(Array(50).fill(200));
    const bodies = await Promise.all(res.map((r) => r.json()));
    expect(new Set(bodies.map((b) => b.result.claim_reference)).size).toBe(1);
    expect(bodies.filter((b) => b.idempotent_replay)).toHaveLength(49);
    expect(res.filter((r) => r.headers.get("idempotent-replayed") === "true")).toHaveLength(49);
    expect(await claimsOf(t)).toBe(1);
  });

  it("the JSON API answers 409 IDEMPOTENCY_KEY_REUSED for the same key with different content, and 400 for a bad key", async () => {
    const t = await person();
    const key = randomUUID();
    expect((await claimApi(await json("/api/job-expenses", t, { evidence: "one.pdf" }, key))).status).toBe(200);
    const clash = await claimApi(await json("/api/job-expenses", t, { evidence: "two.pdf" }, key));
    expect(clash.status).toBe(409);
    expect((await clash.json()).reason).toBe("IDEMPOTENCY_KEY_REUSED");
    const bad = await claimApi(await json("/api/job-expenses", t, {}, "not valid"));
    expect(bad.status).toBe(400);
    expect(await claimsOf(t)).toBe(1);
  });

  it("the form path and the API path for one person cannot both make the claim", async () => {
    const t = await person();
    const [viaForm, viaApi] = await Promise.all([
      submitClaimForm(await form("/claim/submit", t, { submission_id: randomUUID() })),
      claimApi(await json("/api/job-expenses", t, {}, randomUUID())),
    ]);
    const formWon = where(viaForm).includes("claimed=");
    const apiWon = viaApi.status === 200;
    expect(formWon !== apiWon).toBe(true);
    expect(await claimsOf(t)).toBe(1);
  });

  it("respond API: lost response is retrievable with the same key", async () => {
    const t = await person();
    await claimApi(await json("/api/job-expenses", t, {}));
    const q = await openQuery(t);
    const key = randomUUID();
    const body = { query_id: q, answer: "From 1 April 2026." };
    const first = await respondApi(await json("/api/claims/respond", t, body, key));
    const retry = await respondApi(await json("/api/claims/respond", t, body, key));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await retry.json()).idempotent_replay).toBe(true);
    const clash = await respondApi(await json("/api/claims/respond", t, { ...body, answer: "Changed my mind" }, key));
    expect(clash.status).toBe(409);
  });
});
