import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, check } from "./helpers";

afterAll(() => prisma.$disconnect());

const CAP = "change_refund_account";

describe("step-up approval is single-use under concurrency", () => {
  it("N simultaneous checks against one approval: exactly one ALLOW, the rest STEP_UP_REQUIRED", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, [CAP]);
    const first = await check({ agent_token: token, principal_id: sam.id, capability: CAP });
    expect(first.body.reason).toBe("STEP_UP_REQUIRED");
    await prisma.stepUp.update({ where: { userCode: first.body.step_up.user_code }, data: { status: "APPROVED", approvedAt: new Date() } });

    const N = 12;
    const results = await Promise.all(Array.from({ length: N }, () => check({ agent_token: token, principal_id: sam.id, capability: CAP })));

    expect(results.filter((r) => r.body.authorised === true)).toHaveLength(1);
    const refused = results.filter((r) => r.body.authorised === false);
    expect(refused).toHaveLength(N - 1);
    for (const r of refused) expect(r.body.reason).toBe("STEP_UP_REQUIRED");

    const used = await prisma.stepUp.count({ where: { mandateId: authorisationId, capability: CAP, status: "USED" } });
    expect(used).toBe(1);
    expect(await prisma.stepUp.count({ where: { mandateId: authorisationId, capability: CAP, status: "APPROVED" } })).toBe(0);
  });
});
