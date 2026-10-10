import { expect, test } from "vitest";
import { whenisbinsObservation } from "@prototype/research-feed";
import { whenisbinsEvidence } from "../src/lib/whenisbins";
import { bindingInput, validateBindingAgainstSource } from "../src/lib/ground-truth";
import { pullSource, type IngestStore } from "../src/lib/ingestion";
const id = "f5b88321-76a2-4d27-8eac-b6ef9db74630";
const event = (stage: "admitted" | "subscription_pending" | "scheduled_occurrence" = "admitted") => whenisbinsObservation({ sourceEventId: id, occurredAt: "2026-10-10T00:00:00.000Z", action: "lookup", stage, decision: "ALLOW", taskId: "task", requestId: "request" }, "key");
test("observed denominators dedup source IDs and never count missing outcomes as effects", () => {
 const e = event(); const report = whenisbinsEvidence([e, e]); expect(report.counts).toEqual({ source_events: 1, observed_task_ids: 1, observed_occurrence_ids: 0, observed_outbound_call_ids: 0, observed_effect_ids: 0 }); expect(report.stages).toEqual({ admitted: 1 }); expect(JSON.stringify(report)).not.toContain("execution_class");
});
test("connector evidence cannot enter as another service and can bind only request evidence", () => {
 const b = bindingInput({ attempt_id: id, source_service: "whenisbins_connector", source_event_id: id, effect_class: "REQUEST_ONLY" });
 expect(validateBindingAgainstSource(b, event(), { status: "VERIFIED", provenance: {} }).eventKind).toBe("service_request");
 expect(() => validateBindingAgainstSource({ ...b, effectClass: "UNIQUE_OPERATION", operationId: id }, event(), { status: "VERIFIED", provenance: {} })).toThrow("SOURCE_EFFECT_CLASS_MISMATCH");
 expect(() => whenisbinsEvidence([{ ...event(), source_service: "hmrc" }])).toThrow();
});
test("v2 collection deduplicates restart scans and failed/cross-source pages do not advance", async () => {
 const rows = new Map(); let generation = 0; const store: IngestStore = { cursor: async () => ({ cursor: null, generation }), commit: async (_s, expected, events) => { if (expected.generation !== generation) return { committed: false, inserted: 0 }; let inserted = 0; for (const e of events) if (!rows.has(e.source_event_id)) { rows.set(e.source_event_id, e); inserted++; } generation++; return { committed: true, inserted }; } };
 const input = { source: "whenisbins_connector" as const, url: "http://connector/api/research/events", key: "synthetic", store, fetcher: (async () => Response.json({ schema_version: 2, source_service: "whenisbins_connector", events: [event()], next_cursor: null })) as typeof fetch };
 expect((await pullSource(input)).inserted).toBe(1); expect((await pullSource(input)).inserted).toBe(0);
 await expect(pullSource({ ...input, source: "hmrc" })).rejects.toThrow("SOURCE_MISMATCH"); expect(generation).toBe(2);
 await expect(pullSource({ ...input, fetcher: (async () => new Response(null, { status: 503 })) as typeof fetch })).rejects.toThrow("SOURCE_UNAVAILABLE"); expect(generation).toBe(2);
});
