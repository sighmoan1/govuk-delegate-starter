import { randomUUID } from "node:crypto";
import { pullSource } from "../src/lib/ingestion";
import { ingestStore } from "../src/lib/ingest-store";
import { prisma } from "../src/lib/db";

async function main() {
  const url = process.env.HMRC_RESEARCH_FEED_URL!;
  const key = process.env.HMRC_RESEARCH_FEED_KEY!;
  if (!url || !key || process.env.RESEARCH_INGEST_ENABLED !== "true") throw new Error("RESEARCH_NOT_ENABLED");
  const denied = await fetch(url);
  if (denied.status !== 403) throw new Error("FEED_NOT_RESTRICTED");
  if ((await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}` } })).status !== 405) throw new Error("FEED_NOT_READ_ONLY");
  const run = randomUUID();
  // Genuine recorded request via HMRC; no direct writes to HMRC storage.
  const request = new URL("/api/tax-code", url);
  await fetch(request, { headers: { "x-run-tag": run } });
  const input = { source: "hmrc" as const, url, key, store: ingestStore, maxPages: 200 };
  if (!(await pullSource(input)).complete) throw new Error("INCOMPLETE_SCAN");
  const candidates = await prisma.observedEvent.findMany({ where: { sourceService: "hmrc" } });
  const observed = candidates.filter(row => (row.snapshot as { run_id?: { value?: string } }).run_id?.value === run);
  if (observed.length !== 1) throw new Error("RECORDED_REQUEST_NOT_FOUND_ONCE");
  const first = observed[0];
  if (!(await pullSource(input)).complete) throw new Error("INCOMPLETE_REPLAY_SCAN");
  const count = await prisma.observedEvent.count({ where: { sourceService: "hmrc", sourceEventId: first.sourceEventId } });
  if (count !== 1) throw new Error("DUPLICATE_SOURCE_EVENT");
  const encoded = JSON.stringify(first.snapshot);
  if (/principal|customer|subject|password|access_token|userAgent|ground_truth/i.test(encoded)) throw new Error("RAW_FIELD_LEAK");
  const delegateUrl = process.env.DELEGATE_RESEARCH_FEED_URL!;
  const delegateKey = process.env.DELEGATE_RESEARCH_FEED_KEY!;
  if (!(await pullSource({ source: "delegate", url: delegateUrl, key: delegateKey, store: ingestStore, maxPages: 200 })).complete) throw new Error("INCOMPLETE_DELEGATE_SCAN");
  console.log("Recorded HMRC request ingested exactly once; authenticated read-only feeds, retry scan and minimisation verified.");
}
main().catch(() => { console.error("Research feed integration failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
