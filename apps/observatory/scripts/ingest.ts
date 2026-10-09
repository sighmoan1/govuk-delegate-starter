import { pullSource } from "../src/lib/ingestion";
import { ingestStore } from "../src/lib/ingest-store";
import { prisma } from "../src/lib/db";

async function main() {
  if (process.env.PUBLIC_MODE === "true" || process.env.RESEARCH_INGEST_ENABLED !== "true") throw new Error("RESEARCH_INGEST_DISABLED");
  let failed = false;
  for (const source of ["hmrc", "delegate"] as const) {
    const prefix = source.toUpperCase();
    const url = process.env[`${prefix}_RESEARCH_FEED_URL`];
    const key = process.env[`${prefix}_RESEARCH_FEED_KEY`];
    if (!url || !key) { console.error(`${source}: research feed not configured`); failed = true; continue; }
    try { console.log(source, await pullSource({ source, url, key, store: ingestStore })); }
    catch { console.error(`${source}: ingestion unavailable; cursor unchanged for failed page`); failed = true; }
  }
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("Research ingestion disabled or unavailable"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
