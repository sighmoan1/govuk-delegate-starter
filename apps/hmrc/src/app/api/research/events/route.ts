import { prisma } from "@/lib/db";
import { Event, feedAccess, feedQuery, known, missing, nextCursor, pseudonym, runId } from "@prototype/research-feed";
export const dynamic = "force-dynamic";

// One-way export only. Nothing here calls Observatory or enters service decisions.
export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!feedAccess(req)) return Response.json({ error: "RESEARCH_FEED_UNAVAILABLE" }, { status: 403, headers });
  let query;
  try { query = feedQuery(req, "hmrc"); }
  catch { return Response.json({ error: "INVALID_QUERY" }, { status: 400, headers }); }
  try {
    const rows = await prisma.serviceEvent.findMany({ where: query.after ? { id: { gt: query.after } } : undefined,
      orderBy: { id: "asc" }, take: query.limit + 1,
      select: { id: true, timestamp: true, lane: true, outcome: true, outcomeClass: true, costClass: true, latencyMs: true, signatureResult: true, runTag: true, sessionId: true, delegateCheckId: true } });
    const selected = rows.slice(0, query.limit);
    const key = process.env.RESEARCH_PSEUDONYM_KEY!;
    const events = selected.map(row => Event.parse({ event_kind: "service_request", schema_version: 1, source_service: "hmrc", source_event_id: row.id,
      occurred_at: { value: row.timestamp.toISOString(), status: "known", provenance: "source_clock" },
      run_id: runId("hmrc", row.runTag, key),
      correlation: { request_id: missing(), transaction_id: missing(), session_id: pseudonym("hmrc", "session", row.sessionId, key), delegate_check_id: known(row.delegateCheckId) },
      observed: { lane: row.lane, signature_verified: row.signatureResult ? known(row.signatureResult === "verified") : missing(), latency_ms: known(row.latencyMs) },
      outcome: { decision: row.outcome, outcome_class: known(row.outcomeClass), cost_class: known(row.costClass) },
      browser_sensor: { status: "missing", provenance: "not_collected" },
    }));
    return Response.json({ schema_version: 1, source_service: "hmrc", events,
      next_cursor: rows.length > query.limit ? nextCursor("hmrc", selected[selected.length - 1].id) : null }, { headers });
  } catch { return Response.json({ error: "RESEARCH_FEED_UNAVAILABLE" }, { status: 503, headers }); }
}
