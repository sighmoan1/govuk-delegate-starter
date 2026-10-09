import type { Lane, Outcome } from "@/generated/prisma";
import { prisma } from "./db";
import type { Refusal } from "./operation";

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
  /** Derived from outcome and reason when not given. */
  outcomeClass?: OutcomeClass | null;
  costClass?: string | null;
  throttleScope?: string | null;
  retryAfterSeconds?: number | null;
  /** GOV.UK Delegate's check authorised this request (agent calls only). */
  authorisedCheck?: boolean;
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
      outcomeClass: e.outcomeClass ?? outcomeClassOf(e.outcome, e.reason),
      costClass: e.costClass ?? null,
      throttleScope: e.throttleScope ?? null,
      retryAfterSeconds: e.retryAfterSeconds ?? null,
      authorisedCheck: e.authorisedCheck ?? false,
    },
  });
}

/**
 * What kind of answer an event was. Kept apart because they mean different
 * things to a person and to an operator:
 *   UNIQUE_OPERATION    an admitted request that ran (first time)
 *   REPLAY              a retry answered from the stored outcome; not a new operation
 *   BUSINESS_REFUSAL    the transaction isn't permissible (duplicate, new evidence needed, open-case limit...)
 *   INVALID_REQUEST     malformed request or Idempotency-Key misuse
 *   TECHNICAL_THROTTLE  too much traffic; retry later (429)
 *   UNAVAILABLE         HMRC or GOV.UK Delegate couldn't take it just now; retry later (503)
 *   AUTHORITY_REFUSAL   identity or permission (401/403)
 */
export type OutcomeClass = "UNIQUE_OPERATION" | "REPLAY" | "BUSINESS_REFUSAL" | "INVALID_REQUEST" | "TECHNICAL_THROTTLE" | "UNAVAILABLE" | "AUTHORITY_REFUSAL";

const BUSINESS_REASONS = new Set(["CAPACITY_EXCEEDED", "DUPLICATE_SUBMISSION", "NEW_EVIDENCE_REQUIRED", "QUERY_NOT_FOUND", "TRANSACTION_NOT_FOUND"]);
const INVALID_REASONS = new Set(["INVALID_REQUEST", "INVALID_IDEMPOTENCY_KEY", "IDEMPOTENCY_KEY_REUSED", "IDEMPOTENCY_KEY_REQUIRED"]);

export function outcomeClassOf(outcome: Outcome, reason?: string | null): OutcomeClass {
  if (outcome === "ALLOWED") return reason === "IDEMPOTENT_REPLAY" ? "REPLAY" : "UNIQUE_OPERATION";
  if (outcome === "THROTTLED" || reason === "RATE_LIMITED") return "TECHNICAL_THROTTLE";
  if (reason === "SERVICE_UNAVAILABLE" || reason === "DELEGATE_UNAVAILABLE") return "UNAVAILABLE";
  if (reason && BUSINESS_REASONS.has(reason)) return "BUSINESS_REFUSAL";
  if (reason && INVALID_REASONS.has(reason)) return "INVALID_REQUEST";
  return "AUTHORITY_REFUSAL";
}

type MetricRow = { outcome: Outcome; reason: string | null; outcomeClass: string | null; authorisedCheck: boolean };

/**
 * The numbers that must not be confused, all from HMRC's own log:
 *   httpRequests       every request that reached a route
 *   authorisedChecks   requests where GOV.UK Delegate's check said yes (it spends nothing)
 *   uniqueOperations   admitted requests that ran, excluding idempotent replays
 *   businessRefusals   transactions HMRC would not do (a statement about the transaction)
 *   technicalThrottles requests turned away for traffic, 429 (says nothing about entitlement)
 * plus replays, unavailable (503), invalid requests and identity/permission
 * refusals, so the columns add up to httpRequests.
 */
export function requestMetrics(rows: MetricRow[]) {
  const cls = (e: MetricRow) => e.outcomeClass ?? outcomeClassOf(e.outcome, e.reason);
  const n = (c: OutcomeClass) => rows.filter((e) => cls(e) === c).length;
  return {
    httpRequests: rows.length,
    authorisedChecks: rows.filter((e) => e.authorisedCheck).length,
    uniqueOperations: n("UNIQUE_OPERATION"),
    replays: n("REPLAY"),
    businessRefusals: n("BUSINESS_REFUSAL"),
    technicalThrottles: n("TECHNICAL_THROTTLE"),
    unavailable: n("UNAVAILABLE"),
    invalidRequests: n("INVALID_REQUEST"),
    authorityRefusals: n("AUTHORITY_REFUSAL"),
  };
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
    metricsLastMinute: requestMetrics(minute),
    metricsLastDay: requestMetrics(day),
    perAgent: [...agents].map(([name, rows]) => ({
      name,
      requests: rows.length,
      people: new Set(rows.map((r) => r.subject).filter(Boolean)).size,
      refusalRate: rows.filter((r) => r.outcome === "REFUSED").length / rows.length,
    })),
    recent: day.slice(0, 25),
  };
}

/**
 * Whose authority is being spent: the last 24 hours, one row per person
 * (One Login subject), however many agents, delegations or sessions drew on it.
 * "Told apart" counts only what HMRC can see: a hidden session isn't an agent.
 */
export async function capacityByPerson(limit = 10) {
  const rows = await prisma.$queryRaw<
    { subject: string; requests: bigint; allowed: bigint; at_limit: bigint; throttled: bigint; refused_other: bigint; agents: bigint; delegations: bigint; last_at: Date }[]
  >`
    select subject,
           count(*) as requests,
           count(*) filter (where outcome = 'ALLOWED') as allowed,
           count(*) filter (where reason in ('CAPACITY_EXCEEDED', 'NEW_EVIDENCE_REQUIRED', 'DUPLICATE_SUBMISSION')) as at_limit,
           count(*) filter (where outcome = 'THROTTLED' or reason = 'RATE_LIMITED') as throttled,
           count(*) filter (where outcome <> 'ALLOWED' and outcome <> 'THROTTLED' and reason is distinct from 'RATE_LIMITED' and reason not in ('CAPACITY_EXCEEDED', 'NEW_EVIDENCE_REQUIRED', 'DUPLICATE_SUBMISSION')) as refused_other,
           count(distinct agent_id) as agents,
           count(distinct delegation_id) as delegations,
           max(timestamp) as last_at
    from service_event
    where subject is not null and timestamp > now() - interval '24 hours'
    group by subject
    order by count(*) desc
    limit ${limit}`;
  return rows.map((r) => ({
    subject: r.subject, requests: Number(r.requests), allowed: Number(r.allowed), atLimit: Number(r.at_limit), throttled: Number(r.throttled),
    refusedOther: Number(r.refused_other), agents: Number(r.agents), delegations: Number(r.delegations), lastAt: r.last_at,
  }));
}

/**
 * The log fields for a refusal from runOperation. A technical throttle is
 * outcome THROTTLED and never carries a business reason; a business refusal
 * is REFUSED and never carries retry guidance.
 */
export function refusalEventFields(f: Refusal, costClass: string) {
  if (f.kind === "TECHNICAL_THROTTLE") return { outcome: "THROTTLED" as const, reason: f.reason, rule: f.rule, capacityUsed: f.used, capacityLimit: f.limit, costClass, throttleScope: f.scope, retryAfterSeconds: f.retryAfterSeconds };
  if (f.kind === "UNAVAILABLE") return { outcome: "REFUSED" as const, reason: f.reason, costClass, retryAfterSeconds: f.retryAfterSeconds };
  return { outcome: "REFUSED" as const, reason: f.reason, rule: f.rule, capacityUsed: f.used, capacityLimit: f.limit, costClass };
}
