import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Level = "high-level" | "detailed";
const revisions = Object.fromEntries((["high-level", "detailed"] as const).map(level => [
  level,
  createHash("sha256").update(readFileSync(join(process.cwd(), "public", "briefings", `${level}.pptx`))).digest("hex"),
]));

/** A new deck gets a new cache key, including when only its notes change. */
export function briefingDownload(level: Level) {
  return `/briefings/${level}.pptx?v=${revisions[level]}`;
}
