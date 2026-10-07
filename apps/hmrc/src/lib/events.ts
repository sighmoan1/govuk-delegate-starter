import type { Lane, Outcome } from "@/generated/prisma";
import { prisma } from "./db";

/** HMRC's own log: every request, whichever lane, whatever happened. */
export async function logEvent(e: {
  lane: Lane;
  outcome: Outcome;
  reason?: string | null;
  capability?: string | null;
  path: string;
  agentName?: string | null;
  agentId?: string | null;
  subject?: string | null;
  latencyMs: number;
  delegateCheckId?: string | null;
  mandateId?: string | null;
  delegationId?: string | null;
  parentDelegationId?: string | null;
  depth?: number | null;
  agentLabel?: string | null;
  assurance?: string | null;
  rule?: string | null;
  capacityUsed?: number | null;
  capacityLimit?: number | null;
  userAgent?: string | null;
  signatureAgent?: string | null;
  signatureResult?: string | null;
  sessionId?: string | null;
  runTag?: string | null;
}) {
  return prisma.serviceEvent.create({
    data: {
      lane: e.lane,
      outcome: e.outcome,
      reason: e.reason ?? null,
      capability: e.capability ?? null,
      path: e.path,
      agentName: e.agentName ?? null,
      agentId: e.agentId ?? null,
      subject: e.subject ?? null,
      latencyMs: e.latencyMs,
      delegateCheckId: e.delegateCheckId ?? null,
      mandateId: e.mandateId ?? null,
      delegationId: e.delegationId ?? null,
      parentDelegationId: e.parentDelegationId ?? null,
      depth: e.depth ?? null,
      agentLabel: e.agentLabel ?? null,
      assurance: e.assurance ?? null,
      rule: e.rule ?? null,
      capacityUsed: e.capacityUsed ?? null,
      capacityLimit: e.capacityLimit ?? null,
      userAgent: e.userAgent ?? null,
      signatureAgent: e.signatureAgent ?? null,
      signatureResult: e.signatureResult ?? null,
      sessionId: e.sessionId ?? null,
      runTag: e.runTag ?? null,
    },
  });
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export const LANES = ["AUTHENTICATED_HUMAN", "AUTHORISED_AGENT", "DECLARED_AGENT", "UNTRUSTED"] as const;

function laneRows(events: { lane: Lane; outcome: Outcome; latencyMs: number }[]) {
  return LANES.map((lane) => {
    const rows = events.filter((e) => e.lane === lane);
    const n = (o: Outcome) => rows.filter((e) => e.outcome === o).length;
    return { lane, requests: rows.length, allowed: n("ALLOWED"), refused: n("REFUSED"), throttled: n("THROTTLED"), challenged: n("CHALLENGED"), medianMs: median(rows.filter((e) => e.outcome !== "THROTTLED").map((e) => e.latencyMs)) };
  });
}

export async function opsSummary(now = new Date()) {
  const day = await prisma.serviceEvent.findMany({ where: { timestamp: { gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { timestamp: "desc" } });
  const minute = day.filter((e) => e.timestamp.getTime() >= now.getTime() - 60_000);
  const agents = new Map<string, typeof day>();
  for (const e of day) if (e.agentName) agents.set(e.agentName, [...(agents.get(e.agentName) ?? []), e]);
  return {
    lastMinute: laneRows(minute),
    lastDay: laneRows(day),
    perAgent: [...agents].map(([name, rows]) => ({
      name,
      requests: rows.length,
      people: new Set(rows.map((r) => r.subject).filter(Boolean)).size,
      refusalRate: rows.filter((r) => r.outcome === "REFUSED").length / rows.length,
    })),
    recent: day.slice(0, 25),
  };
}
