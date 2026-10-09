// Protected, read-only replay of actual E2 archived source traces. It never submits HMRC transactions.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const missing = () => ({ value: null, status: 'missing', provenance: 'not_recorded' });
const known = value => value == null ? missing() : ({ value, status: 'known', provenance: 'source_record' });
export function readVerifiedTrace(path, expected) {
  let bytes = readFileSync(path); if (path.endsWith('.gz')) bytes = gunzipSync(bytes);
  if (digest(bytes) !== expected) throw new Error('TRACE_DIGEST_MISMATCH');
  const record = JSON.parse(bytes);
  if (record.model !== 'deterministic HTTP fixture, no model' || record.status !== 'completed' || !record.checks?.every(c => c.ok)) throw new Error('NOT_A_VERIFIED_SCRIPTED_E2_TRACE');
  // Independently verify actual durable/business effects before counting them or attesting execution.
  for (const state of record.state) {
    if (state.claims.length !== 1 || state.claims[0].kind !== 'job_expenses' || state.transactions.length !== 1 || state.transactions[0].status !== 'COMPLETED' || state.transactions[0].claimReference !== state.claims[0].reference || !state.queries.some(q => q.status === 'ANSWERED' && q.confirmedByPerson && q.receiptId)) throw new Error('INDEPENDENT_BUSINESS_STATE_INVALID');
  }
  return record;
}
export function sourcePage(record, source) {
  const rows = source === 'hmrc' ? record.service_events : record.arm === 'C' ? record.authority_events : [];
  return { schema_version: 1, source_service: source, next_cursor: null, events: rows.map(e => ({
    schema_version: 1, source_service: source, source_event_id: e.id, event_kind: source === 'hmrc' ? 'service_request' : 'authority_check',
    occurred_at: { value: new Date(e.timestamp).toISOString(), status: 'known', provenance: 'source_clock' },
    run_id: missing(), // Historic human-readable E2 tags are suppressed; protected ID binding supplies lineage.
    correlation: { request_id: source === 'delegate' ? known(e.requestId) : missing(), transaction_id: missing(), session_id: missing(), delegate_check_id: source === 'hmrc' ? known(e.delegateCheckId) : missing() },
    observed: { lane: e.lane, signature_verified: e.signatureResult ? known(e.signatureResult === 'verified') : missing(), latency_ms: known(e.latencyMs) },
    outcome: { decision: e.outcome ?? e.decision, outcome_class: known(e.outcomeClass), cost_class: known(e.costClass) },
    browser_sensor: { status: 'not_run', provenance: 'not_collected' },
  })) };
}
export const taskOf = event => event.capability === 'view_claim_status' ? 'read' : event.capability === 'respond_to_query' ? 'followup' : event.capability === 'update_employment' ? 'forbidden' : event.capability === 'claim_job_expenses' ? event.reason === 'AUTHORISATION_REVOKED' ? 'revoked' : 'claim' : null;
export function effectOf(event) {
  if (['REFUSED','THROTTLED','CHALLENGED'].includes(event.outcome)) return 'REFUSAL';
  if (event.outcomeClass === 'REPLAY') return 'REPLAY';
  return event.outcomeClass === 'UNIQUE_OPERATION' && event.costClass === 'write' ? 'UNIQUE_OPERATION' : 'REQUEST_ONLY';
}
export async function importTrace(record, expected, api, owner) {
  const run = await api('/api/evaluation/runs', { mode: 'CONTROLLED', protocol_version: '0.1', source_commit: record.source_sha, seed: record.seed, study_owner: owner, evidence_digest: expected });
  if (run.replayed && run.status === 'COMPLETED') return { run_id: run.id, replayed: true };
  if (run.replayed) throw new Error('INCOMPLETE_IMPORT_REQUIRES_EXPLICIT_DELETE_AND_REPLAY');
  for (const source of ['hmrc','delegate']) {
    const page = sourcePage(record, source); if (page.events.length) await api('/api/evaluation/source-replay', { trace_digest: expected, page });
  }
  let attempts=0, bindings=0;
  for (const state of record.state) {
    const mine = record.service_events.filter(e => e.subject === state.subject);
    for (const task of ['read','claim','followup','forbidden','revoked']) {
      const events = mine.filter(e => taskOf(e) === task); if (!events.length) throw new Error('MISSING_SOURCE_TASK');
      const attempt = await api('/api/evaluation/attempts', { run_id: run.id }); attempts++;
      await api(`/api/evaluation/attempts/${attempt.id}/verify`, { origin: 'CONTROLLED_RUNNER', execution_class: 'SCRIPTED_AUTOMATION', trace_digest: expected, source_commit: record.source_sha, runner: 'e2-fixed-http-v1', observed_at: record.finished_at });
      const operation = randomUUID();
      for (const event of events) {
        const effect = effectOf(event);
        await api('/api/evaluation/bindings', { attempt_id: attempt.id, source_service: 'hmrc', source_event_id: event.id, effect_class: effect, ...(['UNIQUE_OPERATION','REPLAY'].includes(effect) ? { operation_id: operation, effect_evidence_digest: expected } : {}) }); bindings++;
        const check = record.arm === 'C' ? record.authority_events.find(c => c.id === event.delegateCheckId) : null;
        if (check) { await api('/api/evaluation/bindings', { attempt_id: attempt.id, source_service: 'delegate', source_event_id: check.id, effect_class: 'REQUEST_ONLY' }); bindings++; }
      }
    }
  }
  await api(`/api/evaluation/runs/${run.id}/complete`, { expected_attempts: attempts });
  return { run_id: run.id, attempts, bindings, execution_class: 'SCRIPTED_AUTOMATION', trace_digest: expected };
}
if (process.argv[1]?.endsWith('import-e2.mjs')) {
  const [path, expected] = process.argv.slice(2);
  if (!path || !/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('Usage: node scripts/observatory/import-e2.mjs run.json[.gz] ORIGINAL_SHA256');
  const base = process.env.OBSERVATORY_URL ?? 'http://127.0.0.1:3303';
  if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local research only');
  const key = process.env.OBSERVATORY_EVALUATION_KEY; if (!key || !process.env.RESEARCH_STUDY_OWNER) throw new Error('Evaluator key and study owner required');
  const api = async (path, body) => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-evaluation-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.json()).error}`); return res.json();
  };
  console.log(JSON.stringify(await importTrace(readVerifiedTrace(path, expected), expected, api, process.env.RESEARCH_STUDY_OWNER)));
}
