import { Page } from "@prototype/research-feed";
import { prisma } from "@/lib/db";
import { ResearchError, fields, object, sha } from "@/lib/ground-truth";
import { researchBody, researchRoute } from "@/lib/research-http";
import type { Prisma } from "@/generated/prisma";
export const dynamic = "force-dynamic";
// Evaluation-only replay of audited archived source traces. Live collectors retain their own path.
export const POST = researchRoute("evaluation", async req => {
  const input = object(await researchBody(req)); fields(input, ["trace_digest", "page"]); sha(input.trace_digest);
  const parsed = Page.safeParse(input.page); if (!parsed.success) throw new ResearchError("INVALID_MINIMISED_SOURCE_PAGE");
  const page = parsed.data;
  if (page.events.some(e => e.source_service !== page.source_service || e.event_kind === 'browser_sensor' || !e.occurred_at.value)) throw new ResearchError("INVALID_ARCHIVED_SOURCE");
  // Truth stays in ResearchAttempt. Strict feed parsing prevents labels entering snapshot JSON.
  const stored = await prisma.observedEvent.createMany({ data: page.events.map(e => ({ sourceService: e.source_service, sourceEventId: e.source_event_id, schemaVersion: e.schema_version, occurredAt: new Date(e.occurred_at.value!), snapshot: e as unknown as Prisma.InputJsonValue })), skipDuplicates: true });
  return { inserted: stored.count, trace_digest: input.trace_digest };
});
