import { prisma } from "@/lib/db";
import { Event, feedAccess, feedQuery, known, missing, nextCursor, pseudonym, runId } from "@prototype/research-feed";
export const dynamic = "force-dynamic";

// One-way export only. Nothing here calls Observatory or enters service decisions.
export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!feedAccess(req)) return Response.json({ error: "RESEARCH_FEED_UNAVAILABLE" }, { status: 403, headers });
  let query;
  try { query = feedQuery(req, "delegate"); }
  catch { return Response.json({ error: "INVALID_QUERY" }, { status: 400, headers }); }
  try {
    const rows = await prisma.activityEvent.findMany({ where: query.after ? { id: { gt: query.after } } : undefined,
      orderBy: { id: "asc" }, take: query.limit + 1,
      select: { id: true, timestamp: true, lane: true, decision: true, requestId: true } });
    const selected = rows.slice(0, query.limit);
    const key = process.env.RESEARCH_PSEUDONYM_KEY!;
    const events = selected.map(row => Event.parse({ event_kind: "authority_check", schema_version: 1, source_service: "delegate", source_event_id: row.id,
      occurred_at: { value: row.timestamp.toISOString(), status: "known", provenance: "source_clock" },
      run_id: missing(),
      correlation: { request_id: known(row.requestId), transaction_id: missing(), session_id: missing(), delegate_check_id: known(row.id) },
      observed: { lane: row.lane, signature_verified: missing(), latency_ms: missing() },
      outcome: { decision: row.decision, outcome_class: missing(), cost_class: missing() },
      browser_sensor: { status: "missing", provenance: "not_collected" },
    }));
    return Response.json({ schema_version: 1, source_service: "delegate", events,
      next_cursor: rows.length > query.limit ? nextCursor("delegate", selected[selected.length - 1].id) : null }, { headers });
  } catch { return Response.json({ error: "RESEARCH_FEED_UNAVAILABLE" }, { status: 503, headers }); }
}
