import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, check } from "./helpers";
import { stepUpFreshSince } from "@/lib/authority";
import { DEFAULT_STEP_UP_MAX_AGE_MINUTES, stepUpMaxAgeMs } from "@/lib/config";

afterAll(() => prisma.$disconnect());

// Issue #38: a step-up approval is valid for the next use of that capability, for a
// limited time after approvedAt. (Transaction binding is #19; single use under
// concurrency is #37.) The running server uses the default maximum age.

const MAX = DEFAULT_STEP_UP_MAX_AGE_MINUTES * 60_000;
const CAP = "change_refund_account";

async function pendingApproval(approvedAgo: number) {
  const sam = await newPrincipal();
  const { token } = await authorise(sam.id, [CAP]);
  const first = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
  expect(first.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED" });
  const code = first.body.step_up.user_code as string;
  await prisma.stepUp.update({ where: { userCode: code }, data: { status: "APPROVED", approvedAt: new Date(Date.now() - approvedAgo) } });
  return { sam, token, code };
}

describe("step-up approval freshness", () => {
  it("the maximum age is configurable, defaults to 10 minutes, and ignores invalid values", () => {
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
  });

  it("the freshness cutoff is exactly the maximum age before now (an approval at that age still counts)", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(stepUpFreshSince(now, 600_000).toISOString()).toBe("2026-01-01T11:50:00.000Z");
  });

  it("an approval just inside the window authorises, once", async () => {
    const { sam, token } = await pendingApproval(MAX - 30_000);
    const ok = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
    expect(ok.body.authorised).toBe(true);
    const again = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
    expect(again.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED" });
  });

  it("an approval just outside the window is refused as STEP_UP_REQUIRED with a new approval code, and is not spent", async () => {
    const { sam, token, code } = await pendingApproval(MAX + 30_000);
    const res = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
    expect(res.body).toMatchObject({ authorised: false, reason: "STEP_UP_REQUIRED" });
    expect(res.body.step_up.user_code).not.toBe(code);
    expect((await prisma.stepUp.findUniqueOrThrow({ where: { userCode: code } })).status).toBe("APPROVED");
    const event = await prisma.activityEvent.findUniqueOrThrow({ where: { id: res.body.check_id } });
    expect(event).toMatchObject({ decision: "DENY", reason: "STEP_UP_REQUIRED" });
  });

  it("after a stale approval, a fresh approval for the same mandate and capability works", async () => {
    const { sam, token } = await pendingApproval(MAX + 60_000);
    const stale = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
    expect(stale.body.reason).toBe("STEP_UP_REQUIRED");
    await prisma.stepUp.update({ where: { userCode: stale.body.step_up.user_code }, data: { status: "APPROVED", approvedAt: new Date() } });
    expect((await check({ agent_token: token, principal_id: sam.id, capability: CAP })).body.authorised).toBe(true);
  });
});
