import { prisma } from './db';
import type { Vendor, VendorSettings } from './vendor-adapters';
export async function reserveVendor(vendor: Vendor, settings: VendorSettings) {
  const now = new Date(); const id = `${vendor}:${now.toISOString().slice(0, 10)}`;
  await prisma.detectorQuota.createMany({ data: [{ id, calls: 0, reservedMicroUsd: 0n, nextAllowedAt: new Date(0) }], skipDuplicates: true });
  const result = await prisma.detectorQuota.updateMany({ where: { id, calls: { lt: settings.dailyCalls }, reservedMicroUsd: { lte: BigInt(settings.dailyMicroUsd - settings.reservationMicroUsd) }, nextAllowedAt: { lte: now } }, data: { calls: { increment: 1 }, reservedMicroUsd: { increment: BigInt(settings.reservationMicroUsd) }, nextAllowedAt: new Date(now.getTime() + settings.minIntervalMs) } });
  return result.count === 1;
}
