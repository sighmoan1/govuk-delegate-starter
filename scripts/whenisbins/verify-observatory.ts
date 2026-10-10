import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Page, WhenIsBinsEvent } from '../../packages/research-feed/src/index';
import { pullSource } from '../../apps/observatory/src/lib/ingestion';
import { ingestStore } from '../../apps/observatory/src/lib/ingest-store';
import { prisma } from '../../apps/observatory/src/lib/db';
import { createRun, createAttempt, bindEvent } from '../../apps/observatory/src/lib/research-store';

// Run with the Observatory tsconfig and private isolated-stack environment. No reset or live provider request.
let verificationStep = "private configuration";
async function main() {
const source = 'whenisbins_connector' as const;
const feed = process.env.WHENISBINS_CONNECTOR_RESEARCH_FEED_URL;
const key = process.env.WHENISBINS_CONNECTOR_RESEARCH_FEED_KEY;
const ui = process.env.OBSERVATORY_UI_URL || 'http://127.0.0.1:5703';
assert(feed && key, 'Private source feed URL/key required');
assert(['localhost', '127.0.0.1'].includes(new URL(feed).hostname), 'Acceptance requires an isolated local connector');
assert(['localhost', '127.0.0.1'].includes(new URL(ui).hostname), 'Acceptance requires an isolated local Observatory');
assert(process.env.PUBLIC_MODE !== 'true');
assert(process.env.RESEARCH_INGEST_ENABLED === 'true');
const input = { source, url: feed, key, store: ingestStore };

try {
 verificationStep = 'source feed authentication and capture';
 const unauthorised = await fetch(feed); assert.equal(unauthorised.status, 403);
 const upstream = await fetch(feed, { headers: { Authorization: `Bearer ${key}` } }); assert.equal(upstream.status, 200);
 const captured = Page.parse(await upstream.json()); assert.equal(captured.schema_version, 2); assert.equal(captured.source_service, source); assert(captured.events.length, 'Run synthetic journeys before Observatory acceptance');
 const ids = captured.events.map(e => e.source_event_id);
 const before = await prisma.observedEvent.findMany({ where: { sourceService: source, sourceEventId: { in: ids } }, select: { sourceEventId: true } });
 verificationStep = 'actual HTTP source ingestion into PostgreSQL';
 const first = await pullSource(input); assert(first.complete, 'Actual feed scan must reach EOF');
 const rows = await prisma.observedEvent.findMany({ where: { sourceService: source, sourceEventId: { in: ids } }, select: { sourceEventId: true, snapshot: true } });
 assert.equal(rows.length, ids.length);
 for (const row of rows) {
  const parsed = WhenIsBinsEvent.parse(row.snapshot); assert.equal(parsed.source_event_id, row.sourceEventId);
  assert.equal(parsed.browser_sensor.status, 'not_run'); assert.equal(parsed.browser_sensor.provenance, 'not_collected');
  const encoded = JSON.stringify(parsed); assert(!/@|https?:\/\/|property_token|stop_link|access_token|execution_class|ground_truth|email_address/.test(encoded), 'Minimised snapshot leaked raw data or truth');
  for (const field of Object.values(parsed.correlation)) if (field.value !== null) { assert.match(field.value, /^[0-9a-f]{64}$/); assert.equal(field.provenance, 'pseudonymised'); }
 }
 // Restart the actual Prisma connection; rows/cursor must remain in PostgreSQL.
 verificationStep = 'SQL connection restart and frozen-source deduplication';
 const committedCursor = await ingestStore.cursor(source); await prisma.$disconnect();
 assert.deepEqual(await ingestStore.cursor(source), committedCursor);
 assert.equal(await prisma.observedEvent.count({ where: { sourceService: source, sourceEventId: { in: ids } } }), ids.length);
 const frozen = { ...captured, next_cursor: null };
 const replay = await pullSource({ ...input, fetcher: (async () => Response.json(frozen)) as typeof fetch }); assert.equal(replay.inserted, 0);
 verificationStep = 'failure/source isolation cursor retention';
 const cursor = await ingestStore.cursor(source);
 await assert.rejects(pullSource({ ...input, fetcher: (async () => new Response(null, { status: 503 })) as typeof fetch }), /SOURCE_UNAVAILABLE/);
 assert.deepEqual(await ingestStore.cursor(source), cursor);
 await assert.rejects(pullSource({ ...input, source: 'hmrc', fetcher: (async () => Response.json(frozen)) as typeof fetch }), /SOURCE_MISMATCH/);
 assert.deepEqual(await ingestStore.cursor(source), cursor);
 // Monitoring has no execution truth. Do not invent a label for another runner's real journey.
 verificationStep = 'protected unlabelled exact request-only binding';
 const run = await createRun({ mode: 'MONITORING', protocol_version: 'whenisbins-observatory-sql-v1', source_commit: process.env.WHENISBINS_TEST_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), seed: randomUUID(), study_owner: 'isolated-sql-verifier' });
 const attempt = await createAttempt({ run_id: run.id }); assert.equal(attempt.status, 'UNLABELLED');
 // Select a previously unbound source record so repeat verifier runs do not take over another binding.
 const alreadyBound = await prisma.researchBinding.findMany({ where: { sourceService: source, sourceEventId: { in: ids } }, select: { sourceEventId: true } });
 const boundIds = new Set(alreadyBound.map(row => row.sourceEventId)); const bindId = ids.find(id => !boundIds.has(id));
 assert(bindId, 'Need an unbound synthetic source event for a new acceptance run');
 const binding = await bindEvent({ attempt_id: attempt.id, source_service: source, source_event_id: bindId, effect_class: 'REQUEST_ONLY' }); assert.equal(binding.effectClass, 'REQUEST_ONLY');
 const duplicate = await bindEvent({ attempt_id: attempt.id, source_service: source, source_event_id: bindId, effect_class: 'REQUEST_ONLY' }); assert.equal(duplicate.id, binding.id);
 await assert.rejects(bindEvent({ attempt_id: attempt.id, source_service: source, source_event_id: bindId, effect_class: 'UNIQUE_OPERATION', operation_id: randomUUID() }), /SOURCE_EFFECT_CLASS_MISMATCH/);
 assert.equal((await prisma.researchAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).executionClass, null);
 verificationStep = 'private HTTP monitoring gate and truth isolation';
 const deniedView = await fetch(`${ui}/api/monitoring/whenisbins`); assert.equal(deniedView.status, 401);
 const view = await fetch(`${ui}/api/monitoring/whenisbins`, { headers: { 'x-collection-key': process.env.OBSERVATORY_COLLECTION_KEY! } }); assert.equal(view.status, 200);
 const report = await view.json(); assert.equal(report.source, source); assert(report.events.every((e: { source_service: string }) => e.source_service === source));
 assert(!JSON.stringify(report).includes('execution_class')); assert(!JSON.stringify(report).includes('UNLABELLED')); assert(!JSON.stringify(report).includes(run.id));
 verificationStep = 'journey action coverage';
 const actions = [...new Set(captured.events.map(e => WhenIsBinsEvent.parse(e).whenisbins.action))];
 for (const action of ['lookup', 'email_signup', 'email_cancel', 'schedule']) assert(actions.includes(action as typeof actions[number]), `Missing journey action ${action}`);
 console.log(JSON.stringify({ passed: true, actual_source_events_checked: ids.length, new_rows_among_captured: ids.length - before.length, actual_pull_inserted: first.inserted, frozen_replay_inserted: replay.inserted, sql_restart_retained: true, failure_cursor_retained: true, monitoring_source_isolated: true, monitoring_execution_truth_absent: true, exact_request_only_binding: true, observed_actions: actions, counts: report.counts, limitation: 'Isolated fixture journeys and ingestion acceptance, not real WhenIsBins visitors or AI accuracy evidence.' }, null, 2));
} finally { await prisma.$disconnect(); }

}
main().catch(error => { console.error(JSON.stringify({ passed: false, step: verificationStep, error_type: error instanceof Error ? error.name : "unknown", limitation: "No operational reset performed; private error payload withheld." })); process.exitCode = 1; });
