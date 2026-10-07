import type { Decision, Lane, Reason } from "@/generated/prisma";
import { prisma } from "./db";

/** Every check and every failed agent sign-in becomes one event. */
export async function recordActivity(e: {
  lane: Lane;
  decision: Decision;
  reason: Reason;
  capability?: string | null;
  principalId?: string | null;
  delegateId?: string | null;
  authorisationId?: string | null;
  serviceId?: string | null;
  presentedClientId?: string | null;
  requestId?: string;
}) {
  return prisma.activityEvent.create({
    data: {
      requestId: e.requestId ?? crypto.randomUUID(),
      lane: e.lane,
      decision: e.decision,
      reason: e.reason,
      capability: e.capability ?? null,
      principalId: e.principalId ?? null,
      delegateId: e.delegateId ?? null,
      authorisationId: e.authorisationId ?? null,
      serviceId: e.serviceId ?? null,
      presentedClientId: e.presentedClientId ?? null,
    },
  });
}

const HOURS_24 = 24 * 3_600_000;

/**
 * What Delegate can measure: declared agent activity. It sees every agent that
 * identified itself to a service. It does not see traffic that never did.
 */
export async function activitySummary(now = new Date()) {
  const since = new Date(now.getTime() - HOURS_24);
  const events = await prisma.activityEvent.findMany({
    where: { timestamp: { gte: since } },
    include: { principal: true, delegate: true, service: true },
    orderBy: { timestamp: "desc" },
  });
  const declared = events.filter((e) => e.delegateId);
  const unidentified = events.filter((e) => !e.delegateId);

  const by = <K extends string>(rows: typeof events, key: (e: (typeof events)[number]) => K | null) => {
    const m = new Map<K, typeof events>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };

  const perDelegate = [...by(declared, (e) => e.delegate?.name ?? null)].map(([name, rows]) => ({
    name,
    transactions: rows.length,
    principals: new Set(rows.map((r) => r.principalId).filter(Boolean)).size,
    denialRate: rows.filter((r) => r.decision === "DENY").length / rows.length,
  }));
  const perPrincipal = [...by(declared, (e) => e.principal?.displayName ?? null)].map(([name, rows]) => ({ name, transactions: rows.length }));
  const perCapability = [...by(declared, (e) => e.capability)]
    .map(([capability, rows]) => ({ capability, total: rows.length, allowed: rows.filter((r) => r.decision === "ALLOW").length }))
    .sort((a, b) => b.total - a.total);
  const perService = [...by(declared, (e) => e.service?.name ?? null)].map(([name, rows]) => ({ name, transactions: rows.length }));

  return {
    since,
    total: declared.length,
    allowed: declared.filter((e) => e.decision === "ALLOW").length,
    denied: declared.filter((e) => e.decision === "DENY").length,
    authenticatedDelegates: new Set(declared.map((e) => e.delegateId)).size,
    principalsRepresented: new Set(declared.map((e) => e.principalId).filter(Boolean)).size,
    unidentifiedAttempts: unidentified.length,
    perDelegate,
    perPrincipal,
    perCapability,
    perService,
    events: events.slice(0, 100),
  };
}
