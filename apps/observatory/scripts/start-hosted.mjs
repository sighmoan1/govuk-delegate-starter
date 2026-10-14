import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateHosted(env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_CONFIGURATION_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('POSTGRES_CONFIGURATION_REQUIRED');
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!local && !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) throw new Error('DATABASE_TLS_REQUIRED');
  for (const key of ['OBSERVATORY_COLLECTION_KEY', 'OBSERVATORY_EVALUATION_KEY']) {
    if (!env[key] || env[key].length < 32 || /synthetic|fixture|development|dev-/.test(env[key])) throw new Error('STRONG_RESEARCH_KEYS_REQUIRED');
  }
  if (env.OBSERVATORY_COLLECTION_KEY === env.OBSERVATORY_EVALUATION_KEY) throw new Error('DISTINCT_RESEARCH_KEYS_REQUIRED');
  if (env.PUBLIC_MODE === 'true') throw new Error('PUBLIC_MODE_DISALLOWS_RESEARCH');
  const port = Number(env.PORT ?? 3303);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
  return port;
}

function main() {
  let port;
  try { port = validateHosted(process.env); }
  catch (e) { console.error(e.message); process.exit(1); }
  const python = process.env.OBSERVATORY_PYTHON ?? 'python3';
  const check = spawnSync(python, ['-c', 'import numpy, sklearn; import models, evaluation, workbench'], { cwd: resolve('research'), env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }, stdio: 'ignore' });
  if (check.status !== 0) { console.error('RESEARCH_PYTHON_RUNTIME_REQUIRED'); process.exit(1); }
  // Additive migrations only: no seed, reset, volume removal or credential rotation.
  if (spawnSync('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit' }).status !== 0) process.exit(1);
  const web = spawn('npm', ['exec', '--', 'next', 'start', '-H', '0.0.0.0', '-p', String(port)], { stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => web.kill(signal));
  web.on('error', () => { console.error('RESEARCH_SERVER_START_FAILED'); process.exit(1); });
  web.on('exit', code => process.exit(code ?? 0));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
