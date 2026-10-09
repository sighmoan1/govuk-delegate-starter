import { readFileSync } from 'node:fs';
const [bPath, cPath] = process.argv.slice(2);
if (!bPath || !cPath) throw new Error('Usage: node scripts/e2/compare.mjs B/run.json C/run.json');
const b = JSON.parse(readFileSync(bPath, 'utf8')); const c = JSON.parse(readFileSync(cPath, 'utf8'));
if (b.arm !== 'B' || c.arm !== 'C') throw new Error('Provide B then C');
for (const field of ['source_sha', 'config_id', 'seed', 'repeats', 'protocol_version']) if (b[field] !== c[field]) throw new Error(`Unmatched ${field}; comparison refused`);
if (JSON.stringify(b.workload) !== JSON.stringify(c.workload)) throw new Error('Unmatched workload');
console.log(JSON.stringify({ experiment: 'E2', status: b.status === 'completed' && c.status === 'completed' ? 'descriptive technical comparison' : 'failed/inconclusive',
  runs: { B: b.run_id, C: c.run_id }, outcomes: { B: b.summary, C: c.summary },
  differences_C_minus_B: { requests: c.summary.requests - b.summary.requests, p50_request_ms: b.summary.p50_request_ms === null || c.summary.p50_request_ms === null ? null : c.summary.p50_request_ms - b.summary.p50_request_ms, p95_request_ms: b.summary.p95_request_ms === null || c.summary.p95_request_ms === null ? null : c.summary.p95_request_ms - b.summary.p95_request_ms },
  human_effort: 'Unmeasured: fixture consent cannot establish citizen effort or a control benefit.',
  interpretation: 'No claim of incremental product benefit, cost saving, or population effect follows from this technical comparison. Runtime/storage topology differs. Publish both complete records and all failed checks.', limitations: [...new Set([...b.limitations, ...c.limitations])] }, null, 2));
