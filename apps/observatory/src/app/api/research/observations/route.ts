import { Event, bearerMatches } from "@prototype/research-feed";
import { persistObservation } from "@/lib/ingest-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.PUBLIC_MODE === "true" || process.env.RESEARCH_INGEST_ENABLED !== "true" || !bearerMatches(req, process.env.OBSERVATORY_COLLECTION_KEY))
    return Response.json({ error: "COLLECTION_UNAVAILABLE" }, { status: 403, headers });
  let event;
  try {
    const body = await req.text();
    if (body.length > 16384) throw new Error("TOO_LARGE");
    event = Event.parse(JSON.parse(body));
    if (event.source_service !== "hmrc" || !event.source_event_id.startsWith("sensor:") || event.event_kind !== "browser_sensor" || event.outcome.decision !== "OBSERVED" || !event.occurred_at.value)
      throw new Error("INVALID_SENSOR_ENVELOPE");
  } catch { return Response.json({ error: "INVALID_OBSERVATION" }, { status: 400, headers }); }
  try {
    const inserted = await persistObservation(event);
    return Response.json({ source_event_id: event.source_event_id, inserted: inserted === 1 }, { status: inserted ? 201 : 200, headers });
  } catch { return Response.json({ error: "COLLECTION_UNAVAILABLE" }, { status: 503, headers }); }
}
