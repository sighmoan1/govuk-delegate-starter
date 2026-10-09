import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  prisma, newPrincipal, authorise, check, revokeAuthorisation, approve, decline, reserve, markDone, giveBack, approvedRefund,
  refundProposal, REFUND, ADDRESS, DELEGATE, HMRC, SERVICE,
} from "./helpers";

afterAll(() => prisma.$disconnect());

// Issue #19 (with #37 and #38): a step-up approval is the person's yes to ONE
// proposed change. Checking never uses it. Only the service that makes the
// change reserves it, and spends it when the change has been made.

const ask = (token: string, principalId: string, proposal: unknown, capability = "change_refund_account") =>
  check({ agent_token: token, principal_id: principalId, capability, proposal });
const rowOf = (code: string) => prisma.stepUp.findUniqueOrThrow({ where: { userCode: code } });
const past = () => new Date(Date.now() - 1000);

describe("the approval is a read until the service reserves it", () => {
  it("repeated checks do not use an approval, and each is logged", async () => {
    const { sam, token, proposal, code } = await approvedRefund();
    const before = await prisma.activityEvent.count({ where: { principalId: sam.id } });
    const results = await Promise.all(Array.from({ length: 25 }, () => ask(token, sam.id, proposal)));
    expect(results.every((r) => r.body.authorised === true && r.body.step_up.state === "APPROVED")).toBe(true);
    expect(await prisma.activityEvent.count({ where: { principalId: sam.id } })).toBe(before + 25);
    expect(await rowOf(code)).toMatchObject({ status: "APPROVED", usedAt: null, reservationId: null });
  });

  it("with no proposal, a high-risk capability reports PROPOSAL_REQUIRED and opens nothing for the person to approve", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const r = await ask(token, sam.id, undefined);
    expect(r.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED", step_up: { state: "PROPOSAL_REQUIRED" } });
    expect(r.body.step_up.user_code).toBeUndefined();
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(0);
  });

  it.each([
    ["missing field", { account_name: "Sam", sort_code: "20-00-00" }],
    ["bad account number", { ...REFUND, account_number: "12" }],
    ["unexpected field", { ...REFUND, extra: "x" }],
  ])("a malformed proposal (%s) is PROPOSAL_INVALID and opens nothing", async (_n, payload) => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const r = await ask(token, sam.id, refundProposal(randomUUID(), payload as Record<string, string>));
    expect(r.body).toMatchObject({ authorised: false, step_up: { state: "PROPOSAL_INVALID" } });
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(0);
  });

  it("the person is shown the change with the account number masked, and the reference binds mandate, principal, service, capability, content, key and expiry", async () => {
    const { sam, first, row, authorisationId } = await approvedRefund();
    const s = first.body.step_up;
    expect(s.details).toEqual([
      { label: "Name on the account", value: "Sam Taylor" },
      { label: "Sort code", value: "20-00-00" },
      { label: "Account number", value: "ending 9911" },
    ]);
    expect(JSON.stringify(s)).not.toContain("55779911");
    expect(JSON.stringify(row.display)).not.toContain("55779911"); // Delegate keeps a digest and a masked display, not the account number
    expect(s.proposal_hash).toBe(row.proposalHash);
    expect(s.proposal_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row).toMatchObject({ mandateId: authorisationId, principalId: sam.id, capability: "change_refund_account" });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: SERVICE } });
    expect(row.serviceId).toBe(service.id);
    // The reference changes with any bound field.
    const { proposalHashOf } = await import("@/lib/step-ups");
    const f = { mandateId: row.mandateId, principalId: row.principalId, serviceId: row.serviceId, capability: row.capability, payloadDigest: row.payloadDigest, idempotencyKey: row.idempotencyKey, expiresAt: row.expiresAt };
    expect(proposalHashOf(f)).toBe(row.proposalHash);
    for (const change of [{ mandateId: "x" }, { principalId: "x" }, { serviceId: "x" }, { capability: "change_address" }, { payloadDigest: "x" }, { idempotencyKey: "x" }, { expiresAt: new Date(+row.expiresAt + 1) }]) {
      expect(proposalHashOf({ ...f, ...change })).not.toBe(row.proposalHash);
    }
  });

  it("the validity window is the single named config value (default 10 minutes, invalid values ignored): a proposal expires that long after it is made", async () => {
    const { DEFAULT_STEP_UP_MAX_AGE_MINUTES, stepUpMaxAgeMs } = await import("@/lib/config");
    expect(DEFAULT_STEP_UP_MAX_AGE_MINUTES).toBe(10);
    const old = process.env.STEP_UP_MAX_AGE_MINUTES;
    try {
      delete process.env.STEP_UP_MAX_AGE_MINUTES;
      expect(stepUpMaxAgeMs()).toBe(10 * 60_000);
      process.env.STEP_UP_MAX_AGE_MINUTES = "2";
      expect(stepUpMaxAgeMs()).toBe(2 * 60_000);
      for (const bad of ["0", "-5", "abc", ""]) {
        process.env.STEP_UP_MAX_AGE_MINUTES = bad;
        expect(stepUpMaxAgeMs()).toBe(10 * 60_000);
      }
    } finally {
      if (old === undefined) delete process.env.STEP_UP_MAX_AGE_MINUTES; else process.env.STEP_UP_MAX_AGE_MINUTES = old;
    }
    const { first } = await approvedRefund();
    const expires = new Date(first.body.step_up.expires_at).getTime();
    expect(Math.abs(expires - (Date.now() + DEFAULT_STEP_UP_MAX_AGE_MINUTES * 60_000))).toBeLessThan(30_000);
  });

  it("the boundary is inclusive (kept from #41): exactly at the deadline still counts, a moment after does not", async () => {
    const { viewOf } = await import("@/lib/step-ups");
    const at = new Date("2026-01-01T12:00:00Z");
    const row = { status: "APPROVED" as const, expiresAt: at, reservationExpiresAt: null };
    expect(viewOf(row, at)).toBe("APPROVED");
    expect(viewOf(row, new Date(+at + 1))).toBe("EXPIRED");
    // The person approving exactly at the deadline works; a millisecond later does not.
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const a = await ask(token, sam.id, refundProposal());
    const b = await ask(token, sam.id, refundProposal());
    const deadline = new Date(a.body.step_up.expires_at);
    expect((await approve(a.body.step_up.user_code, sam.id, deadline)).ok).toBe(true);
    expect(await approve(b.body.step_up.user_code, sam.id, new Date(+new Date(b.body.step_up.expires_at) + 1))).toEqual({ ok: false, reason: "EXPIRED" });
  });
});

describe("one approval covers one proposed change", () => {
  it("changed content needs a new approval, even under the same key; the original approval is untouched", async () => {
    const { sam, token, proposal, code } = await approvedRefund();
    const changed = refundProposal(proposal.idempotency_key, { ...REFUND, account_number: "11112222" });
    const r = await ask(token, sam.id, changed);
    expect(r.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED", step_up: { state: "AWAITING_APPROVAL" } });
    expect(r.body.step_up.user_code).not.toBe(code);
    const rv = await reserve({ agent_token: token, principal_id: sam.id, proposal: changed });
    expect(rv.body.reserved).toBe(false);
    expect(rv.status).toBe(403);
    expect(await rowOf(code)).toMatchObject({ status: "APPROVED", reservationId: null });
  });

  it("a different key, capability or principal needs its own approval", async () => {
    const { sam, token, proposal } = await approvedRefund({ caps: ["change_refund_account", "change_address"] });
    expect((await ask(token, sam.id, refundProposal(randomUUID()))).body.step_up.state).toBe("AWAITING_APPROVAL");
    const addr = await ask(token, sam.id, { idempotency_key: proposal.idempotency_key, payload: ADDRESS }, "change_address");
    expect(addr.body).toMatchObject({ authorised: false, step_up: { state: "AWAITING_APPROVAL" } });
    // Another person, with their own agent permission, using the very same key and content.
    const lee = await newPrincipal();
    const { token: leeToken } = await authorise(lee.id, ["change_refund_account"]);
    expect((await ask(leeToken, lee.id, proposal)).body.step_up.state).toBe("AWAITING_APPROVAL");
    // ...and Lee cannot approve Sam's request, nor Sam Lee's.
    const samCode = (await ask(token, sam.id, refundProposal(randomUUID()))).body.step_up.user_code;
    expect(await approve(samCode, lee.id)).toEqual({ ok: false, reason: "NOT_FOUND" });
    // Sam's approval is not usable by an agent acting for Lee: Lee's mandate has no approved proposal.
    expect((await reserve({ agent_token: leeToken, principal_id: lee.id, proposal })).body.reserved).toBe(false);
  });

  it("content that differs only in formatting is the same proposal", async () => {
    const { sam, token } = await approvedRefund();
    const tidy = refundProposal(undefined, REFUND);
    const first = await ask(token, sam.id, tidy);
    await approve(first.body.step_up.user_code, sam.id);
    const spaced = { idempotency_key: tidy.idempotency_key, payload: { account_name: "  Sam   Taylor ", sort_code: "200000", account_number: "5577 9911" } };
    expect((await ask(token, sam.id, spaced)).body).toMatchObject({ authorised: true, step_up: { state: "APPROVED" } });
  });

  it("a declined proposal stays declined for that key and content: asking again opens nothing new", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const proposal = refundProposal();
    const first = await ask(token, sam.id, proposal);
    expect(await decline(first.body.step_up.user_code, sam.id)).toEqual({ ok: true });
    for (let i = 0; i < 3; i++) {
      const again = await ask(token, sam.id, proposal);
      expect(again.body).toMatchObject({ authorised: false, step_up: { state: "DECLINED" } });
      expect(again.body.step_up.user_code).toBeUndefined();
    }
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(1);
    expect(await approve(first.body.step_up.user_code, sam.id)).toMatchObject({ ok: false });
  });

  it("ten agents proposing the same change at once open exactly one request", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const proposal = refundProposal();
    const rs = await Promise.all(Array.from({ length: 10 }, () => ask(token, sam.id, proposal)));
    expect(new Set(rs.map((r) => r.body.step_up.user_code)).size).toBe(1);
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(1);
  });
});

describe("expiry", () => {
  it("an approval past its window cannot be reserved, and the check says so and opens a fresh request", async () => {
    const { sam, token, proposal, code } = await approvedRefund();
    await prisma.stepUp.update({ where: { userCode: code }, data: { expiresAt: past() } });
    const r = await ask(token, sam.id, proposal);
    expect(r.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED", step_up: { state: "EXPIRED" } });
    expect(r.body.step_up.user_code).not.toBe(code);
    expect((await rowOf(code)).status).toBe("EXPIRED");
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(false);
    // The fresh request can be approved, and then works.
    expect((await approve(r.body.step_up.user_code, sam.id)).ok).toBe(true);
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(true);
  });

  it("the window closing between a check and the reserve still refuses (the reserve is its own conditional step)", async () => {
    const { sam, token, proposal, code } = await approvedRefund();
    expect((await ask(token, sam.id, proposal)).body.authorised).toBe(true);
    await prisma.stepUp.update({ where: { userCode: code }, data: { expiresAt: past() } });
    const rv = await reserve({ agent_token: token, principal_id: sam.id, proposal });
    expect(rv.body.reserved).toBe(false);
    expect((await rowOf(code)).status).not.toBe("RESERVED");
  });

  it("an unapproved request cannot be approved after it expires", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const first = await ask(token, sam.id, refundProposal());
    const code = first.body.step_up.user_code;
    await prisma.stepUp.update({ where: { userCode: code }, data: { expiresAt: past() } });
    expect(await approve(code, sam.id)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("an in-flight reservation may finish after the window closes: completing is recorded, not refused", async () => {
    const { sam, token, proposal, code, row } = await approvedRefund();
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(true);
    await prisma.stepUp.update({ where: { userCode: code }, data: { expiresAt: past() } });
    expect((await markDone({ proposal_id: row.id, reference: "BA-LATE" })).body).toMatchObject({ state: "USED", duplicate: false });
  });

  it("an expired mandate cannot authorise a new operation", async () => {
    const { sam, token, proposal, authorisationId } = await approvedRefund();
    await prisma.authorisation.update({ where: { id: authorisationId }, data: { validUntil: past() } });
    expect((await ask(token, sam.id, proposal)).body).toMatchObject({ authorised: false, reason: "AUTHORISATION_EXPIRED" });
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body).toMatchObject({ reserved: false, reason: "AUTHORISATION_EXPIRED" });
  });
});

describe("revocation", () => {
  it("a revoked mandate can neither be asked about nor reserve an approval it was given; the approval stays unspent", async () => {
    const { sam, token, proposal, authorisationId, code } = await approvedRefund();
    await revokeAuthorisation(authorisationId, sam.id);
    expect((await ask(token, sam.id, proposal)).body).toMatchObject({ authorised: false, reason: "AUTHORISATION_REVOKED" });
    const rv = await reserve({ agent_token: token, principal_id: sam.id, proposal });
    expect(rv).toMatchObject({ status: 403, body: { reserved: false, reason: "AUTHORISATION_REVOKED" } });
    expect(await rowOf(code)).toMatchObject({ status: "APPROVED", usedAt: null, reservationId: null });
  });

  it("the person cannot approve a request once the mandate has been removed", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["change_refund_account"]);
    const first = await ask(token, sam.id, refundProposal());
    await revokeAuthorisation(authorisationId, sam.id);
    expect(await approve(first.body.step_up.user_code, sam.id)).toEqual({ ok: false, reason: "MANDATE_ENDED" });
  });

  it("revoking after the reservation does not undo a change already in flight: it can be recorded, and nothing new can start", async () => {
    const { sam, token, proposal, authorisationId, row } = await approvedRefund();
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(true);
    await revokeAuthorisation(authorisationId, sam.id);
    expect((await markDone({ proposal_id: row.id, reference: "BA-1" })).body.state).toBe("USED");
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(false);
  });
});

describe("concurrent redemption", () => {
  it("many racing reservations: exactly one wins, the rest are told it is in use and when to retry", async () => {
    const { sam, token, proposal, code } = await approvedRefund();
    const ids = Array.from({ length: 15 }, () => randomUUID());
    const rs = await Promise.all(ids.map((reservation_id) => reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id })));
    const winners = rs.filter((r) => r.body.reserved === true);
    expect(winners).toHaveLength(1);
    for (const r of rs.filter((r) => !r.body.reserved)) {
      expect(r).toMatchObject({ status: 409, body: { reason: "STEP_UP_IN_USE", state: "IN_PROGRESS" } });
      expect(r.body.retry_after_seconds).toBeGreaterThan(0);
      expect(r.retryAfter).toBeTruthy();
    }
    expect((await rowOf(code)).reservationId).toBe(winners[0].body.reservation_id);
  });

  it("re-delivering the same reservation (a lost reply) is recognised, not refused", async () => {
    const { sam, token, proposal } = await approvedRefund();
    const reservation_id = randomUUID();
    const a = await reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id });
    const b = await reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id });
    expect(a.body).toMatchObject({ reserved: true, duplicate: false });
    expect(b.body).toMatchObject({ reserved: true, duplicate: true, reservation_id });
  });

  it("two different approved changes are independent: both can be reserved", async () => {
    const { sam, token, proposal } = await approvedRefund();
    const other = refundProposal();
    const o = await ask(token, sam.id, other);
    await approve(o.body.step_up.user_code, sam.id);
    const rs = await Promise.all([reserve({ agent_token: token, principal_id: sam.id, proposal }), reserve({ agent_token: token, principal_id: sam.id, proposal: other })]);
    expect(rs.every((r) => r.body.reserved)).toBe(true);
  });
});

describe("crashes and duplicate callbacks", () => {
  it("a service that reserves and never reports back loses nothing: the lease lapses and the same change can be reserved again; the stale holder cannot disturb the new one", async () => {
    const { sam, token, proposal, code, row } = await approvedRefund();
    const crashed = randomUUID();
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id: crashed })).body.reserved).toBe(true);
    expect((await ask(token, sam.id, proposal)).body.step_up.state).toBe("IN_PROGRESS");
    await prisma.stepUp.update({ where: { userCode: code }, data: { reservationExpiresAt: past() } });
    expect((await ask(token, sam.id, proposal)).body).toMatchObject({ authorised: true, step_up: { state: "APPROVED" } });
    const retry = randomUUID();
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id: retry })).body.reserved).toBe(true);
    // The crashed holder wakes up and tries to give the approval back: it no longer holds it.
    expect((await giveBack({ proposal_id: row.id, reservation_id: crashed })).body.released).toBe(false);
    expect(await rowOf(code)).toMatchObject({ status: "RESERVED", reservationId: retry });
  });

  it("releasing hands the approval back, and it can be reserved again", async () => {
    const { sam, token, proposal, code, row } = await approvedRefund();
    const id = randomUUID();
    await reserve({ agent_token: token, principal_id: sam.id, proposal, reservation_id: id });
    expect((await giveBack({ proposal_id: row.id, reservation_id: id })).body.released).toBe(true);
    expect((await giveBack({ proposal_id: row.id, reservation_id: id })).body.released).toBe(false); // duplicate callback
    expect((await rowOf(code)).status).toBe("APPROVED");
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body.reserved).toBe(true);
  });

  it("completing is idempotent; afterwards the approval is spent: it cannot be reserved, a check reports REDEEMED, and the key is taken", async () => {
    const { sam, token, proposal, code, row } = await approvedRefund();
    await reserve({ agent_token: token, principal_id: sam.id, proposal });
    expect((await markDone({ proposal_id: row.id, reference: "BA-1" })).body).toEqual({ state: "USED", duplicate: false });
    expect((await markDone({ proposal_id: row.id, reference: "BA-1" })).body).toEqual({ state: "USED", duplicate: true });
    expect(await rowOf(code)).toMatchObject({ status: "USED", usedReference: "BA-1" });
    expect((await reserve({ agent_token: token, principal_id: sam.id, proposal })).body).toMatchObject({ reserved: false, reason: "STEP_UP_ALREADY_USED" });
    expect((await ask(token, sam.id, proposal)).body).toMatchObject({ authorised: true, step_up: { state: "REDEEMED" } });
    const other = await ask(token, sam.id, refundProposal(proposal.idempotency_key, { ...REFUND, account_number: "11112222" }));
    expect(other.body).toMatchObject({ authorised: false, step_up: { state: "KEY_USED_FOR_OTHER_TRANSACTION" } });
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(1);
  });

  it("a service that crashed after making the change can still report it later, even after the lease lapsed", async () => {
    const { sam, token, proposal, code, row } = await approvedRefund();
    await reserve({ agent_token: token, principal_id: sam.id, proposal });
    await prisma.stepUp.update({ where: { userCode: code }, data: { reservationExpiresAt: past() } });
    expect((await ask(token, sam.id, proposal)).body.step_up.state).toBe("APPROVED"); // looks unspent...
    expect((await markDone({ proposal_id: row.id, reference: "BA-2" })).body.state).toBe("USED"); // ...until the service catches up
  });

  it("an approval the person never gave cannot be reported as used, and only its own service can report it", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const pending = await ask(token, sam.id, refundProposal());
    const row = await rowOf(pending.body.step_up.user_code);
    expect((await markDone({ proposal_id: row.id })).status).toBe(409);
    expect((await markDone({ proposal_id: randomUUID() })).status).toBe(404);
    const wrongKey = await fetch(`${DELEGATE}/api/step-ups/complete`, { method: "POST", headers: { "content-type": "application/json", "x-service-key": "nope" }, body: JSON.stringify({ service: SERVICE, proposal_id: row.id }) });
    expect(wrongKey.status).toBe(401);
    expect((await rowOf(row.userCode)).status).toBe("PENDING");
  });
});

// ── Through HMRC, over HTTP ─────────────────────────────────────────────────

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;
async function change(path: "refund-account" | "address", o: { token: string; principalId: string; key?: string | null; body?: unknown }) {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${o.token}`, "x-principal-id": o.principalId, "x-forwarded-for": ip() };
  if (o.key !== null) headers["idempotency-key"] = o.key ?? randomUUID();
  const res = await fetch(`${HMRC}/api/${path}`, { method: "POST", headers, body: JSON.stringify(o.body ?? REFUND) });
  return { status: res.status, body: (await res.json()) as any, retryAfter: res.headers.get("retry-after") };
}
const hmrcEvents = async (since: Date) => ((await (await fetch(`${HMRC}/ops/events?since=${since.toISOString()}`)).json()) as any).events as { outcome: string; reason: string | null; delegateCheckId: string | null }[];

describe("HMRC: from request to committed change", () => {
  it("ask, approve, make the change once, answer a retry from the stored result without spending another approval", async () => {
    const since = new Date();
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account", "change_address"]);
    const key = randomUUID();

    const asked = await change("refund-account", { token, principalId: sam.id, key });
    expect(asked.status).toBe(403);
    expect(asked.body).toMatchObject({ decision: "DENY", reason: "STEP_UP_REQUIRED", step_up: { state: "AWAITING_APPROVAL" } });
    expect(asked.body.step_up.details).toContainEqual({ label: "Account number", value: "ending 9911" });
    const code = asked.body.step_up.user_code;
    // Asking again is still just asking.
    expect((await change("refund-account", { token, principalId: sam.id, key })).body.step_up.user_code).toBe(code);
    expect((await approve(code, sam.id)).ok).toBe(true);
    expect(await rowOf(code)).toMatchObject({ status: "APPROVED" });

    const done = await change("refund-account", { token, principalId: sam.id, key });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ decision: "ALLOW", result: { updated: true } });
    expect(done.body.idempotent_replay).toBeUndefined();
    const ref = done.body.result.change_reference as string;
    expect(await rowOf(code)).toMatchObject({ status: "USED", usedReference: ref });

    // Retry of the committed operation: same result, nothing new, no second approval.
    const retry = await change("refund-account", { token, principalId: sam.id, key });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ decision: "ALLOW", idempotent_replay: true, result: { change_reference: ref } });
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(1);

    // A different key with the same content is a new transaction: it needs a new approval.
    const again = await change("refund-account", { token, principalId: sam.id });
    expect(again.body).toMatchObject({ reason: "STEP_UP_REQUIRED", step_up: { state: "AWAITING_APPROVAL" } });
    // The same key with changed content is refused outright and nothing is made.
    const swapped = await change("refund-account", { token, principalId: sam.id, key, body: { ...REFUND, account_number: "11112222" } });
    expect(swapped).toMatchObject({ status: 409, body: { reason: "IDEMPOTENCY_KEY_REUSED" } });

    // Every attempt is in both logs.
    const events = await hmrcEvents(since);
    for (const r of [asked, done, retry, again, swapped]) {
      expect(events.some((e) => e.delegateCheckId === r.body.delegate_check_id)).toBe(true);
      expect(await prisma.activityEvent.findUnique({ where: { id: r.body.delegate_check_id } })).toBeTruthy();
    }
    expect(events.filter((e) => e.outcome === "ALLOWED" && [done.body.delegate_check_id, retry.body.delegate_check_id].includes(e.delegateCheckId))).toHaveLength(2);
  });

  it("approved, but HMRC's own rules turn the change down: the approval is not spent", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    // HMRC allows one refund-account change per person per 30 days. Use it.
    const k1 = randomUUID();
    const c1 = await change("refund-account", { token, principalId: sam.id, key: k1 });
    await approve(c1.body.step_up.user_code, sam.id);
    expect((await change("refund-account", { token, principalId: sam.id, key: k1 })).status).toBe(200);

    // A second, different change is approved by the person, and HMRC refuses it on its own rule.
    const k2 = randomUUID();
    const second = { ...REFUND, account_number: "11112222" };
    const c2 = await change("refund-account", { token, principalId: sam.id, key: k2, body: second });
    expect(c2.status).toBe(403);
    expect((await approve(c2.body.step_up.user_code, sam.id)).ok).toBe(true);
    const refused = await change("refund-account", { token, principalId: sam.id, key: k2, body: second });
    expect(refused).toMatchObject({ status: 409, body: { decision: "DENY", kind: "BUSINESS_REFUSAL", reason: "CAPACITY_EXCEEDED", rule: "refund_account_changes_per_30_days" } });
    expect(await rowOf(c2.body.step_up.user_code)).toMatchObject({ status: "APPROVED", reservationId: null, usedAt: null });
    // The refusal was recorded against the check as a failure to go through.
    const outcome = await prisma.transactionOutcome.findFirst({ where: { checkId: refused.body.delegate_check_id } });
    expect(outcome).toMatchObject({ status: "FAILED", reason: "CAPACITY_EXCEEDED" });
  });

  it("racing retries of one approved change: exactly one change is made, every response is the same change", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const key = randomUUID();
    const first = await change("refund-account", { token, principalId: sam.id, key });
    await approve(first.body.step_up.user_code, sam.id);
    const rs = await Promise.all(Array.from({ length: 8 }, () => change("refund-account", { token, principalId: sam.id, key })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => r.body.result.change_reference)).size).toBe(1);
    expect(rs.filter((r) => !r.body.idempotent_replay)).toHaveLength(1);
    expect(await rowOf(first.body.step_up.user_code)).toMatchObject({ status: "USED", usedReference: rs[0].body.result.change_reference });
  });

  it("one approval cannot admit two different changes racing each other", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account"]);
    const key = randomUUID();
    const first = await change("refund-account", { token, principalId: sam.id, key });
    await approve(first.body.step_up.user_code, sam.id);
    const other = { ...REFUND, account_number: "11112222" };
    const rs = await Promise.all([
      ...Array.from({ length: 4 }, () => change("refund-account", { token, principalId: sam.id, key })),
      ...Array.from({ length: 4 }, () => change("refund-account", { token, principalId: sam.id, key: randomUUID(), body: other })),
    ]);
    const made = new Set(rs.filter((r) => r.status === 200).map((r) => r.body.result.change_reference));
    expect(made.size).toBe(1);
    expect(rs.slice(4).every((r) => r.status !== 200)).toBe(true); // none of the different-content requests got through
  });

  it("asks for an Idempotency-Key and well-formed details before it will put anything to the person", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["change_refund_account", "change_address"]);
    const noKey = await change("refund-account", { token, principalId: sam.id, key: null });
    expect(noKey).toMatchObject({ status: 400, body: { reason: "IDEMPOTENCY_KEY_REQUIRED" } });
    const bad = await change("refund-account", { token, principalId: sam.id, body: {} });
    expect(bad).toMatchObject({ status: 400, body: { reason: "INVALID_REQUEST" } });
    expect(bad.body.message).toContain("account_number is required");
    const spaced = await change("address", { token, principalId: sam.id, key: "has space", body: ADDRESS });
    expect(spaced).toMatchObject({ status: 400, body: { reason: "INVALID_IDEMPOTENCY_KEY" } });
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(0);
  });

  it("expired and revoked approvals are refused at HMRC with the reason", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["change_refund_account"]);
    const key = randomUUID();
    const asked = await change("refund-account", { token, principalId: sam.id, key });
    await approve(asked.body.step_up.user_code, sam.id);
    await prisma.stepUp.update({ where: { userCode: asked.body.step_up.user_code }, data: { expiresAt: past() } });
    const expired = await change("refund-account", { token, principalId: sam.id, key });
    expect(expired).toMatchObject({ status: 403, body: { reason: "STEP_UP_REQUIRED", step_up: { state: "EXPIRED" } } });

    await revokeAuthorisation(authorisationId, sam.id);
    const revoked = await change("refund-account", { token, principalId: sam.id, key });
    expect(revoked).toMatchObject({ status: 403, body: { reason: "AUTHORISATION_REVOKED" } });
  });

  it("a person is not asked to approve anything for a capability they never gave the agent", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["view_tax_code"]);
    const r = await change("refund-account", { token, principalId: sam.id });
    expect(r).toMatchObject({ status: 403, body: { reason: "PERMISSION_MISSING" } });
    expect(await prisma.stepUp.count({ where: { principalId: sam.id } })).toBe(0);
  });
});
