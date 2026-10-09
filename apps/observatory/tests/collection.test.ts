import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { missing } from "@prototype/research-feed";
vi.mock("@/lib/ingest-store", () => ({ persistObservation: vi.fn() }));
import { persistObservation } from "@/lib/ingest-store";
import { POST } from "../src/app/api/research/observations/route";
const persist = vi.mocked(persistObservation);
const event = () => ({ schema_version: 1, source_service: "hmrc", source_event_id: "sensor:7b0309d9-97e0-4035-a460-69390cc1c093", event_kind: "browser_sensor",
  occurred_at: { value: "2026-10-09T10:00:00.000Z", status: "known", provenance: "source_clock" }, run_id: missing(),
  correlation: { request_id: missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: missing() },
  observed: { lane: "UNKNOWN", signature_verified: missing(), latency_ms: missing() },
  outcome: { decision: "OBSERVED", outcome_class: missing(), cost_class: missing() }, browser_sensor: { status: "not_run", provenance: "not_collected" } });
const request = (body: unknown = event()) => new Request("http://observatory/api/research/observations", { method: "POST", headers: { Authorization: "Bearer collection-test-key" }, body: JSON.stringify(body) });
beforeEach(() => { vi.stubEnv("RESEARCH_INGEST_ENABLED", "true"); vi.stubEnv("OBSERVATORY_COLLECTION_KEY", "collection-test-key"); vi.stubEnv("PUBLIC_MODE", "false"); persist.mockReset(); persist.mockResolvedValue(1); });
afterEach(() => vi.unstubAllEnvs());
test("public mode rejects collection even with the correct key", async () => {
  vi.stubEnv("PUBLIC_MODE", "true");
  expect((await POST(request())).status).toBe(403); expect(persist).not.toHaveBeenCalled();
});
test("disabled ingestion and missing credentials do not persist observations", async () => {
  vi.stubEnv("RESEARCH_INGEST_ENABLED", "false"); expect((await POST(request())).status).toBe(403);
  vi.stubEnv("RESEARCH_INGEST_ENABLED", "true"); expect((await POST(new Request("http://observatory/", { method: "POST" }))).status).toBe(403);
  expect(persist).not.toHaveBeenCalled();
});
test("collection retains only schema-valid sensor events in their own namespace", async () => {
  expect((await POST(request({ ...event(), ground_truth: "human" }))).status).toBe(400);
  expect((await POST(request({ ...event(), source_event_id: "existing-source-log-id" }))).status).toBe(400);
  expect((await POST(request({ ...event(), occurred_at: missing() }))).status).toBe(400);
  expect(persist).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(201); expect(persist).toHaveBeenCalledTimes(1);
  persist.mockResolvedValue(0); const duplicate = await POST(request()); expect(duplicate.status).toBe(200); expect(await duplicate.json()).toEqual({ source_event_id: event().source_event_id, inserted: false });
});
