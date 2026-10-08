// How fast HMRC will take requests, whoever is sending them.
//
// This file is request admission and rate limiting: technical protection of
// the service. It says nothing about what a person may do. A throttle here is
// "too many requests, try again at <time>", a 429 with Retry-After, and it is
// never recorded as, or worded like, a loss of entitlement. What a person may
// do (one claim per tax year, one answer per question, open-case limits) is
// decided in domain-policy.ts, and neither file knows about the other's rules.
//
// Principles
//   - Never throttle the entitlement itself. Writes (claims, answers, changes)
//     get generous protective ceilings only; no claim is capped, delayed or
//     silently dropped because the caller is an AI. Domain rules decide whether
//     a claim is allowed; this file decides only whether HMRC can take the
//     request right now.
//   - Keyed by who causes the load. Three scopes, each with an explicit limit
//     per cost class:
//        operator   the thing sending traffic: an agent provider (Delegate agent
//                   id) or a signed-in person's session. One agent acting for
//                   many people shares one operator budget.
//        principal  the person the traffic is about (One Login subject),
//                   whoever or however many act for them. Humans, a known agent
//                   and a hundred sub-agents get the same principal budget, so a
//                   known agent never has more capacity than the person.
//        service    all of HMRC's API together, for load protection.
//   - Cost classes, not one global number: reading a status is cheap, a
//     back-end tax-code lookup is expensive, a write is in between and is never
//     the thing we squeeze first.
//   - Retryable. Throttles are 429 with Retry-After and a machine-readable
//     body; temporary unavailability is 503 with Retry-After. Neither is a 4xx
//     business outcome (409 and domain statuses), and neither is an identity or
//     permission failure (401/403).
//   - Idempotent replays are cheap. A retry that will be answered from the
//     stored outcome (see idempotency.ts) costs a lookup, not a write: it is
//     admitted as a `read`, so a client retrying after a lost response is not
//     throttled as if it were submitting again.
//
// The per-minute counters are in memory and per process: an honest stand-in
// for a gateway or shared store, like friction.ts. The two per-person
// persisted windows (tax code views, progress checks) are database-backed so
// they hold across processes and are enforced under the person's lock.
import type { Admitted, Tx } from "./domain-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type CostClass = "read" | "status_poll" | "write" | "expensive_query";

/**
 * Which cost class each operation belongs to.
 *
 * view_tax_code stands in for an expensive back-end query (a PAYE record
 * lookup), which is why it is the one operation with a low hourly per-person
 * ceiling. check_claim_progress is the poll: capped to a few a day per person
 * because a scheduled agent checking a claim is traffic, not a transaction.
 */
export const OPERATION_COST: Record<string, CostClass> = {
  view_tax_code: "expensive_query",
  view_claim_status: "read",
  check_claim_progress: "status_poll",
  claim_job_expenses: "write",
  respond_to_query: "write",
  update_employment: "write",
  change_refund_account: "write",
  change_address: "write",
};
export const costClassOf = (capability: string): CostClass => OPERATION_COST[capability] ?? "read";

export type ThrottleScope = "operator" | "principal" | "service";
export type OperatorKind = "human" | "agent";
export type Operator = { kind: OperatorKind; key: string };

type PerClass = Record<CostClass, number>;

/** Per-minute limits. Illustrative; tuned so the demo is legible and nothing legitimate trips them. */
const DEFAULT_LIMITS = {
  operator: {
    // `all` is the earlier per-lane ceiling (600 a person's session, 5000 an agent), kept as is.
    human: { all: 600, read: 600, status_poll: 120, write: 120, expensive_query: 300 },
    agent: { all: 5000, read: 5000, status_poll: 2500, write: 2500, expensive_query: 1500 },
  },
  // All callers for one person combined: the same for a person, one agent or many.
  principal: { read: 300, status_poll: 30, write: 60, expensive_query: 120 } as PerClass,
  service: { read: 20_000, status_poll: 10_000, write: 6_000, expensive_query: 6_000 } as PerClass,
};
export type Limits = typeof DEFAULT_LIMITS;

/**
 * Per-person windows kept in the database (what was admitted, not what was
 * attempted). Preserved from before the split: same numbers, same windows.
 */
export const PRINCIPAL_WINDOWS = {
  view_tax_code: { rule: "tax_code_views_per_hour", limit: 60, windowMs: HOUR, label: "Tax code views per hour" },
  check_claim_progress: { rule: "claim_progress_checks_per_day", limit: 4, windowMs: DAY, label: "Scheduled claim progress checks per day" },
} as const;

let limits: Limits = structuredClone(DEFAULT_LIMITS);

/** For tests and demos: tighten or loosen the per-minute limits. */
export function configureThroughput(change: { operator?: Partial<Record<OperatorKind, Partial<Limits["operator"]["human"]>>>; principal?: Partial<PerClass>; service?: Partial<PerClass> }) {
  limits = {
    operator: {
      human: { ...limits.operator.human, ...change.operator?.human },
      agent: { ...limits.operator.agent, ...change.operator?.agent },
    },
    principal: { ...limits.principal, ...change.principal },
    service: { ...limits.service, ...change.service },
  };
}
export const currentLimits = (): Limits => limits;

const counters = new Map<string, { start: number; count: number }>();

/** Forget all counters and restore default limits (demo reset, tests). */
export function resetThroughput() {
  counters.clear();
  recentKeys.clear();
  limits = structuredClone(DEFAULT_LIMITS);
}

/**
 * Idempotency keys seen in the last minute. A second request carrying a key we
 * have just admitted is a retry of that attempt: it will wait for the first
 * outcome and be answered from it, so it costs a lookup, not a write. This is
 * what lets a client (or a hundred impatient retries) resend safely without
 * being throttled as if it were making a hundred submissions.
 */
const recentKeys = new Map<string, number>();
function seenRecently(key: string, now: number) {
  const first = recentKeys.get(key);
  if (first !== undefined && now - first < MINUTE) return true;
  if (recentKeys.size > 10_000) for (const [k, t] of recentKeys) if (now - t >= MINUTE) recentKeys.delete(k);
  recentKeys.set(key, now);
  return false;
}

function hit(key: string, limit: number, now: number) {
  let c = counters.get(key);
  if (!c || now - c.start >= MINUTE) {
    c = { start: now, count: 0 };
    counters.set(key, c);
  }
  c.count += 1;
  return { allowed: c.count <= limit, count: c.count, retryAfterSeconds: Math.max(1, Math.ceil((c.start + MINUTE - now) / 1000)) };
}

export type ThrottleRefusal = {
  kind: "TECHNICAL_THROTTLE";
  reason: "RATE_LIMITED";
  scope: ThrottleScope;
  costClass: CostClass;
  operation: string;
  rule: string;
  limit: number;
  used: number;
  windowSeconds: number;
  retryAfterSeconds: number;
  resetsAt: string;
  message: string;
};

export type UnavailableRefusal = {
  kind: "UNAVAILABLE";
  reason: "SERVICE_UNAVAILABLE";
  costClass: CostClass;
  operation: string;
  retryAfterSeconds: number;
  message: string;
};

const throttle = (
  scope: ThrottleScope, costClass: CostClass, operation: string, rule: string, limit: number, used: number, windowMs: number, retryAfterSeconds: number, now: number,
): { ok: false; refusal: ThrottleRefusal } => ({
  ok: false,
  refusal: {
    kind: "TECHNICAL_THROTTLE", reason: "RATE_LIMITED", scope, costClass, operation, rule, limit, used,
    windowSeconds: windowMs / 1000, retryAfterSeconds, resetsAt: new Date(now + retryAfterSeconds * 1000).toISOString(),
    message: `Too many ${scope === "service" ? "requests to this service" : scope === "principal" ? "requests for this person" : "requests from this caller"} just now. This is a limit on traffic, not a decision about anyone's entitlement. Nothing was changed. Try again in ${retryAfterSeconds} seconds.`,
  },
});

/** True while the service is deliberately refusing work to protect itself (load shedding, maintenance). Read each time so it can be flipped live. */
export const isShedding = () => process.env.HMRC_SHED_LOAD === "1";
const SHED_RETRY_SECONDS = 30;

export type Admission = { ok: true; costClass: CostClass; replayCost: boolean } | { ok: false; refusal: ThrottleRefusal | UnavailableRefusal };

/**
 * Should HMRC take this request right now? Order: temporary unavailability,
 * then the operator, the person, the service. Counts attempts (it protects
 * against load, so a refused request is still load).
 *
 * A request that will be answered from a stored idempotent outcome (`replay`:
 * the record exists already; `retryKey`: the same key was admitted in the last
 * minute and is still in flight) is admitted as a cheap read instead of a write.
 */
export function admitRequest(a: { capability: string; operator?: Operator | null; subject: string | null; replay?: boolean; retryKey?: string | null; now?: number }): Admission {
  const now = a.now ?? Date.now();
  const operation = a.capability;
  const replay = !!a.replay || (!!a.retryKey && seenRecently(a.retryKey, now));
  const costClass = replay ? "read" : costClassOf(a.capability);
  if (isShedding()) {
    return { ok: false, refusal: { kind: "UNAVAILABLE", reason: "SERVICE_UNAVAILABLE", costClass, operation, retryAfterSeconds: SHED_RETRY_SECONDS, message: "HMRC is temporarily unable to take this request. Nothing was changed. Try the same request again shortly; a retry will not duplicate anything." } };
  }
  if (a.operator) {
    const lim = limits.operator[a.operator.kind];
    const all = hit(`operator:${a.operator.kind}:${a.operator.key}:all`, lim.all, now);
    if (!all.allowed) return throttle("operator", costClass, operation, `operator_${a.operator.kind}_requests_per_minute`, lim.all, all.count, MINUTE, all.retryAfterSeconds, now);
    const cls = hit(`operator:${a.operator.kind}:${a.operator.key}:${costClass}`, lim[costClass], now);
    if (!cls.allowed) return throttle("operator", costClass, operation, `operator_${a.operator.kind}_${costClass}_per_minute`, lim[costClass], cls.count, MINUTE, cls.retryAfterSeconds, now);
  }
  if (a.subject) {
    const p = hit(`principal:${a.subject}:${costClass}`, limits.principal[costClass], now);
    if (!p.allowed) return throttle("principal", costClass, operation, `principal_${costClass}_per_minute`, limits.principal[costClass], p.count, MINUTE, p.retryAfterSeconds, now);
  }
  const s = hit(`service:${costClass}`, limits.service[costClass], now);
  if (!s.allowed) return throttle("service", costClass, operation, `service_${costClass}_per_minute`, limits.service[costClass], s.count, MINUTE, s.retryAfterSeconds, now);
  return { ok: true, costClass, replayCost: replay };
}

/**
 * The per-person windows kept in the database: tax code views per hour and
 * progress checks per day. Call inside the person's transaction, holding their
 * lock. Returns the meter reading, `null` if this operation has no window, or
 * a throttle. Whoever acted (the person, one agent, many) draws on the same window.
 */
export async function admitPrincipalWindow(tx: Tx, subject: string, capability: string, now: Date): Promise<Admitted | ThrottleRefusal | null> {
  const w = (PRINCIPAL_WINDOWS as Record<string, (typeof PRINCIPAL_WINDOWS)[keyof typeof PRINCIPAL_WINDOWS]>)[capability];
  if (!w) return null;
  const window = await tx.principalUsage.findMany({
    where: { subject, rule: w.rule, at: { gt: new Date(now.getTime() - w.windowMs) } },
    select: { at: true },
    orderBy: { at: "asc" },
  });
  if (window.length >= w.limit) {
    const resetsAt = window[0].at.getTime() + w.windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetsAt - now.getTime()) / 1000));
    const t = throttle("principal", costClassOf(capability), capability, w.rule, w.limit, window.length, w.windowMs, retryAfterSeconds, now.getTime()).refusal;
    t.resetsAt = new Date(resetsAt).toISOString();
    t.message = capability === "view_tax_code"
      ? "Your tax code has been looked up too many times in the last hour. This is a limit on lookups, not on your entitlement. Try again later."
      : "Your claim progress has been checked as often as it can be today. This is a limit on checks, not on your claim. Try again tomorrow.";
    return t;
  }
  await tx.principalUsage.create({ data: { subject, rule: w.rule, at: now } });
  return { rule: w.rule, limit: w.limit, used: window.length + 1, evidence: null };
}

export const isThrottle = (x: unknown): x is ThrottleRefusal => !!x && typeof x === "object" && (x as { kind?: string }).kind === "TECHNICAL_THROTTLE";

/** Headers every throttle and unavailable response carries so a client knows when to come back. */
export function retryHeaders(r: ThrottleRefusal | UnavailableRefusal): Record<string, string> {
  return {
    "retry-after": String(r.retryAfterSeconds),
    ...(r.kind === "TECHNICAL_THROTTLE" ? { "x-ratelimit-limit": String(r.limit), "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(r.retryAfterSeconds) } : {}),
  };
}
