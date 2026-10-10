import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { runClassification } from "../src/lib/classification-store";
import { known, missing } from "@prototype/research-feed";
// Run only in disposable synthetic research databases. Inference rows are append-only.
async function main() {
  const sourceEventId = randomUUID();
  await prisma.observedEvent.create({ data: { sourceService: "hmrc", sourceEventId, schemaVersion: 1, occurredAt: new Date(), snapshot: {
    schema_version: 1, source_service: "hmrc", source_event_id: sourceEventId, event_kind: "service_request",
    occurred_at: { value: new Date().toISOString(), status: "known", provenance: "source_clock" }, run_id: missing(),
    correlation: { request_id: missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: missing() },
    observed: { lane: "AUTHORISED_AGENT", signature_verified: known(true), latency_ms: missing() },
    outcome: { decision: "ALLOW", outcome_class: missing(), cost_class: missing() }, browser_sensor: { status: "not_run", provenance: "not_collected" },
  } } });
  const first = await runClassification({ source_service: "hmrc", source_event_id: sourceEventId });
  const earlier = JSON.stringify(first);
  const second = await runClassification({ snapshot_id: first.snapshotId, config_id: first.configId });
  assert.notEqual(first.id, second.id); assert.equal(first.snapshotId, second.snapshotId); assert.equal(first.configId, second.configId);
  assert.equal(JSON.stringify(await prisma.classificationRun.findUniqueOrThrow({ where: { id: first.id } })), earlier);
  const a = first.result as Record<string,unknown>, b = second.result as Record<string,unknown>;
  assert.equal(a.status, "classified"); assert.equal(a.class, "VERIFIED_SIGNATURE"); assert.deepEqual({ ...a, latency_ms: 0 }, { ...b, latency_ms: 0 });
  const paid = await runClassification({ source_service: "hmrc", source_event_id: sourceEventId, classifier: "unavailable-paid" });
  assert.equal((paid.result as Record<string,unknown>).status, "abstain");
  assert.equal(await prisma.evidenceSnapshot.count({ where: { sourceEventId } }), 1);
  const frozen = await prisma.evidenceSnapshot.findUniqueOrThrow({ where: { id: first.snapshotId } });
  assert.ok(!JSON.stringify(frozen.record).includes("run_id")); assert.ok(!JSON.stringify(frozen.record).includes("outcome"));
  await assert.rejects(prisma.evidenceSnapshot.update({ where: { id: first.snapshotId }, data: { digest: "changed" } }));
  await assert.rejects(prisma.classifierConfig.update({ where: { id: first.configId }, data: { record: {} } }));
  await assert.rejects(prisma.classificationRun.update({ where: { id: first.id }, data: { result: {} } }));
  await assert.rejects(prisma.classificationRun.delete({ where: { id: first.id } }));
  await assert.rejects(runClassification({ source_service: "hmrc", source_event_id: randomUUID() }));
  await assert.rejects(runClassification({ source_service: "hmrc", source_event_id: sourceEventId, execution_class: "HUMAN_OPERATED" }));
  console.log("Classification contract: frozen rerun, deduplication, immutable SQL records, absent detector and leakage checks passed (synthetic fixture only).");
}
main().finally(() => prisma.$disconnect()).catch(() => { console.error("Classification verification failed"); process.exitCode = 1; });
