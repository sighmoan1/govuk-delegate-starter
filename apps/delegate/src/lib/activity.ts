import type { Decision, Lane, Reason } from "@/generated/prisma";
import { prisma } from "./db";

export async function recordActivity(e: {
  requestId: string;
  lane: Lane;
  decision: Decision;
  reason: Reason;
  capability?: string | null;
  principalId?: string | null;
  delegateId?: string | null;
  authorisationId?: string | null;
  serviceId?: string | null;
  presentedClientId?: string | null;
}) {
  return prisma.activityEvent.create({
    data: {
      requestId: e.requestId,
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

export async function activitySummary(now = new Date()) {
  const since = new Date(now.getTime() - HOURS_24);
  const events = await prisma.activityEvent.findMany({
    where: { timestamp: { gte: since } },
    include: { principal: true, delegate: true, service: true },
    orderBy: { timestamp: "desc" },
  });
  const agent = events.filter((e) => e.lane === "AUTHORISED_AGENT" || (e.lane === "UNTRUSTED" && e.presentedClientId));
  const declared = events.filter((e) => e.delegateId);

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
  const perPrincipal = [...by(declared, (e) => e.principal?.displayName ?? null)].map(([name, rows]) => ({
    name,
    transactions: rows.length,
  }));
  const perCapability = [...by(events, (e) => e.capability)]
    .map(([capability, rows]) => ({
      capability,
      total: rows.length,
      allowed: rows.filter((r) => r.decision === "ALLOW").length,
    }))
    .sort((a, b) => b.total - a.total);

  const lanes = (["AUTHORISED_AGENT", "AUTHENTICATED_HUMAN", "UNTRUSTED"] as const).map((lane) => ({
    lane,
    total: events.filter((e) => e.lane === lane).length,
    allowed: events.filter((e) => e.lane === lane && e.decision === "ALLOW").length,
  }));

  return {
    since,
    total: declared.length,
    allowed: declared.filter((e) => e.decision === "ALLOW").length,
    denied: declared.filter((e) => e.decision === "DENY").length,
    authenticatedDelegates: new Set(declared.map((e) => e.delegateId)).size,
    principalsRepresented: new Set(declared.map((e) => e.principalId).filter(Boolean)).size,
    perDelegate,
    perPrincipal,
    perCapability,
    lanes,
    events: events.slice(0, 100),
    outsideTrustedRoute: events.filter((e) => e.lane === "UNTRUSTED").length,
    agentCount: agent.length,
  };
}
