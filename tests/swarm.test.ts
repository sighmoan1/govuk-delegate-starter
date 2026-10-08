import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma, newPrincipal, authorise, DELEGATE, HMRC, SERVICE } from "./helpers";

afterAll(() => prisma.$disconnect());

// Can a swarm beat the system? The same workload, run four ways, through the
// real HMRC API and GOV.UK Delegate. HMRC's business limits belong to the person.
//
//   A   1 person × 1 agent × N actions
//   B   1 person × N sub-agents × 1 action each
//   B′  1 person × N undetected sessions (no agent identity at all)
//   C   N people × 1 agent × 1 action each

const N = 10;
const DEMO_KEY = process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key";

type Outcome = { status: number; reason: string | null };

async function hmrc(path: string, method: "GET" | "POST", headers: Record<string, string>, body?: unknown): Promise<Outcome> {
  const res = await fetch(`${HMRC}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let reason: string | null = null;
  try { reason = JSON.parse(text).reason ?? null; } catch {}
  return { status: res.status, reason };
}

const claim = (h: Record<string, string>) => hmrc("/api/job-expenses", "POST", h, {});
const view = (h: Record<string, string>) => hmrc("/api/tax-code", "GET", h);

function tally(results: Outcome[]) {
  const t: Record<string, number> = {};
  for (const r of results) {
    const k = r.status === 200 ? "accepted" : r.reason ?? String(r.status);
    t[k] = (t[k] ?? 0) + 1;
  }
  return t;
}

async function subAgents(token: string, principalId: string, n: number) {
  return Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const res = await fetch(`${DELEGATE}/api/delegations`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ principal_id: principalId, service: SERVICE, capabilities: ["view_tax_code", "claim_job_expenses"], label: `worker ${i}` }),
      });
      return (await res.json()).token as string;
    }),
  );
}

async function sessionCookie(subject: string) {
  const res = await fetch(`${HMRC}/api/demo/session`, { method: "POST", headers: { "content-type": "application/json", "x-demo-key": DEMO_KEY }, body: JSON.stringify({ subject }) });
  return (await res.json()).cookie as string;
}

describe("Scenario 4: can a swarm beat the system?", () => {
  // In dev, Next compiles a route on its first request; warm each route up
  // serially so the concurrent bursts below measure the rules, not the compiler.
  beforeAll(async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["view_tax_code", "claim_job_expenses"]);
    await subAgents(token, p.id, 1);
    await sessionCookie(p.oneLoginSubjectId);
    await view({ authorization: `Bearer ${token}`, "x-principal-id": p.id });
    await claim({ authorization: `Bearer ${token}`, "x-principal-id": p.id });
  });

  it(`claims: A, B and B′ each get exactly one claim through; C gets ${N}`, async () => {
    // A
    const a = await newPrincipal();
    const { token: ta } = await authorise(a.id, ["view_tax_code", "claim_job_expenses"]);
    const A = await Promise.all(Array.from({ length: N }, () => claim({ authorization: `Bearer ${ta}`, "x-principal-id": a.id })));

    // B
    const b = await newPrincipal();
    const { token: tb } = await authorise(b.id, ["view_tax_code", "claim_job_expenses"]);
    const kids = await subAgents(tb, b.id, N);
    const B = await Promise.all(kids.map((t) => claim({ authorization: `Bearer ${t}`, "x-principal-id": b.id })));

    // B′: no agent identity at all — the person's own session, cloned
    const bp = await newPrincipal();
    const cookies = await Promise.all(Array.from({ length: N }, () => sessionCookie(bp.oneLoginSubjectId)));
    const Bp = await Promise.all(cookies.map((c) => claim({ cookie: c })));

    // C: N separately authorised people
    const people = await Promise.all(Array.from({ length: N }, () => newPrincipal()));
    const C = await Promise.all(
      people.map(async (p) => {
        const { token } = await authorise(p.id, ["view_tax_code", "claim_job_expenses"]);
        return claim({ authorization: `Bearer ${token}`, "x-principal-id": p.id });
      }),
    );

    expect(tally(A)).toEqual({ accepted: 1, NEW_EVIDENCE_REQUIRED: N - 1 });
    expect(tally(B)).toEqual(tally(A));
    expect(tally(Bp)).toEqual(tally(A));
    expect(tally(C)).toEqual({ accepted: N });
  });

  it("tax-code views: the person's hourly limit holds across agents, sub-agents and hidden sessions", async () => {
    const LIMIT = 60;
    const OVER = 15;
    const a = await newPrincipal();
    const { token: ta } = await authorise(a.id, ["view_tax_code"]);
    const A = await Promise.all(Array.from({ length: LIMIT + OVER }, () => view({ authorization: `Bearer ${ta}`, "x-principal-id": a.id })));

    const b = await newPrincipal();
    const { token: tb } = await authorise(b.id, ["view_tax_code", "claim_job_expenses"]);
    const kids = await subAgents(tb, b.id, LIMIT + OVER);
    const B = await Promise.all(kids.map((t) => view({ authorization: `Bearer ${t}`, "x-principal-id": b.id })));

    const bp = await newPrincipal();
    const cookie = await sessionCookie(bp.oneLoginSubjectId);
    const Bp = await Promise.all(Array.from({ length: LIMIT + OVER }, () => view({ cookie })));

    for (const arm of [A, B, Bp]) expect(tally(arm)).toEqual({ accepted: LIMIT, RATE_LIMITED: OVER });
  });

  it("more claims need materially new evidence; the same evidence twice is a duplicate; open cases are capped", async () => {
    const sam = await newPrincipal();
    const { token } = await authorise(sam.id, ["claim_job_expenses"]);
    const h = { authorization: `Bearer ${token}`, "x-principal-id": sam.id };
    expect((await hmrc("/api/job-expenses", "POST", h, {})).status).toBe(200);
    expect((await hmrc("/api/job-expenses", "POST", h, {})).reason).toBe("NEW_EVIDENCE_REQUIRED");
    expect((await hmrc("/api/job-expenses", "POST", h, { evidence: "Employer letter, March" })).status).toBe(200);
    expect((await hmrc("/api/job-expenses", "POST", h, { evidence: "employer letter, march " })).reason).toBe("DUPLICATE_SUBMISSION");
    expect((await hmrc("/api/job-expenses", "POST", h, { evidence: "Home office electricity bill" })).status).toBe(200);
    const fourth = await hmrc("/api/job-expenses", "POST", h, { evidence: "Yet another document" });
    expect(fourth).toEqual({ status: 409, reason: "CAPACITY_EXCEEDED" }); // a business refusal (provisional open-case limit), not a throttle
  });

  it("identity assurance does not change HMRC's limits: an unregistered, declared or verified agent all spend the same person's allowance", async () => {
    const sam = await newPrincipal();
    const { token, authorisationId } = await authorise(sam.id, ["view_tax_code"]);
    // Make the root delegation 'VERIFIED' halfway through: HMRC's shared allowance carries on.
    const first = await Promise.all(Array.from({ length: 30 }, () => view({ authorization: `Bearer ${token}`, "x-principal-id": sam.id })));
    await prisma.delegation.updateMany({ where: { mandateId: authorisationId }, data: { assurance: "VERIFIED" } });
    const second = await Promise.all(Array.from({ length: 40 }, () => view({ authorization: `Bearer ${token}`, "x-principal-id": sam.id })));
    expect(tally([...first, ...second])).toEqual({ accepted: 60, RATE_LIMITED: 10 });
  });
});
