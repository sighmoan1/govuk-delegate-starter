// Run with TSX_TSCONFIG_PATH=apps/delegate/tsconfig.json node --import tsx; imports citizen fixture code only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { LocalAuthority } from './local-authority.mjs';

const arm = process.env.E2_ARM;
if (!['B', 'C'].includes(arm)) throw new Error('Set E2_ARM=B or C');
for (const name of ['DATABASE_URL', 'E2_HMRC_DATABASE_URL', 'HMRC_SERVICE_KEY', 'E2_SOURCE_SHA', 'E2_CONFIG_ID']) if (!process.env[name]) throw new Error(`${name} required`);
if (process.env.DATABASE_URL === process.env.E2_HMRC_DATABASE_URL) throw new Error('Separate Delegate and HMRC databases required');
if (!/^[a-f0-9]{40}$/.test(process.env.E2_SOURCE_SHA)) throw new Error('E2_SOURCE_SHA must be full pinned source SHA');
const hmrc = process.env.E2_HMRC_URL ?? 'http://127.0.0.1:3302';
if (!['localhost', '127.0.0.1'].includes(new URL(hmrc).hostname)) throw new Error('Only local synthetic deployments permitted');
const repeats = Number(process.env.E2_REPEATS ?? 5); const seed = process.env.E2_SEED ?? '20261009';
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 50) throw new Error('E2_REPEATS: integer 1..50');
const runId = `RUN-${new Date().toISOString().slice(0,10).replaceAll('-','')}-E2-${arm}-${randomUUID().slice(0,8)}`;
const out = resolve(process.env.E2_OUTPUT ?? '.e2-runs', runId); mkdirSync(out, { recursive: true });
const record = { run_id: runId, experiment_id: 'E2', protocol_version: '0.1-harness.1', arm, started_at: new Date().toISOString(),
  source_sha: process.env.E2_SOURCE_SHA, local_git_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  config_id: process.env.E2_CONFIG_ID, seed, repeats, workload: ['read-status','authorised-claim','same-claim-retry','permitted-follow-up','forbidden-action','revocation-mid-workflow'],
  model: 'deterministic HTTP fixture, no model', human_effort: { measured: false, interventions: null, consent_seconds: null, assistance_steps: null },
  limitations: ['Synthetic fixtures replace citizen sign-in and consent in both arms; human effort is unmeasured.', 'A human-facing baseline, provider handoff, disputes and consequential step-up are excluded.', 'No financial costs or population confidence intervals; small descriptive technical run.', 'B uses HMRC-owned local authority process and SQLite; C uses Delegate and PostgreSQL; latency conflates storage/runtime topology.', 'Fresh subjects isolate business state, but process-wide traffic counters require a clean HMRC restart per arm.', 'config_id is operator-attested; reviewer must verify identical build, throughput and domain settings.'],
  attempts: [], checks: [], state: [], status: 'failed' };
let local; let delegateDb; let hmrcDb; let citizenDb;
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  const { PrismaClient: D } = await import('../../apps/delegate/src/generated/prisma/index.js');
  const { PrismaClient: H } = await import('../../apps/hmrc/src/generated/prisma/index.js');
  delegateDb = new D({ datasources: { db: { url: process.env.DATABASE_URL } } });
  hmrcDb = new H({ datasources: { db: { url: process.env.E2_HMRC_DATABASE_URL } } });
  await Promise.all([delegateDb.$connect(), hmrcDb.$connect()]);
  const requests = arm === 'C' ? await import('../../apps/delegate/src/lib/requests.ts') : null;
  const auth = arm === 'C' ? await import('../../apps/delegate/src/lib/agent-auth.ts') : null;
  if (arm === 'C') citizenDb = (await import('../../apps/delegate/src/lib/db.ts')).prisma;
  if (arm === 'B') { local = new LocalAuthority(resolve(out, 'authority.sqlite'), { serviceKey: process.env.HMRC_SERVICE_KEY }); await local.listen(Number(process.env.E2_LOCAL_AUTHORITY_PORT ?? 3310)); }
  const caps = ['view_claim_status','claim_job_expenses','respond_to_query'];
  const agent = arm === 'B' ? local.registerAgent() : await delegateDb.delegate.findUniqueOrThrow({ where: { clientId: process.env.DEMO_AGENT_CLIENT_ID ?? 'demo-personal-agent' } });
  const token = arm === 'B' ? agent.token : await auth.signAgentToken(agent.id, agent.clientId);
  for (let i = 0; i < repeats; i++) {
    const subject = `urn:e2:${runId}:${seed}:${i}`;
    const principal = await delegateDb.principal.create({ data: { oneLoginSubjectId: subject, displayName: 'E2 synthetic citizen' } });
    let grant;
    if (arm === 'B') grant = local.approve({ principal: principal.id, subject, agent: agent.id, capabilities: caps });
    else { const req = await requests.createRequest({ delegateId: agent.id, service: 'hmrc-personal-tax', capabilities: caps }); grant = (await requests.approveRequest(req.id, principal.id, caps)).id; }
    const headers = { authorization: `Bearer ${token}`, 'x-principal-id': principal.id, 'content-type': 'application/json', 'x-run-tag': runId };
    const send = async (task, path, body, extra = {}) => {
      const started = performance.now(); const requestId = `${runId}:${i}:${task}`;
      try {
        const res = await fetch(`${hmrc}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'x-request-id': requestId, ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const json = await res.json(); const a = { request_id: requestId, intent_id: `${seed}:${i}:${task === 'retry' ? 'claim' : task}`, task, status: res.status, ms: performance.now() - started, response: json };
        record.attempts.push(a); return a;
      } catch (e) { const a = { request_id: requestId, intent_id: `${seed}:${i}:${task}`, task, status: 0, ms: performance.now() - started, error: e.message }; record.attempts.push(a); return a; }
    };
    const check = (name, ok) => record.checks.push({ repeat: i, name, ok: Boolean(ok) });
    const read = await send('read', '/api/claims');
    const before = await hmrcDb.claim.count({ where: { taxpayer: { oneLoginSubject: subject } } });
    check('authorised status read', read.status === 200 && Array.isArray(read.response?.result?.claims) && read.response.result.claims.length === before);
    const key = `e2-${seed}-${i}-claim`;
    const submission = await send('claim', '/api/job-expenses', {}, { prefer: 'respond-async', 'idempotency-key': key });
    let tx = await hmrcDb.transaction.findFirst({ where: { subject } });
    check('durable submission verified independently', submission.status === 202 && tx?.id === submission.response?.result?.transaction_id);
    const duplicate = await send('retry', '/api/job-expenses', {}, { prefer: 'respond-async', 'idempotency-key': key });
    check('same-intent retry converges', duplicate.status === 202 && duplicate.response?.result?.transaction_id === tx?.id);
    const deadline = Date.now() + 30000;
    while (tx && !['COMPLETED','FAILED'].includes(tx.status) && Date.now() < deadline) { await new Promise(r => setTimeout(r, 200)); tx = await hmrcDb.transaction.findUnique({ where: { id: tx.id } }); }
    const taxpayer = await hmrcDb.taxpayer.findUnique({ where: { oneLoginSubject: subject } });
    const claims = taxpayer ? await hmrcDb.claim.findMany({ where: { taxpayerId: taxpayer.id } }) : [];
    check('one completed business claim', tx?.status === 'COMPLETED' && claims.filter(c => c.kind === 'job_expenses').length === 1);
    if (claims[0]) {
      const query = await hmrcDb.claimQuery.create({ data: { claimId: claims[0].id, question: 'Synthetic E2 follow-up' } });
      await send('followup', '/api/claims/respond', { query_id: query.id, answer: 'Synthetic answer approved in fixture', confirmed_by_person: true }, { 'idempotency-key': `${key}-answer` });
      const answered = await hmrcDb.claimQuery.findUnique({ where: { id: query.id } });
      check('follow-up independently recorded with receipt', answered?.status === 'ANSWERED' && answered?.confirmedByPerson && answered?.receiptId);
    } else check('follow-up independently recorded with receipt', false);
    const forbidden = await send('forbidden', '/api/employment', { details: 'Unauthorised synthetic change' }, { 'idempotency-key': `${key}-forbidden` });
    check('forbidden operation refused', forbidden.status === 403);
    if (arm === 'B') local.revoke(grant, principal.id); else await requests.revokeAuthorisation(grant, principal.id);
    const revoked = await send('revoked', '/api/job-expenses', { evidence: 'Synthetic new evidence' }, { prefer: 'respond-async', 'idempotency-key': `${key}-revoked` });
    check('revoked operation refused', revoked.status === 403);
    const finalClaims = taxpayer ? await hmrcDb.claim.findMany({ where: { taxpayerId: taxpayer.id } }) : [];
    const transactions = await hmrcDb.transaction.findMany({ where: { subject } });
    check('no unauthorised or duplicate business effects', finalClaims.length === 1 && finalClaims[0].kind === 'job_expenses' && transactions.length === 1);
    const permission = arm === 'B' ? local.db.prepare('SELECT id,principal,caps,expires,revoked FROM grants WHERE id=?').get(grant) : await delegateDb.authorisation.findUnique({ where: { id: grant }, include: { permissions: true } });
    check('citizen revocation persisted', arm === 'B' ? permission?.revoked != null : permission?.status === 'REVOKED');
    record.state.push({ repeat: i, subject, permission, claims: finalClaims, transactions, queries: taxpayer ? await hmrcDb.claimQuery.findMany({ where: { claim: { taxpayerId: taxpayer.id } } }) : [] });
  }
  record.service_events = await hmrcDb.serviceEvent.findMany({ where: { runTag: runId } });
  if (arm === 'B') { record.authority_events = local.logs(); if (!record.authority_events.some(e => e.kind === 'authority_check')) throw new Error('HMRC did not call B authority: deployment wiring invalid'); }
  else record.authority_events = await delegateDb.activityEvent.findMany({ where: { principalId: { in: (await delegateDb.principal.findMany({ where: { oneLoginSubjectId: { startsWith: `urn:e2:${runId}:` } } })).map(p => p.id) } } });
  record.status = record.checks.every(c => c.ok) ? 'completed' : 'failed';
} catch (e) { record.error = e.message; }
finally {
  record.finished_at = new Date().toISOString();
  const ms = record.attempts.map(a => a.ms).sort((a,b) => a-b);
  record.summary = { planned_distinct_legitimate_intents: repeats * 3, attempted_distinct_legitimate_intents: new Set(record.attempts.filter(a => ['read','claim','retry','followup'].includes(a.task)).map(a => a.intent_id)).size, durably_accepted_legitimate_claim_intents: record.checks.filter(c => c.name === 'durable submission verified independently' && c.ok).length, correctly_completed_legitimate_intents: record.checks.filter(c => ['authorised status read','one completed business claim','follow-up independently recorded with receipt'].includes(c.name) && c.ok).length, unauthorised_business_effects: record.state.reduce((n,s) => n + s.claims.filter(c => c.kind !== 'job_expenses').length + Math.max(0,s.transactions.length-1),0), duplicate_claim_effects: record.state.reduce((n,s) => n + Math.max(0,s.claims.filter(c => c.kind === 'job_expenses').length-1),0), business_effect_verification_complete: record.state.length === repeats, correctly_completed_fixture_groups: record.state.filter(s => record.checks.filter(c => c.repeat === s.repeat).every(c => c.ok)).length,
    requests: record.attempts.length, p50_request_ms: ms.length ? ms[Math.ceil(ms.length*.5)-1] : null, p95_request_ms: ms.length ? ms[Math.ceil(ms.length*.95)-1] : null,
    technical_work_proxy: 'Raw HTTP attempts, ServiceEvent costClass and authority event counts; not financial costs' };
  const raw = JSON.stringify(record, null, 2); writeFileSync(resolve(out, 'run.json'), raw); writeFileSync(resolve(out, 'SHA256SUMS'), `${hash(raw)}  run.json\n`);
  console.log(JSON.stringify({ run_id: runId, status: record.status, output: out, error: record.error }));
  await Promise.allSettled([delegateDb?.$disconnect(), hmrcDb?.$disconnect(), citizenDb?.$disconnect(), local?.close()]);
  if (record.status !== 'completed') process.exitCode = 1;
}
