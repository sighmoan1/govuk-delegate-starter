import { prisma } from "./db";
import type { Prisma } from "../generated/prisma";
import { fields, object, ResearchError, uuid } from "./ground-truth";
import { classifyFrozen, digest, experiment, mockSensor, stubRule, unavailablePaid, type EvidenceRecord, type ExperimentConfig } from "./classification";
import { configuredLogistic } from "./statistical-model";
const json = (v: unknown) => v as Prisma.InputJsonValue;
const adapterFor = (name: unknown) => {
  if (name === "stub-rule" || name === undefined) return stubRule;
  if (name === "unavailable-paid") return unavailablePaid;
  if (name === "logistic") {
    try { return configuredLogistic().adapter; }
    catch { throw new ResearchError("STATISTICAL_MODEL_NOT_CONFIGURED", 503); }
  }
  throw new ResearchError("UNKNOWN_CLASSIFIER");
};
export async function runClassification(input: unknown) {
  const v = object(input);
  let snapshot; let config;
  if ("snapshot_id" in v) {
    fields(v, ["snapshot_id", "config_id"]);
    snapshot = await prisma.evidenceSnapshot.findUnique({ where: { id: uuid(v.snapshot_id) } });
    config = await prisma.classifierConfig.findUnique({ where: { id: uuid(v.config_id) } });
    if (!snapshot || !config) throw new ResearchError("FROZEN_INPUT_NOT_FOUND", 404);
  } else {
    fields(v, ["source_service", "source_event_id", "classifier", "threshold"]);
    if (!["hmrc","delegate"].includes(String(v.source_service)) || typeof v.source_event_id !== "string" || !v.source_event_id || v.source_event_id.length > 128) throw new ResearchError("INVALID_SOURCE_REFERENCE");
    const adapter = adapterFor(v.classifier);
    if (v.threshold !== undefined && (typeof v.threshold !== "number" || !Number.isFinite(v.threshold) || v.threshold < 0 || v.threshold > 1)) throw new ResearchError("INVALID_THRESHOLD");
    const source = await prisma.observedEvent.findUnique({ where: { sourceService_sourceEventId: { sourceService: String(v.source_service), sourceEventId: v.source_event_id } } });
    if (!source) throw new ResearchError("SOURCE_NOT_INGESTED", 404);
    const evidence = await mockSensor.collect(source.snapshot as never);
    const threshold = v.threshold ?? (adapter.identifier === "logistic" ? configuredLogistic().threshold : .5);
    const frozenConfig = experiment(adapter, threshold as number);
    // createMany(skipDuplicates) avoids UPDATEs, including Prisma upsert empty-update behaviour.
    await prisma.evidenceSnapshot.createMany({ data: [{ sourceService: evidence.source, sourceEventId: evidence.source_event_id, schemaVersion: evidence.schema, digest: digest(evidence), record: json(evidence) }], skipDuplicates: true });
    snapshot = await prisma.evidenceSnapshot.findUniqueOrThrow({ where: { sourceService_sourceEventId_schemaVersion: { sourceService: evidence.source, sourceEventId: evidence.source_event_id, schemaVersion: evidence.schema } } });
    await prisma.classifierConfig.createMany({ data: [{ digest: digest(frozenConfig), record: json(frozenConfig) }], skipDuplicates: true });
    config = await prisma.classifierConfig.findUniqueOrThrow({ where: { digest: digest(frozenConfig) } });
  }
  const frozen = config.record as unknown as ExperimentConfig;
  const result = await classifyFrozen(snapshot.record as unknown as EvidenceRecord, frozen, adapterFor(frozen.adapter));
  return prisma.classificationRun.create({ data: { snapshotId: snapshot.id, configId: config.id, result: json(result) } });
}
export async function listClassifications() {
  return prisma.classificationRun.findMany({ take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { snapshot: true, config: true } });
}
