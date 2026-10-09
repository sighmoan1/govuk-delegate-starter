import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./db";
import { attemptInput, bindingInput, fields, object, publicSession, ResearchError, runInput, tokenHash, uuid, verifiedProvenance, validateBindingAgainstSource } from "./ground-truth";
import type { Prisma } from "../generated/prisma";

export async function createRun(input: unknown) {
  const data = runInput(input);
  if (data.evidenceDigest) {
    const old = await prisma.researchRun.findUnique({ where: { evidenceDigest: data.evidenceDigest } });
    if (old) {
      if (old.mode !== data.mode || old.sourceCommit !== data.sourceCommit || old.protocolVersion !== data.protocolVersion || old.seed !== data.seed) throw new ResearchError("EVIDENCE_ALREADY_REGISTERED_DIFFERENTLY", 409);
      return { ...old, replayed: true };
    }
  }
  try { return { ...await prisma.researchRun.create({ data }), replayed: false }; }
  catch (e) { if ((e as { code?: string }).code !== 'P2002') throw e; return createRun(input); }
}
export async function createAttempt(input: unknown) {
  const v = object(input); const run = await prisma.researchRun.findUnique({ where: { id: uuid(v.run_id) } });
  if (!run) throw new ResearchError("RUN_NOT_FOUND", 404);
  if (run.status !== "OPEN") throw new ResearchError("RUN_ALREADY_COMPLETE", 409);
  return prisma.researchAttempt.create({ data: attemptInput(input, run.mode) });
}
export async function verifyAttempt(id: string, input: unknown) {
  const attempt = await prisma.researchAttempt.findUnique({ where: { id: uuid(id) }, include: { run: true } });
  if (!attempt) throw new ResearchError("ATTEMPT_NOT_FOUND", 404);
  if (attempt.status !== "PLANNED") throw new ResearchError("TRUTH_ALREADY_FINAL_OR_UNLABELLED", 409);
  const verified = verifiedProvenance(input, attempt.run.mode);
  const changed = await prisma.researchAttempt.updateMany({ where: { id: attempt.id, status: "PLANNED" }, data: { ...verified, provenance: verified.provenance as Prisma.InputJsonValue } });
  if (changed.count !== 1) throw new ResearchError("TRUTH_ALREADY_FINAL", 409);
  return prisma.researchAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
}
export async function bindEvent(input: unknown) {
  const data = bindingInput(input);
  const attempt = await prisma.researchAttempt.findUnique({ where: { id: data.attemptId }, include: { run: true } });
  if (!attempt) throw new ResearchError("ATTEMPT_NOT_FOUND", 404);
  if (attempt.run.status !== "OPEN") throw new ResearchError("RUN_ALREADY_COMPLETE", 409);
  const source = await prisma.observedEvent.findUnique({ where: { sourceService_sourceEventId: { sourceService: data.sourceService, sourceEventId: data.sourceEventId } } });
  if (!source) throw new ResearchError("SOURCE_NOT_INGESTED", 409);
  const validated = validateBindingAgainstSource(data, source.snapshot, attempt);
  const identityObservation = validated.identityObservation as Prisma.InputJsonValue;
  // Exact original source IDs; repeat polling never makes a second request or effect.
  const key = { sourceService_sourceEventId: { sourceService: data.sourceService, sourceEventId: data.sourceEventId } };
  const old = await prisma.researchBinding.findUnique({ where: key });
  if (old) {
    if (old.attemptId !== data.attemptId || old.operationId !== data.operationId || old.effectClass !== data.effectClass || old.effectEvidenceDigest !== data.effectEvidenceDigest) throw new ResearchError("SOURCE_ALREADY_BOUND_DIFFERENTLY", 409);
    return old;
  }
  try { return await prisma.researchBinding.create({ data: { ...data, eventKind: validated.eventKind, identityObservation } }); }
  catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    return bindEvent(input); // Unique source-key winner now provides idempotent result/conflict.
  }
}
export async function createEnrolment(input: unknown) {
  const v = object(input); fields(v, ["attempt_id"]);
  if (!await prisma.researchAttempt.findUnique({ where: { id: uuid(v.attempt_id) } })) throw new ResearchError("ATTEMPT_NOT_FOUND", 404);
  const token = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 15 * 60_000);
  await prisma.researchEnrolment.create({ data: { id: randomUUID(), attemptId: String(v.attempt_id), tokenHash: tokenHash(token), expiresAt } });
  return { enrollment_token: token, expires_at: expiresAt.toISOString() };
}
export async function claimEnrolment(input: unknown) {
  const v = object(input); fields(v, ["enrollment_token"]);
  if (typeof v.enrollment_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v.enrollment_token)) throw new ResearchError("INVALID_ENROLMENT_TOKEN");
  return prisma.$transaction(async tx => {
    const row = await tx.researchEnrolment.findUnique({ where: { tokenHash: tokenHash(String(v.enrollment_token)) } });
    if (!row) throw new ResearchError("ENROLMENT_NOT_FOUND", 404);
    const now = new Date(); if (row.expiresAt <= now) throw new ResearchError("ENROLMENT_EXPIRED", 410);
    const claimed = await tx.researchEnrolment.updateMany({ where: { id: row.id, claimedAt: null, expiresAt: { gt: now } }, data: { claimedAt: now } });
    if (claimed.count !== 1) throw new ResearchError("ENROLMENT_ALREADY_CLAIMED", 409);
    const s = await tx.researchSession.create({ data: { id: randomUUID(), attemptId: row.attemptId, expiresAt: new Date(now.getTime() + 60 * 60_000) }, include: { attempt: { select: { id: true, runId: true } } } });
    return publicSession(s);
  });
}
export async function activeSession(id: string) {
  const s = await prisma.researchSession.findUnique({ where: { id: uuid(id) }, include: { attempt: { select: { id: true, runId: true } } } });
  if (!s || s.expiresAt <= new Date()) throw new ResearchError("SESSION_NOT_ACTIVE", 404);
  return publicSession(s);
}
