import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, check, DELEGATE, HMRC, HMRC_SERVICE_KEY, SERVICE } from "./helpers";

afterAll(() => prisma.$disconnect());

// A permission check is not a result. HMRC reports what happened after Delegate
// said yes, and Delegate keeps both, tied together by check_id.

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;

async function hmrc(method: "GET" | "POST", path: string, token: string, principalId: string, body?: unknown) {
  const res = await fetch(`${HMRC}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": ip(), authorization: `Bearer ${token}`, "x-principal-id": principalId },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

const report = (body: Record<string, unknown>, key: string | null = HMRC_SERVICE_KEY) =>
  fetch(`${DELEGATE}/api/outcomes`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-service-key": key } : {}) },
    body: JSON.stringify({ service: SERVICE, ...body }),
  });

const outcomesFor = (principalId: string) => prisma.transactionOutcome.findMany({ where: { principalId }, orderBy: { createdAt: "asc" } });

describe("outcomes reported back to Delegate", () => {
  it("a successful submission is recorded as COMPLETED with HMRC's reference, linked to the check", async () => {
    const p = await newPrincipal();
    const { token, authorisationId } = await authorise(p.id, ["claim_job_expenses"]);
    const r = await hmrc("POST", "/api/job-expenses", token, p.id);
    expect(r.status).toBe(200);
    const [o] = await outcomesFor(p.id);
    expect(o).toMatchObject({
      checkId: r.body.delegate_check_id, status: "COMPLETED", capability: "claim_job_expenses",
      reference: r.body.result.claim_reference, mandateId: authorisationId, principalId: p.id,
    });
    expect(o.delegationId).toBeTruthy();
  });

  it("a check that said ALLOW but whose HMRC operation was refused is FAILED, never COMPLETED", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["claim_job_expenses", "view_claim_status", "respond_to_query"]);
    await hmrc("POST", "/api/job-expenses", token, p.id);
    const claim = (await hmrc("GET", "/api/claims", token, p.id)).body.result.claims[0];
    const query_id = claim.open_queries[0].query_id;
    const answer = "Northwind requires everyone in my team to work from home, from 1 April 2026.";
    expect((await hmrc("POST", "/api/claims/respond", token, p.id, { query_id, answer })).status).toBe(200);
    const again = await hmrc("POST", "/api/claims/respond", token, p.id, { query_id, answer });
    expect(again.status).toBe(409);

    const failed = (await outcomesFor(p.id)).find((o) => o.checkId === again.body.delegate_check_id);
    expect(failed).toMatchObject({ status: "FAILED", reason: "DUPLICATE_SUBMISSION", capability: "respond_to_query" });
    // The check itself still says ALLOW: the original event is untouched.
    expect((await prisma.activityEvent.findUnique({ where: { id: again.body.delegate_check_id } }))?.decision).toBe("ALLOW");
  });

  it("repeat delivery is idempotent and keeps the original event", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const c = await check({ agent_token: token, principal_id: p.id });
    expect(c.body.authorised).toBe(true);

    const first = await report({ check_id: c.body.check_id, status: "SUBMITTED", reference: "REF-1" });
    expect(first.status).toBe(201);
    const second = await report({ check_id: c.body.check_id, status: "SUBMITTED", reference: "CHANGED" });
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);
    // A different outcome for the same check adds to the history.
    expect((await report({ check_id: c.body.check_id, status: "FAILED", reason: "HANDLER_ERROR" })).status).toBe(201);

    const rows = await outcomesFor(p.id);
    expect(rows.map((r) => r.status)).toEqual(["SUBMITTED", "FAILED"]);
    expect(rows[0].reference).toBe("REF-1");
  });

  it("rejects bad service keys, unknown statuses, unknown checks and DENY checks", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code"]);
    const allowed = await check({ agent_token: token, principal_id: p.id });
    const denied = await check({ agent_token: token, principal_id: p.id, capability: "change_address" });
    expect(denied.body.authorised).toBe(false);

    expect((await report({ check_id: allowed.body.check_id, status: "COMPLETED" }, "wrong-key")).status).toBe(401);
    expect((await report({ check_id: allowed.body.check_id, status: "COMPLETED" }, null)).status).toBe(401);
    expect((await report({ check_id: allowed.body.check_id, status: "ALLOW" })).status).toBe(400);
    expect((await report({ check_id: "no-such-check", status: "COMPLETED" })).status).toBe(404);
    expect((await report({ check_id: denied.body.check_id, status: "COMPLETED" })).status).toBe(404);
    expect(await outcomesFor(p.id)).toHaveLength(0);
  });

  it("outcomes belong to the person the check was for, whatever the service claims", async () => {
    const a = await newPrincipal();
    const b = await newPrincipal();
    const { token } = await authorise(a.id, ["view_tax_code"]);
    const c = await check({ agent_token: token, principal_id: a.id });
    const res = await report({ check_id: c.body.check_id, status: "COMPLETED", principal_id: b.id, mandate_id: "other" });
    expect(res.status).toBe(201);
    expect(await outcomesFor(b.id)).toHaveLength(0);
    expect(await outcomesFor(a.id)).toHaveLength(1);
  });
});
