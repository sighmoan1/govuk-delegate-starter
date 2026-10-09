import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("browser research network freezes input, appends reruns and retains absent-detector abstentions", async ({ page }) => {
  const collectionKey = process.env.OBSERVATORY_COLLECTION_KEY;
  if (!collectionKey) throw new Error("Set synthetic OBSERVATORY_COLLECTION_KEY for research API browser validation");
  await page.goto("/");
  const sourceEventId = `sensor:${randomUUID()}`;
  const result = await page.evaluate(async ({ key, id }) => {
    const missing = { value: null, status: "missing", provenance: "not_recorded" };
    const source = { schema_version: 1, source_service: "hmrc", source_event_id: id, event_kind: "browser_sensor", occurred_at: { value: new Date().toISOString(), status: "known", provenance: "source_clock" }, run_id: missing,
      correlation: { request_id: missing, transaction_id: missing, session_id: missing, delegate_check_id: missing }, observed: { lane: "UNKNOWN", signature_verified: missing, latency_ms: missing }, outcome: { decision: "OBSERVED", outcome_class: missing, cost_class: missing }, browser_sensor: { status: "not_run", provenance: "not_collected" } };
    const observation = await fetch("/api/research/observations", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(source) });
    const call = async (data: unknown, authenticated = true) => {
      const response = await fetch("/api/research/classifications", { method: "POST", headers: authenticated ? { "x-collection-key": key } : {}, body: JSON.stringify(data) });
      return { status: response.status, body: await response.json() };
    };
    const first = await call({ source_service: "hmrc", source_event_id: id });
    const rerun = await call({ snapshot_id: first.body.snapshotId, config_id: first.body.configId });
    const paid = await call({ source_service: "hmrc", source_event_id: id, classifier: "unavailable-paid" });
    const injected = await call({ source_service: "hmrc", source_event_id: id, execution_class: "HUMAN_OPERATED" });
    const denied = await call({}, false);
    const read = await fetch("/api/monitoring/classifications", { headers: { "x-collection-key": key } });
    const rows = await read.json();
    return { observation: observation.status, first, rerun, paid, injected, denied, rows: rows.filter((r: { snapshot: { sourceEventId: string } }) => r.snapshot.sourceEventId === id), cache: read.headers.get("cache-control") };
  }, { key: collectionKey, id: sourceEventId });
  expect(result.observation).toBe(201); expect(result.first.status).toBe(200); expect(result.rerun.status).toBe(200);
  expect(result.first.body.id).not.toBe(result.rerun.body.id); expect(result.first.body.snapshotId).toBe(result.rerun.body.snapshotId); expect(result.first.body.configId).toBe(result.rerun.body.configId);
  expect(result.first.body.result).toMatchObject({ status: "abstain", class: null, score: null, reason: "SIGNATURE_NOT_OBSERVED" });
  expect(result.paid.body.result).toMatchObject({ status: "abstain", reason: "DETECTOR_NOT_CONFIGURED" });
  expect(result.injected.status).toBe(400); expect(result.denied.status).toBe(401); expect(result.rows).toHaveLength(3); expect(result.cache).toContain("no-store");
  expect(result.rows.find((r: { id: string }) => r.id === result.first.body.id).result).toEqual(result.first.body.result);
  expect(JSON.stringify(result.rows.map((r: { snapshot: { record: unknown } }) => r.snapshot.record))).not.toContain("HUMAN_OPERATED");
});
