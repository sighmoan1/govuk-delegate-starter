import { describe, it, expect, afterAll } from "vitest";
import { prisma, newPrincipal, authorise, HMRC, type Cap } from "./helpers";

afterAll(() => prisma.$disconnect());

// `changed_since` must notice every state change, including a disputed answer
// being withdrawn and its question reopened (which clears answeredAt).

const ALL: Cap[] = ["claim_job_expenses", "view_claim_status", "respond_to_query", "check_claim_progress"];
const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;
const pause = () => new Promise((r) => setTimeout(r, 30));

async function api(method: "GET" | "POST", path: string, token: string, principalId: string, body?: unknown) {
  const res = await fetch(`${HMRC}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": ip(), authorization: `Bearer ${token}`, "x-principal-id": principalId },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function claimed() {
  const p = await newPrincipal();
  const { token } = await authorise(p.id, ALL);
  expect((await api("POST", "/api/job-expenses", token, p.id)).status).toBe(200);
  const query_id = (await api("GET", "/api/claims", token, p.id)).body.result.claims[0].open_queries[0].query_id as string;
  return { p, token, query_id };
}

const progress = (token: string, pid: string, since: string) => api("GET", `/api/claims/progress?since=${encodeURIComponent(since)}`, token, pid);

describe("progress change detection", () => {
  it("is false when nothing has changed since the watermark", async () => {
    const { p, token } = await claimed();
    await pause();
    const r = await progress(token, p.id, new Date().toISOString());
    expect(r.body.result.changed_since).toBe(false);
  });

  it("still detects an answer submitted after the watermark", async () => {
    const { p, token, query_id } = await claimed();
    await pause();
    const since = new Date().toISOString();
    await pause();
    expect((await api("POST", "/api/claims/respond", token, p.id, { query_id, answer: "Policy applies from 6 April.", confirmed_by_person: true })).status).toBe(200);
    expect((await progress(token, p.id, since)).body.result.changed_since).toBe(true);
  });

  it("detects a withdrawn answer after the watermark, on every later poll with that watermark, and not after it", async () => {
    const { p, token, query_id } = await claimed();
    expect((await api("POST", "/api/claims/respond", token, p.id, { query_id, answer: "Policy applies from 6 April.", confirmed_by_person: true })).status).toBe(200);
    await pause();
    const since = new Date().toISOString();
    await pause();

    const { disputeReceipt } = await import("@/lib/receipts");
    const receipt = (await prisma.receipt.findMany({ where: { principalId: p.id } }))[0];
    await disputeReceipt(receipt.id, p.id);

    // The poll that reconciles the dispute reports the reopened question and the change.
    const first = await progress(token, p.id, since);
    expect(first.body.result.changed_since).toBe(true);
    expect(first.body.result.claims[0].open_queries[0]).toMatchObject({ query_id, earlier_answer_withdrawn: expect.any(String) });

    // Reconciliation is done, but the same earlier watermark still sees the change.
    expect((await progress(token, p.id, since)).body.result.changed_since).toBe(true);

    // A watermark taken after the withdrawal sees nothing new.
    await pause();
    const after = new Date().toISOString();
    expect((await progress(token, p.id, after)).body.result.changed_since).toBe(false);
  });
});
