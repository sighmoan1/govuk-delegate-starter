import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, newPrincipal, authorise, revokeAuthorisation, signAgentToken, HMRC, type Cap } from "./helpers";

afterAll(() => prisma.$disconnect());

// The claim journey an agent runs for a person: claim, see HMRC's question,
// answer it once the person has agreed, and check progress on a schedule.

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}`;
const ALL: Cap[] = ["claim_job_expenses", "view_claim_status", "respond_to_query", "check_claim_progress"];

async function api(method: "GET" | "POST", path: string, token: string | null, principalId: string | null, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip() };
  if (token) headers.authorization = `Bearer ${token}`;
  if (principalId) headers["x-principal-id"] = principalId;
  const res = await fetch(`${HMRC}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const text = await res.text();
  let json: any = text;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json };
}

/** A person with an authorised agent, who has made a claim and so been asked a question. */
async function claimed() {
  const p = await newPrincipal();
  const { token, authorisationId } = await authorise(p.id, ALL);
  expect((await api("POST", "/api/job-expenses", token, p.id)).status).toBe(200);
  const status = await api("GET", "/api/claims", token, p.id);
  return { p, token, authorisationId, status };
}

const events = async (since: Date) =>
  ((await (await fetch(`${HMRC}/ops/events?since=${since.toISOString()}`)).json()).events as { outcome: string; reason: string | null; capability: string | null; delegateCheckId: string | null }[]);

describe("retrieve: claim status", () => {
  it("authorised agent sees the claim and HMRC's question", async () => {
    const { status } = await claimed();
    expect(status.status).toBe(200);
    const claim = status.body.result.claims[0];
    expect(claim.status).toBe("AWAITING_YOUR_REPLY");
    expect(claim.open_queries).toHaveLength(1);
    expect(claim.open_queries[0].question).toMatch(/working-from-home policy/);
  });
});

describe("respond to HMRC's question", () => {
  it("is refused until the person has agreed the answer, then succeeds once", async () => {
    const { p, token, status } = await claimed();
    const query_id = status.body.result.claims[0].open_queries[0].query_id;
    const answer = "Northwind requires everyone in my team to work from home, from 1 April 2026.";

    const unconfirmed = await api("POST", "/api/claims/respond", token, p.id, { query_id, answer });
    expect(unconfirmed.status).toBe(428);
    expect(unconfirmed.body).toMatchObject({ decision: "DENY", reason: "CONFIRMATION_REQUIRED" });

    const ok = await api("POST", "/api/claims/respond", token, p.id, { query_id, answer, confirmed_by_person: true });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ answered: true, status: "BEING_REVIEWED" });

    const again = await api("POST", "/api/claims/respond", token, p.id, { query_id, answer, confirmed_by_person: true });
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe("DUPLICATE_SUBMISSION");

    const after = await api("GET", "/api/claims", token, p.id);
    expect(after.body.result.claims[0]).toMatchObject({ status: "BEING_REVIEWED", open_queries: [] });
  });

  it("cannot answer a question HMRC asked someone else", async () => {
    const a = await claimed();
    const b = await claimed();
    const theirs = b.status.body.result.claims[0].open_queries[0].query_id;
    const r = await api("POST", "/api/claims/respond", a.token, a.p.id, { query_id: theirs, answer: "x", confirmed_by_person: true });
    expect(r.status).toBe(404);
    expect(r.body.reason).toBe("QUERY_NOT_FOUND");
  });

  it("an agent without respond_to_query permission is refused", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["claim_job_expenses", "view_claim_status"]);
    await api("POST", "/api/job-expenses", token, p.id);
    const q = (await api("GET", "/api/claims", token, p.id)).body.result.claims[0].open_queries[0].query_id;
    const r = await api("POST", "/api/claims/respond", token, p.id, { query_id: q, answer: "x", confirmed_by_person: true });
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("PERMISSION_MISSING");
  });
});

describe("scheduled progress checks", () => {
  it("are capped per person per day, however many authorisations are used", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["check_claim_progress"]);
    for (let i = 0; i < 4; i++) expect((await api("GET", "/api/claims/progress", token, p.id)).status).toBe(200);
    const fifth = await api("GET", "/api/claims/progress", token, p.id);
    expect(fifth.status).toBe(429);
    expect(fifth.body).toMatchObject({ reason: "CAPACITY_EXCEEDED", rule: "claim_progress_checks_per_day", limit: 4 });
  });

  it("report whether anything changed since the last look", async () => {
    const p = await newPrincipal();
    const { token } = await authorise(p.id, ["claim_job_expenses", "check_claim_progress"]);
    const before = new Date().toISOString();
    expect((await api("GET", `/api/claims/progress?since=${before}`, token, p.id)).body.result.changed_since).toBe(false);
    await api("POST", "/api/job-expenses", token, p.id);
    expect((await api("GET", `/api/claims/progress?since=${before}`, token, p.id)).body.result.changed_since).toBe(true);
  });

  it("stop when the person revokes the authority", async () => {
    const p = await newPrincipal();
    const { token, authorisationId } = await authorise(p.id, ["check_claim_progress"]);
    expect((await api("GET", "/api/claims/progress", token, p.id)).status).toBe(200);
    await revokeAuthorisation(authorisationId, p.id);
    const r = await api("GET", "/api/claims/progress", token, p.id);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("AUTHORISATION_REVOKED");
  });
});

describe("the standard denials apply to the new capabilities", () => {
  it("expired authority fails", async () => {
    const p = await newPrincipal();
    const { token, authorisationId } = await authorise(p.id, ["view_claim_status"]);
    await prisma.authorisation.update({ where: { id: authorisationId }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect((await api("GET", "/api/claims", token, p.id)).body.reason).toBe("AUTHORISATION_EXPIRED");
  });

  it("missing relationship fails", async () => {
    const p = await newPrincipal();
    const other = await newPrincipal();
    const { token } = await authorise(other.id, ["view_claim_status"]);
    const r = await api("GET", "/api/claims", token, p.id);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("NO_AUTHORISATION");
  });

  it("unknown delegate fails", async () => {
    const p = await newPrincipal();
    const token = await signAgentToken(randomUUID(), "ghost");
    const r = await api("GET", "/api/claims", token, p.id);
    expect(r.body.reason).toBe("UNKNOWN_DELEGATE");
  });

  it("every attempt leaves an event in HMRC's log", async () => {
    const since = new Date();
    const { p, token } = await claimed();
    await api("POST", "/api/claims/respond", token, p.id, { query_id: "nope", answer: "x" });
    await api("GET", "/api/claims/progress", token, p.id);
    const log = await events(since);
    const mine = (cap: string) => log.filter((e) => e.capability === cap);
    expect(mine("claim_job_expenses").length).toBeGreaterThanOrEqual(1);
    expect(mine("view_claim_status").length).toBeGreaterThanOrEqual(1);
    expect(mine("respond_to_query").some((e) => e.outcome === "REFUSED" && e.reason === "QUERY_NOT_FOUND")).toBe(true);
    expect(mine("check_claim_progress").some((e) => e.outcome === "ALLOWED")).toBe(true);
  });
});

describe("what the person can see and undo", () => {
  async function answered() {
    const c = await claimed();
    const query_id = c.status.body.result.claims[0].open_queries[0].query_id;
    const r = await api("POST", "/api/claims/respond", c.token, c.p.id, { query_id, answer: "My employer requires it.", confirmed_by_person: true });
    expect(r.status).toBe(200);
    return { ...c, query_id, reply: r };
  }

  it("tells the agent to tell the person", async () => {
    const { reply, p, token } = await answered();
    const status = await api("GET", "/api/claims", token, p.id);
    expect(status.body.tell_the_person).toMatch(/account\/delegates/);
    expect(reply.body.tell_the_person).toMatch(/Sam Taylor|account\/delegates/);
  });

  it("records the agent's words on the person's GOV.UK record", async () => {
    const { p, authorisationId } = await answered();
    const rows = await prisma.receipt.findMany({ where: { principalId: p.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mandateId: authorisationId, capability: "respond_to_query", agentConfirmed: true, status: "RECORDED" });
    expect(rows[0].text).toContain("My employer requires it.");
  });

  it("'I didn't agree': HMRC reopens the question, and the agent loses that permission only", async () => {
    const { p, token, query_id } = await answered();
    const { disputeReceipt } = await import("@/lib/receipts");
    const receipt = (await prisma.receipt.findMany({ where: { principalId: p.id } }))[0];
    await disputeReceipt(receipt.id, p.id);

    const status = await api("GET", "/api/claims", token, p.id);
    const q = status.body.result.claims[0];
    expect(q.status).toBe("AWAITING_YOUR_REPLY");
    expect(q.open_queries[0]).toMatchObject({ query_id, earlier_answer_withdrawn: expect.stringContaining("did not agree") });

    const retry = await api("POST", "/api/claims/respond", token, p.id, { query_id, answer: "Again", confirmed_by_person: true });
    expect(retry.status).toBe(403);
    expect(retry.body.reason).toBe("PERMISSION_MISSING");
    expect((await api("GET", "/api/claims/progress", token, p.id)).status).toBe(200);
  });

  it("the person can take one permission away without removing the rest", async () => {
    const p = await newPrincipal();
    const { token, authorisationId } = await authorise(p.id, ["view_claim_status", "check_claim_progress"]);
    const { narrowAuthorisation } = await import("@/lib/receipts");
    await narrowAuthorisation(authorisationId, p.id, "check_claim_progress");
    expect((await api("GET", "/api/claims/progress", token, p.id)).body.reason).toBe("PERMISSION_MISSING");
    expect((await api("GET", "/api/claims", token, p.id)).status).toBe(200);
  });

  it("a person cannot dispute or narrow someone else's receipt or authority", async () => {
    const a = await answered();
    const other = await newPrincipal();
    const { disputeReceipt, narrowAuthorisation } = await import("@/lib/receipts");
    const receipt = (await prisma.receipt.findMany({ where: { principalId: a.p.id } }))[0];
    await expect(disputeReceipt(receipt.id, other.id)).rejects.toThrow();
    await expect(narrowAuthorisation(a.authorisationId, other.id, "view_claim_status")).rejects.toThrow();
  });
});
