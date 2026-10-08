import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, newPrincipal, authorise, DELEGATE, HMRC, SERVICE, type Cap } from "./helpers";

afterAll(() => prisma.$disconnect());

// Idempotent, atomic submissions as agents meet them: over HTTP, through GOV.UK
// Delegate's relationship check and HMRC's API. The database-level tests (rollback,
// failure injection, the human forms) are in apps/hmrc/tests/idempotency.test.ts.

const CAPS: Cap[] = ["claim_job_expenses", "view_claim_status", "respond_to_query"];
const DEMO_KEY = process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key";
const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;

async function api(method: "GET" | "POST", path: string, token: string, principalId: string, body?: unknown, key?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip(), authorization: `Bearer ${token}`, "x-principal-id": principalId };
  if (key) headers["idempotency-key"] = key;
  const res = await fetch(`${HMRC}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, replayHeader: res.headers.get("idempotent-replayed") };
}

const claims = async (token: string, principalId: string) => (await api("GET", "/api/claims", token, principalId)).body.result.claims as { reference: string; open_queries: { query_id: string }[] }[];

async function subAgent(token: string, principalId: string, label: string) {
  const res = await fetch(`${DELEGATE}/api/delegations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ principal_id: principalId, service: SERVICE, capabilities: CAPS, label }),
  });
  return (await res.json()).token as string;
}

beforeAll(async () => {
  // In dev, Next compiles a route on its first request: warm each one up.
  const p = await newPrincipal();
  const { token } = await authorise(p.id, CAPS);
  await api("POST", "/api/job-expenses", token, p.id, {}, randomUUID());
  await api("GET", "/api/claims", token, p.id);
  await api("POST", "/api/claims/respond", token, p.id, { query_id: "x", answer: "x" }, randomUUID());
});

describe("claim_job_expenses: Idempotency-Key", () => {
  it("100 concurrent identical retries create exactly one claim; every response references it", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const key = randomUUID();
    const res = await Promise.all(Array.from({ length: 100 }, () => api("POST", "/api/job-expenses", token, p.id, { evidence: "payslip.pdf" }, key)));
    expect(res.map((r) => r.status)).toEqual(Array(100).fill(200));
    expect(new Set(res.map((r) => r.body.result.claim_reference)).size).toBe(1);
    expect(res.filter((r) => r.body.idempotent_replay)).toHaveLength(99);
    expect(res.filter((r) => r.replayHeader === "true")).toHaveLength(99);
    const mine = await claims(token, p.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].reference).toBe(res[0].body.result.claim_reference);
    expect(mine[0].open_queries).toHaveLength(1);
  }, 120_000);

  it("a lost response is retrievable: the same key returns the same reference, with nothing new made", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const key = randomUUID();
    const first = await api("POST", "/api/job-expenses", token, p.id, {}, key); // imagine the client never saw this
    const retry = await api("POST", "/api/job-expenses", token, p.id, {}, key);
    expect(retry.status).toBe(200);
    expect(retry.body.result).toEqual(first.body.result);
    expect(retry.body.idempotent_replay).toBe(true);
    expect(await claims(token, p.id)).toHaveLength(1);
  });

  it("two agents racing for one person with different keys make one claim; the loser is told why", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const [a, b] = [await subAgent(token, p.id, "agent A"), await subAgent(token, p.id, "agent B")];
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => api("POST", "/api/job-expenses", i % 2 ? a : b, p.id, { evidence: "payslip.pdf" }, randomUUID())));
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect(new Set(res.filter((r) => r.status !== 200).map((r) => r.body.reason))).toEqual(new Set(["DUPLICATE_SUBMISSION"]));
    expect(await claims(token, p.id)).toHaveLength(1);
  });

  it("two agents using the same key for the same person share one outcome", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const [a, b] = [await subAgent(token, p.id, "agent A"), await subAgent(token, p.id, "agent B")];
    const key = randomUUID();
    const res = await Promise.all([a, b, a, b, a, b].map((t) => api("POST", "/api/job-expenses", t, p.id, {}, key)));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(new Set(res.map((r) => r.body.result.claim_reference)).size).toBe(1);
    expect(await claims(token, p.id)).toHaveLength(1);
  });

  it("the same key with different content is 409 and changes nothing", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const key = randomUUID();
    const first = await api("POST", "/api/job-expenses", token, p.id, { evidence: "one.pdf" }, key);
    const clash = await api("POST", "/api/job-expenses", token, p.id, { evidence: "two.pdf" }, key);
    expect(clash.status).toBe(409);
    expect(clash.body.reason).toBe("IDEMPOTENCY_KEY_REUSED");
    const same = await api("POST", "/api/job-expenses", token, p.id, { evidence: "one.pdf" }, key);
    expect(same.body.result.claim_reference).toBe(first.body.result.claim_reference);
    expect(await claims(token, p.id)).toHaveLength(1);
  });

  it("a different key for an equivalent claim is not a retry: HMRC's duplicate rules refuse it", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    expect((await api("POST", "/api/job-expenses", token, p.id, { evidence: "e.pdf" }, randomUUID())).status).toBe(200);
    const second = await api("POST", "/api/job-expenses", token, p.id, { evidence: "e.pdf" }, randomUUID());
    expect(second.status).toBe(409);
    expect(second.body.reason).toBe("DUPLICATE_SUBMISSION");
  });

  it("a genuine amendment (new evidence, new key) is still allowed", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    await api("POST", "/api/job-expenses", token, p.id, { evidence: "e.pdf" }, randomUUID());
    const amend = await api("POST", "/api/job-expenses", token, p.id, { evidence: "new-evidence.pdf" }, randomUUID());
    expect(amend.status).toBe(200);
    expect(await claims(token, p.id)).toHaveLength(2);
  });

  it("requests without a key behave exactly as before", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const first = await api("POST", "/api/job-expenses", token, p.id, {});
    expect(first.status).toBe(200);
    expect(first.body.idempotent_replay).toBeUndefined();
    expect((await api("POST", "/api/job-expenses", token, p.id, {})).body.reason).toBe("NEW_EVIDENCE_REQUIRED");
  });

  it("a malformed key is a 400 and does nothing", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    const bad = await api("POST", "/api/job-expenses", token, p.id, {}, "has spaces");
    expect(bad.status).toBe(400);
    expect(bad.body.reason).toBe("INVALID_IDEMPOTENCY_KEY");
    expect(await claims(token, p.id)).toHaveLength(0);
  });
});

describe("respond_to_query: Idempotency-Key", () => {
  it("50 concurrent identical answers record one answer and one receipt; a different answer under the key is 409", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, CAPS);
    await api("POST", "/api/job-expenses", token, p.id, {});
    const query_id = (await claims(token, p.id))[0].open_queries[0].query_id;
    const key = randomUUID();
    const body = { query_id, answer: "My employer's policy applied from 1 April 2026.", confirmed_by_person: true };
    const res = await Promise.all(Array.from({ length: 50 }, () => api("POST", "/api/claims/respond", token, p.id, body, key)));
    expect(res.map((r) => r.status)).toEqual(Array(50).fill(200));
    expect(new Set(res.map((r) => r.body.result.receipt_id)).size).toBe(1);
    expect(res.filter((r) => r.body.idempotent_replay)).toHaveLength(49);
    const clash = await api("POST", "/api/claims/respond", token, p.id, { ...body, answer: "Something else" }, key);
    expect(clash.status).toBe(409);
    expect((await claims(token, p.id))[0].open_queries).toHaveLength(0);
  }, 120_000);
});

describe("a signed-in person on the website", () => {
  it("shares the protection: the API with a key, from a person's session", async () => {
    const p = await newPrincipal();
    const subject = p.oneLoginSubjectId;
    const { cookie } = await (await fetch(`${HMRC}/api/demo/session`, { method: "POST", headers: { "content-type": "application/json", "x-demo-key": DEMO_KEY }, body: JSON.stringify({ subject }) })).json();
    const key = randomUUID();
    const res = await Promise.all(Array.from({ length: 20 }, () =>
      fetch(`${HMRC}/api/job-expenses`, { method: "POST", headers: { cookie, "content-type": "application/json", "idempotency-key": key }, body: "{}" }).then(async (r) => ({ status: r.status, body: await r.json() }))));
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(new Set(res.map((r) => r.body.result.claim_reference)).size).toBe(1);
    expect(res.filter((r) => r.body.lane === "AUTHENTICATED_HUMAN")).toHaveLength(20);
  });
});
