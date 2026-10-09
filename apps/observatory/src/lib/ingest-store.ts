import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma";
import type { IngestStore } from "./ingestion";

export const ingestStore: IngestStore = {
  async cursor(source) {
    const row = await prisma.feedCursor.upsert({ where: { sourceService: source }, create: { sourceService: source }, update: {} });
    return { cursor: row.cursor, generation: row.generation };
  },
  async commit(source, expected, events, next) {
    return prisma.$transaction(async tx => {
      // Optimistic generation check prevents overlapping pullers moving a cursor backwards.
      const claimed = await tx.feedCursor.updateMany({ where: { sourceService: source, generation: expected.generation, cursor: expected.cursor },
        data: { cursor: next, generation: { increment: 1 } } });
      if (claimed.count !== 1) return { committed: false, inserted: 0 };
      const stored = await tx.observedEvent.createMany({ data: events.map(event => ({ sourceService: source, sourceEventId: event.source_event_id,
        schemaVersion: event.schema_version, occurredAt: new Date(event.occurred_at.value!), snapshot: event as unknown as Prisma.InputJsonValue })), skipDuplicates: true });
      return { committed: true, inserted: stored.count };
    });
  },
};

// Research-only push path for asynchronous sensor observations. Source decisions never use it.
export async function persistObservation(event: import("@prototype/research-feed").ResearchEvent) {
  const stored = await prisma.observedEvent.createMany({ data: [{ sourceService: event.source_service, sourceEventId: event.source_event_id,
    schemaVersion: event.schema_version, occurredAt: new Date(event.occurred_at.value!), snapshot: event as unknown as Prisma.InputJsonValue }], skipDuplicates: true });
  return stored.count;
}
