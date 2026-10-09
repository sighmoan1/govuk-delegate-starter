import { expect, test } from "vitest";
import { Event, missing, known, type ResearchEvent } from "@prototype/research-feed";
import { pullSource, type IngestStore } from "../src/lib/ingestion";
const event = (id: string, at = "2020-01-01T00:00:00.000Z") => Event.parse({ schema_version: 1, source_service: "hmrc", source_event_id: id,
  occurred_at: { value: at, status: "known", provenance: "source_clock" }, run_id: missing(),
  correlation: { request_id: missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: missing() },
  observed: { lane: "UNTRUSTED", signature_verified: missing(), latency_ms: known(2) },
  outcome: { decision: "REFUSED", outcome_class: known("AUTHORITY_REFUSAL"), cost_class: missing() }, browser_sensor: { status: "missing", provenance: "not_collected" } });
function memory() {
  let state = { cursor: null as string | null, generation: 0 };
  const rows = new Map<string, ResearchEvent>();
  const store: IngestStore = { cursor: async () => ({ ...state }), commit: async (_source, expected, events, next) => {
    if (expected.generation !== state.generation) return { committed: false, inserted: 0 };
    let inserted = 0;
    for (const e of events) if (!rows.has(e.source_event_id)) { rows.set(e.source_event_id, e); inserted++; }
    state = { cursor: next, generation: state.generation + 1 };
    return { committed: true, inserted };
  } };
  return { store, rows, state: () => state };
}
const page = (events: ResearchEvent[], next_cursor: string | null = null) => Response.json({ schema_version: 1, source_service: "hmrc", events, next_cursor });
test("repeated complete scans deduplicate and recover late events with earlier clocks", async () => {
  const m = memory(); let events = [event("z")];
  const fetcher = async () => page(events);
  await pullSource({ source: "hmrc", url: "http://source/", key: "synthetic", store: m.store, fetcher: fetcher as typeof fetch });
  events = [event("a", "1990-01-01T00:00:00.000Z"), event("z")];
  expect((await pullSource({ source: "hmrc", url: "http://source/", key: "synthetic", store: m.store, fetcher: fetcher as typeof fetch })).inserted).toBe(1);
  expect(m.rows.size).toBe(2); expect(m.state().cursor).toBe(null);
});
test("failed page leaves durable cursor for retry", async () => {
  const m = memory(); let fail = true;
  const fetcher = async (url: URL | RequestInfo) => !new URL(String(url)).searchParams.has("cursor") ? page([event("a")], "next") : fail ? new Response(null, { status: 503 }) : page([event("b")]);
  const input = { source: "hmrc" as const, url: "http://source/", key: "synthetic", store: m.store, fetcher: fetcher as typeof fetch };
  await expect(pullSource(input)).rejects.toThrow("SOURCE_UNAVAILABLE");
  expect(m.state().cursor).toBe("next"); expect(m.rows.size).toBe(1);
  fail = false; await pullSource(input); expect(m.rows.size).toBe(2); expect(m.state().cursor).toBe(null);
});
test("malformed labels, credentials and cross-source pages are rejected before commit", async () => {
  const m = memory();
  const bad = { ...event("a"), ground_truth: "human", access_token: "secret" };
  await expect(pullSource({ source: "hmrc", url: "http://source/", key: "synthetic", store: m.store,
    fetcher: (async () => page([bad])) as typeof fetch })).rejects.toThrow();
  expect(m.rows.size).toBe(0); expect(m.state().generation).toBe(0);
  await expect(pullSource({ source: "delegate", url: "http://source/", key: "synthetic", store: m.store,
    fetcher: (async () => page([event("a")])) as typeof fetch })).rejects.toThrow("SOURCE_MISMATCH");
});
test("a concurrent cursor owner prevents stale puller committing", async () => {
  const store: IngestStore = { cursor: async () => ({ cursor: null, generation: 0 }), commit: async () => ({ committed: false, inserted: 0 }) };
  const result = await pullSource({ source: "hmrc", url: "http://source/", key: "synthetic", store, fetcher: (async () => page([event("a")])) as typeof fetch });
  expect(result.concurrent).toBe(true); expect(result.inserted).toBe(0);
});

test("source clocks are never fabricated from missing values and sensor evidence stays explicit", () => {
  expect(() => Event.parse({ ...event("a"), occurred_at: missing() })).toThrow();
  expect(() => Event.parse({ ...event("a"), browser_sensor: { status: "identified", provenance: "unverified_client_claim" } })).toThrow();
  const id = { value: "a".repeat(64), status: "inferred", provenance: "pseudonymised" };
  expect(() => Event.parse({ ...event("a"), browser_sensor: { status: "not_run", provenance: "not_collected", event_id: id } })).toThrow();
  expect(() => Event.parse({ ...event("a"), browser_sensor: { status: "blocked", provenance: "vendor_verified", event_id: id } })).toThrow();
  expect(Event.parse({ ...event("a"), browser_sensor: { status: "identified", provenance: "unverified_client_claim", event_id: id } }).browser_sensor.provenance).toBe("unverified_client_claim");
});
