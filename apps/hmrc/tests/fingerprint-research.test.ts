import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { initialCoverage, errorCoverage, parseSample } from "@/lib/fingerprint-coverage";
import { verifyVendor, signResearch, readResearch, researchLogEvidence, RESEARCH_COOKIE, type ResearchBinding } from "@/lib/fingerprint-research";
import { POST as enrol } from "@/app/api/research/fingerprint/enrol/route";
import { POST as collect } from "@/app/api/research/fingerprint/sample/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const binding: ResearchBinding = { session_id: "12345678-1234-4234-8234-123456789012", run_id: "12345678-1234-4234-8234-123456789013",
  attempt_id: "12345678-1234-4234-8234-123456789014", nonce: "12345678-1234-4234-8234-123456789015", issued_at: Date.now(), expires_at: new Date(Date.now() + 60000).toISOString() };
const request = (body: unknown, origin = "http://localhost:3302") => new Request("http://localhost:3302/api/research/fingerprint/enrol", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });

describe("non-gating coverage", () => {
  it("defaults disabled and represents absent configuration as missing", () => {
    expect(initialCoverage(false, "public")).toBe("not_run");
    expect(initialCoverage(true, "")).toBe("missing");
    expect(initialCoverage(true, "public")).toBe("not_run");
  });
  it("distinguishes an explicit blocker from unknown network failure", () => {
    expect(errorCoverage({ code: "csp_block" }).state).toBe("blocked");
    expect(errorCoverage({ code: "network_connection" }).state).toBe("error");
    expect(errorCoverage(new Error("secret request detail"))).toEqual({ state: "error", error_code: "unknown" });
  });
  it("identified requires a bounded event ID; missing is never a negative bot signal", () => {
    expect(parseSample({ state: "identified" })).toBeNull();
    expect(parseSample({ state: "missing", visitor_id: "someone" })).toBeNull();
    expect(parseSample({ state: "identified", event_id: "event.1", run_id: "chosen-by-browser" })).toEqual({ state: "identified", event_id: "event.1" });
    expect(parseSample({ state: "error", error_code: "x".repeat(129) })).toBeNull();
  });
  it("disabled enrolment makes no vendor or Observatory call", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "false");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await enrol(request({ consent: true }))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("missing key does not consume an enrolment or call any vendor", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "true"); vi.stubEnv("NEXT_PUBLIC_FINGERPRINT_API_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await enrol(request({ consent: true, enrollment_token: "synthetic_enrolment_token" }));
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ state: "missing" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires same-origin explicit consent", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "true");
    expect((await enrol(request({ consent: true }, "https://other.test"))).status).toBe(403);
    expect((await enrol(request({ consent: false }))).status).toBe(400);
  });
});

describe("research bindings and optional v4 verification", () => {
  it("rejects forged or expired research cookies", async () => {
    const cookie = await signResearch(binding);
    expect((await readResearch(new Request("http://localhost", { headers: { cookie: `${RESEARCH_COOKIE}=${cookie}` } })))?.session_id).toBe(binding.session_id);
    expect(await readResearch(new Request("http://localhost", { headers: { cookie: `${RESEARCH_COOKIE}=${cookie}forged` } }))).toBeNull();
    const expired = await signResearch({ ...binding, expires_at: new Date(Date.now() - 10000).toISOString() });
    expect(await readResearch(new Request("http://localhost", { headers: { cookie: `${RESEARCH_COOKIE}=${expired}` } }))).toBeNull();
  });
  it("never treats an unverified browser claim as a server verified event", async () => {
    vi.stubEnv("FINGERPRINT_SERVER_API_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await verifyVendor({ state: "identified", event_id: "fixture.1" }, binding)).toBe("unverified_client_claim");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("verifies EU v4 event, linked session, timestamp and visitor claim without returning secret", async () => {
    vi.stubEnv("FINGERPRINT_SERVER_API_KEY", "server-only-fixture");
    const data = { event_id: "fixture.1", linked_id: binding.session_id, timestamp: Date.now(), identification: { visitor_id: "visitor-1" } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(data))); vi.stubGlobal("fetch", fetch);
    expect(await verifyVendor({ state: "identified", event_id: "fixture.1", visitor_id: "visitor-1" }, binding)).toBe("vendor_verified");
    expect(fetch.mock.calls[0][0]).toBe("https://eu.api.fpjs.io/v4/events/fixture.1");
    fetch.mockResolvedValue(new Response(JSON.stringify({ ...data, linked_id: "someone-else" })));
    expect(await verifyVendor({ state: "identified", event_id: "fixture.1" }, binding)).toBe("verification_failed");
  });
  it("verification outages preserve uncertain coverage and cannot affect a claim", async () => {
    vi.stubEnv("FINGERPRINT_SERVER_API_KEY", "server-only-fixture");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    expect(await verifyVendor({ state: "identified", event_id: "fixture.1" }, binding)).toBe("verification_unavailable");
  });
  it("server-derived bindings override client run/session claims and export only HMAC vendor IDs", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "true"); vi.stubEnv("FINGERPRINT_SERVER_API_KEY", "");
    vi.stubEnv("OBSERVATORY_INTERNAL_URL", "http://observatory:3303"); vi.stubEnv("OBSERVATORY_COLLECTION_KEY", "synthetic-collection-key-at-least-32-chars");
    vi.stubEnv("RESEARCH_PSEUDONYM_KEY", "synthetic-project-hmac-key-at-least-32-chars");
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(binding))).mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const cookie = await signResearch(binding);
    const req = new Request("http://localhost:3302/api/research/fingerprint/sample", { method: "POST", headers: { origin: "http://localhost:3302", "content-type": "application/json", cookie: `${RESEARCH_COOKIE}=${cookie}` },
      body: JSON.stringify({ nonce: binding.nonce, run_id: "spoofed", session_id: "spoofed", sample: { state: "identified", event_id: "raw-event.1", visitor_id: "raw-visitor-1" } }) });
    const response = await collect(req);
    expect(response.status).toBe(200);
    const event = JSON.parse(fetch.mock.calls[1][1].body);
    expect(event.run_id.value).toBe(binding.run_id);
    const serviceEvidence = await researchLogEvidence(req);
    expect(serviceEvidence).toEqual({ sessionId: binding.session_id, runTag: binding.run_id });
    expect(event.correlation.session_id.value).toBe(createHmac("sha256", process.env.RESEARCH_PSEUDONYM_KEY!).update(`hmrc:session:${serviceEvidence.sessionId}`).digest("hex"));
    expect(event.browser_sensor).toMatchObject({ status: "identified", provenance: "unverified_client_claim" });
    expect(event.browser_sensor.visitor_id.value).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/raw-event|raw-visitor|spoofed|collection-key|truth|actor_class/);
    expect(await response.json()).toMatchObject({ verification: "unverified_client_claim" });
  });
  it("a valid cookie with a mismatched nonce makes no collection or vendor calls", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "true");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const cookie = await signResearch(binding);
    const req = new Request("http://localhost:3302/api/research/fingerprint/sample", { method: "POST", headers: { origin: "http://localhost:3302", "content-type": "application/json", cookie: `${RESEARCH_COOKIE}=${cookie}` }, body: JSON.stringify({ nonce: "other", sample: { state: "missing" } }) });
    expect((await collect(req)).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  it("business-log research correlation is local-only and invalid/disabled cookies add nothing", async () => {
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "true");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const cookie = await signResearch(binding);
    const req = new Request("http://localhost:3302/api/job-expenses", { headers: { cookie: `${RESEARCH_COOKIE}=${cookie}`, "x-run-tag": "browser-chosen" } });
    expect(await researchLogEvidence(req)).toEqual({ sessionId: binding.session_id, runTag: binding.run_id });
    expect(await researchLogEvidence(new Request("http://localhost", { headers: { cookie: `${RESEARCH_COOKIE}=forged` } }))).toEqual({});
    vi.stubEnv("FINGERPRINT_RESEARCH_ENABLED", "false");
    expect(await researchLogEvidence(req)).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
