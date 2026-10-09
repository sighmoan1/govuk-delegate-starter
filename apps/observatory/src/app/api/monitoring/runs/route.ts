import { researchRoute } from "@/lib/research-http";
import { prisma } from "@/lib/db";
import { counts } from "@/lib/ground-truth";
export const dynamic = "force-dynamic";
export const GET = researchRoute("collection", async () => {
  const runs = await prisma.researchRun.findMany({ take: 100, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, attempts: { select: { id: true, intentId: true, bindings: { select: { sourceService: true, sourceEventId: true, effectClass: true, operationId: true, eventKind: true } } } } } });
  // Strict projection: no mode/cohort, expected label, owner, truth provenance or source manifest.
  return runs.map(r => ({ run_id: r.id, started_at: r.createdAt.toISOString(), attempts: r.attempts.map(a => a.id), distinct_intents: new Set(r.attempts.map(a => a.intentId)).size, ...counts(r.attempts.flatMap(a => a.bindings)) }));
});
