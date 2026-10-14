// Explicit owner-run synthetic acceptance. No source-service or vendor requests.
const base = new URL(process.env.OBSERVATORY_URL ?? 'http://127.0.0.1:3303');
if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('HTTPS_REQUIRED');
if (base.username || base.password || base.search || base.hash) throw new Error('INVALID_BASE_URL');
const collection = process.env.OBSERVATORY_COLLECTION_KEY, evaluation = process.env.OBSERVATORY_EVALUATION_KEY;
if (!collection || !evaluation || collection.length < 32 || evaluation.length < 32 || collection === evaluation) throw new Error('DISTINCT_RESEARCH_KEYS_REQUIRED');
async function request(path, headers = {}, body) {
  return fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90_000), redirect: 'error' });
}
const health = await request('/api/health');
if (health.status !== 200 || (await health.json()).database !== 'ready') throw new Error('READINESS_FAILED');
for (const headers of [{}, { 'x-evaluation-key': 'incorrect' }, { 'x-collection-key': collection }]) {
  if ((await request('/api/evaluation/comparisons', headers)).status !== 401) throw new Error('EVALUATION_BOUNDARY_FAILED');
}
if ((await request('/api/monitoring/classifications', { 'x-evaluation-key': evaluation })).status !== 401) throw new Error('COLLECTION_BOUNDARY_FAILED');
const signals = ['signature_verified', 'latency_ms', 'browser_present', 'vendor_verified'];
const corpus = { schema: 'observatory-corpus/1', mode: 'synthetic_fixture', protocol_version: 'hosted-acceptance/1', source_commit: process.env.RESEARCH_SOURCE_COMMIT ?? '0'.repeat(40), rows: Array.from({ length: 100 }, (_, i) => ({ id: `fixture-${i}`, groups: Object.fromEntries(['intent', 'session', 'actor_family', 'scenario_family'].map(k => [k, `${k}-${i}`])), execution_class: i % 2 ? 'AI_AGENT_BROWSER' : 'HUMAN_OPERATED', signals: Object.fromEntries(signals.map((f, j) => [f, { value: j === 1 ? (i * 37) % 900 : j === 2 ? true : Boolean(i % (j === 0 ? 3 : 5)), missingness: 'observed', provenance: 'synthetic_fixture', confidence: null }])) })) };
const created = await request('/api/evaluation/comparisons', { 'x-evaluation-key': evaluation }, corpus);
if (!created.ok || !created.headers.get('cache-control')?.includes('no-store')) throw new Error('COMPARISON_SAVE_FAILED');
const record = await created.json();
if (record.report.mode !== 'synthetic_fixture' || record.report.comparisons.length !== 6) throw new Error('INVALID_COMPARISON_RESULT');
const restored = await request('/api/evaluation/comparisons', { 'x-evaluation-key': evaluation });
if (!restored.ok || !(await restored.json()).some(r => r.id === record.id && r.corpusDigest === record.corpus_digest)) throw new Error('PERSISTENCE_READ_FAILED');
console.log(JSON.stringify({ status: 'passed', checks: ['readiness', 'research-role-isolation', 'private-no-store', 'synthetic-compute-save-read'], synthetic_analysis_id: record.id, corpus_digest: record.corpus_digest, limitations: ['No restart or native database concurrency proof', 'No browser/vendor/participant accuracy evidence'] }));
