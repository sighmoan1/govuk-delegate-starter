import assert from 'node:assert/strict';
import { prisma } from '../src/lib/db';
import { reserveVendor } from '../src/lib/vendor-quota';
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.OBSERVATORY_TEST_FIXTURE !== 'true' || !['127.0.0.1', 'localhost', 'observatory-test-db'].includes(url.hostname)) throw new Error('ISOLATED_DATABASE_FIXTURE_REQUIRED');
  const saved = await prisma.experimentAnalysis.findFirst();
  assert(saved, 'Synthetic acceptance must save an analysis first');
  assert.equal((saved.report as { mode: string }).mode, 'synthetic_fixture');
  let refused = false;
  try { await prisma.$executeRaw`UPDATE experiment_analysis SET report = '{}'::jsonb WHERE id = ${saved.id}`; } catch { refused = true; }
  assert(refused, 'SQL update must refuse immutable analysis');
  refused = false;
  try { await prisma.$executeRaw`DELETE FROM experiment_analysis WHERE id = ${saved.id}`; } catch { refused = true; }
  assert(refused, 'SQL delete must refuse immutable analysis');

  let started!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { started = r; }), held = new Promise<void>(r => { release = r; });
  const first = prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(771473) AS locked`;
    assert(rows[0].locked); started(); await held;
  }, { timeout: 10000 });
  try {
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('LOCK_START_TIMEOUT')), 3000))]);
    const second = await prisma.$transaction(tx => tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(771473) AS locked`);
    assert.equal(second[0].locked, false, 'Two independent connections cannot compute simultaneously');
  } finally { release(); await first; }

  // The isolated fixture quota is deliberately reset; this never calls a vendor.
  await prisma.detectorQuota.deleteMany();
  const settings = { enabled: true, key: 'fixture', model: 'fixture', dailyCalls: 2, dailyMicroUsd: 20000, reservationMicroUsd: 10000, minIntervalMs: 1000 };
  assert.equal((await Promise.all(Array.from({ length: 20 }, () => reserveVendor('jev', settings)))).filter(Boolean).length, 1);
  await prisma.detectorQuota.updateMany({ data: { nextAllowedAt: new Date(0) } });
  assert.equal((await Promise.all(Array.from({ length: 20 }, () => reserveVendor('jev', settings)))).filter(Boolean).length, 1);
  await prisma.detectorQuota.updateMany({ data: { nextAllowedAt: new Date(0) } });
  assert.equal(await reserveVendor('jev', settings), false);
  const quota = await prisma.detectorQuota.findFirstOrThrow(); assert.equal(quota.calls, 2); assert.equal(quota.reservedMicroUsd, 20000n);
  console.log('Native SQL immutability, concurrent computation exclusion and durable quota caps passed. No vendor calls.');
}
main().finally(() => prisma.$disconnect());
