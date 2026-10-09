import { NextResponse } from "next/server";
import { demoAllowed } from "@/lib/demo-gate";
import { runStats } from "@/lib/run-stats";

export const dynamic = "force-dynamic";

// Demo tooling, not part of the service: HMRC's own log and queue for one experiment run, grouped so technical load
// and service outcomes stay apart. The about site and the swarm tests call it. Not reachable through the public tunnel.
export async function POST(req: Request) {
  if (!demoAllowed(req)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { run_tag_prefix?: string; subjects?: unknown; include_events?: boolean; watch?: unknown };
  if (!b.run_tag_prefix || b.run_tag_prefix.length < 4) return NextResponse.json({ error: "RUN_TAG_PREFIX_REQUIRED" }, { status: 400 });
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 1000) : []);
  return NextResponse.json(await runStats({ runTagPrefix: b.run_tag_prefix, subjects: strings(b.subjects), includeEvents: b.include_events, watch: strings(b.watch) }));
}
