import { feedAccess, feedQuery, nextCursor, Page, whenisbinsObservation, type WhenIsBinsObservationInput } from '@prototype/research-feed';
import type { Store, Event } from './store.js';

const source = 'whenisbins_connector' as const;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

// Optional read-side export. The operational connector never calls Observatory.
export function createResearchFeed(store: Store, env: NodeJS.ProcessEnv = process.env) {
 return async (request: Request): Promise<Response> => {
  if (!feedAccess(request, env)) return Response.json({ error: 'RESEARCH_FEED_UNAVAILABLE' }, { status: 403, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  let query: ReturnType<typeof feedQuery>;
  try { query = feedQuery(request, source); }
  catch { return Response.json({ error: 'INVALID_RESEARCH_QUERY' }, { status: 400, headers }); }
  try {
   const snapshot = await store.snapshot();
   // Source UUIDs are random; pagination follows durable append order, never lexical or clock order.
   const anchor = query.after ? snapshot.events.findIndex(event => event.sourceEventId === query.after) : -1;
   if (query.after && anchor === -1) return Response.json({ error: 'RESEARCH_CURSOR_NOT_FOUND' }, { status: 409, headers });
   const start = anchor + 1;
   const selected = snapshot.events.slice(start, start + query.limit);
   const events = selected.map(event => project(event, env.RESEARCH_PSEUDONYM_KEY!));
   const next = start + selected.length < snapshot.events.length && selected.length ? nextCursor(source, selected[selected.length - 1].sourceEventId) : null;
   // EOF resets the collector scan. Source/event uniqueness absorbs rescans and late arrivals.
   const page = Page.parse({ schema_version: 2, source_service: source, events, next_cursor: next });
   return request.method === 'HEAD' ? new Response(null, { headers: { ...headers, 'Content-Type': 'application/json' } }) : Response.json(page, { headers });
  } catch { return Response.json({ error: 'RESEARCH_FEED_UNAVAILABLE' }, { status: 503, headers }); }
 };
}

function project(event: Event, key: string) {
 const input: WhenIsBinsObservationInput = {
  sourceEventId: event.sourceEventId, occurredAt: event.occurredAt,
  action: event.action, stage: event.stage as WhenIsBinsObservationInput['stage'], decision: event.decision as WhenIsBinsObservationInput['decision'],
  requestId: event.requestId, delegateCheckId: event.delegateCheckId, taskId: event.taskId,
  occurrenceId: event.occurrenceId, outboundCallId: event.outboundCallId, effectId: event.effectId,
  authorityVerified: (event as Event & { authorityVerified?: boolean }).authorityVerified,
  upstreamAgentDeclared: event.upstreamAgentDeclared, latencyMs: event.latencyMs,
  outcomeClass: event.outcomeClass as WhenIsBinsObservationInput['outcomeClass'], costClass: event.costClass as WhenIsBinsObservationInput['costClass'],
 };
 return whenisbinsObservation(input, key);
}
