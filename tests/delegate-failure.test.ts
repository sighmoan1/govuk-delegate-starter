import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from "vitest";
import { askDelegate, recordReceipt, disputedReceipts, receiptKey, DelegateUnavailableError } from "../apps/hmrc/src/lib/delegate-client";
import { prisma, newPrincipal, authorise, HMRC_SERVICE_KEY, DELEGATE, SERVICE } from "./helpers";

// Failure injection for HMRC's calls to Delegate. fetch is stubbed, so
// these need no running services: they check that an outage is never read as
// success, or as "nobody disputed".

const receipt = { mandate_id: "m1", delegation_id: "d1", capability: "respond_to_query", reference: "q1", text: "x", agent_confirmed: false, idempotency_key: receiptKey("q1", 0) };
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  process.env.HMRC_SERVICE_KEY = "k";
  process.env.DELEGATE_RETRY_DELAY_MS = "1";
});
afterEach(() => vi.unstubAllGlobals());

describe("recordReceipt", () => {
  it("returns the receipt id and sends a stable idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { receipt_id: "r1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await recordReceipt(receipt)).toBe("r1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).idempotency_key).toBe("hmrc-personal-tax:respond_to_query:q1:v0");
  });

  it("the key changes with the submission version, not on retry", () => {
    expect(receiptKey("q1", 0)).toBe(receiptKey("q1", 0));
    expect(receiptKey("q1", 1)).not.toBe(receiptKey("q1", 0));
  });

  it("retries a 5xx and succeeds with the same key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(503)).mockResolvedValueOnce(json(200, { receipt_id: "r1", duplicate: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await recordReceipt(receipt)).toBe("r1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).idempotency_key);
    expect(new Set(keys).size).toBe(1);
  });

  it("retries a timeout, then succeeds", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new DOMException("timed out", "TimeoutError")).mockResolvedValueOnce(json(201, { receipt_id: "r2" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await recordReceipt(receipt)).toBe("r2");
  });

  it("throws, rather than returning null, when Delegate stays down (5xx)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recordReceipt(receipt)).rejects.toBeInstanceOf(DelegateUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when the connection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(recordReceipt(receipt)).rejects.toBeInstanceOf(DelegateUnavailableError);
  });

  it("throws, without retrying, when Delegate rejects the receipt (4xx)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404, { error: "NO_SUCH_MANDATE" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recordReceipt(receipt)).rejects.toMatchObject({ name: "DelegateUnavailableError", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws if Delegate says OK but returns no receipt id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, {})));
    await expect(recordReceipt(receipt)).rejects.toBeInstanceOf(DelegateUnavailableError);
  });
});

describe("disputedReceipts", () => {
  it("returns the disputed ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { disputed: ["r2"] })));
    expect(await disputedReceipts(["r1", "r2"])).toEqual({ ok: true, disputed: ["r2"] });
  });

  it("does not call Delegate when there is nothing to ask", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await disputedReceipts([])).toEqual({ ok: true, disputed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unknown, not 'none disputed', on a 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(502)));
    expect(await disputedReceipts(["r1"])).toEqual({ ok: false });
  });

  it("reports unknown on a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect(await disputedReceipts(["r1"])).toEqual({ ok: false });
  });

  it("reports unknown on a malformed answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { nope: true })));
    expect(await disputedReceipts(["r1"])).toEqual({ ok: false });
  });
});

describe("askDelegate", () => {
  it("throws when Delegate is down: an outage is not a denial", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(503)));
    await expect(askDelegate({ agent_token: "t", principal_id: "p", capability: "view_tax_code" })).rejects.toBeInstanceOf(DelegateUnavailableError);
  });
});

// Needs the running Delegate service and its database (like the rest of the suite).
describe("Delegate receipts API is idempotent", () => {
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => prisma.$disconnect());

  it("a repeated write with the same key returns the same receipt, once", async () => {
    const p = await newPrincipal();
    const { authorisationId } = await authorise(p.id, ["respond_to_query"]);
    const write = (key: string) =>
      fetch(`${DELEGATE}/api/receipts`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-key": HMRC_SERVICE_KEY },
        body: JSON.stringify({ service: SERVICE, mandate_id: authorisationId, delegation_id: null, capability: "respond_to_query", reference: "q-test", text: "answer", agent_confirmed: false, idempotency_key: key }),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const key = `test:${p.id}:v0`;
    const first = await write(key);
    const again = await write(key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.receipt_id).toBe(first.body.receipt_id);
    expect(await prisma.receipt.count({ where: { principalId: p.id } })).toBe(1);
    // A new submission version is a new receipt.
    const next = await write(`test:${p.id}:v1`);
    expect(next.body.receipt_id).not.toBe(first.body.receipt_id);
    expect(await prisma.receipt.count({ where: { principalId: p.id } })).toBe(2);
  });
});
