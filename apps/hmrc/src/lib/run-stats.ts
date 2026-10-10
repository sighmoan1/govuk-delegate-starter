// Instrumentation for the about site's swarm experiments (issue #22). Demo tooling, not part of the service:
// it reads HMRC's own log and queue and reports them in the groups the experiments compare, and decides nothing.
//
//   technical load    what reached HMRC and what it cost: HTTP requests, Delegate authority checks, 429 and 503
//                     answers, and the back-end work that passed admission (by cost class)
//   service outcomes  what happened to the underlying claims: how many HMRC received, how many are still waiting,
//                     how many it recorded, how long they waited and how long the worker took
//
// An authorised check is NOT a completed claim, and a request that ran is not a unique claim: the two groups are
// separate on purpose and are never added together. (`uniqueOperations` here is HMRC's log class for any admitted
// request that ran for the first time, reads included. It is a count of requests, not of claims.)
import { prisma } from "./db";
import { requestMetrics } from "./events";

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};
const summary = (xs: number[]) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: xs.length ? Math.max(...xs) : 0, total: xs.reduce((a, b) => a + b, 0) });

const tally = <T,>(xs: T[], key: (x: T) => string | null) => {
  const t: Record<string, number> = {};
  for (const x of xs) { const k = key(x); if (k) t[k] = (t[k] ?? 0) + 1; }
  return t;
};

/** Outcome classes whose requests passed throughput admission and reached HMRC's business layer. */
const ADMITTED = new Set(["UNIQUE_OPERATION", "REPLAY", "BUSINESS_REFUSAL", "INVALID_REQUEST"]);

async function eventStats(runTagPrefix: string) {
  const rows = await prisma.serviceEvent.findMany({
    where: { runTag: { startsWith: runTagPrefix } },
    select: { outcome: true, reason: true, outcomeClass: true, authorisedCheck: true, costClass: true, throttleScope: true, retryAfterSeconds: true, latencyMs: true, lane: true },
  });
  const cls = (e: (typeof rows)[number]) => e.outcomeClass ?? "UNKNOWN";
  const throttled = rows.filter((e) => cls(e) === "TECHNICAL_THROTTLE");
  const unavailable = rows.filter((e) => cls(e) === "UNAVAILABLE");
  const admitted = rows.filter((e) => ADMITTED.has(cls(e)));
  return {
    ...requestMetrics(rows),
    byReason: tally(rows, (e) => e.reason ?? "ALLOWED"),
    byLane: tally(rows, (e) => e.lane),
    admittedWorkByCostClass: tally(admitted, (e) => e.costClass ?? "unclassified"),
    throttlesByScope: tally(throttled, (e) => e.throttleScope ?? "unknown"),
    throttlesByCostClass: tally(throttled, (e) => e.costClass ?? "unclassified"),
    // Every 429 and 503 must say when to come back.
    throttlesWithoutRetryAfter: [...throttled, ...unavailable].filter((e) => !e.retryAfterSeconds).length,
    latencyMs: summary(admitted.map((e) => e.latencyMs)),
  };
}

async function queueStats(subjects: string[], watch: string[]) {
  const txs = subjects.length
    ? await prisma.transaction.findMany({ where: { subject: { in: subjects } }, select: { subject: true, status: true, receivedAt: true, startedAt: true, completedAt: true, attempts: true } })
    : [];
  const done = txs.filter((t) => t.status === "COMPLETED" && t.startedAt && t.completedAt);
  const firstReceipt = txs.length ? Math.min(...txs.map((t) => t.receivedAt.getTime())) : null;
  const lastCompletion = done.length ? Math.max(...done.map((t) => t.completedAt!.getTime())) : null;
  const claimsRecorded = subjects.length ? await prisma.claim.count({ where: { kind: "job_expenses", taxpayer: { oneLoginSubject: { in: subjects } } } }) : 0;
  return {
    received: txs.length,
    peopleWithAClaim: new Set(txs.map((t) => t.subject)).size,
    byStatus: tally(txs, (t) => t.status),
    claimsRecorded,
    retriedAttempts: txs.reduce((a, t) => a + Math.max(0, t.attempts - 1), 0),
    // From receipt to a worker taking it, from a worker taking it to it being recorded, and receipt to recorded.
    waitMs: summary(txs.filter((t) => t.startedAt).map((t) => t.startedAt!.getTime() - t.receivedAt.getTime())),
    processingMs: summary(done.map((t) => t.completedAt!.getTime() - t.startedAt!.getTime())),
    receiptToRecordedMs: summary(done.map((t) => t.completedAt!.getTime() - t.receivedAt.getTime())),
    drainMs: firstReceipt !== null && lastCompletion !== null ? lastCompletion - firstReceipt : null,
    openNow: txs.filter((t) => t.status === "QUEUED" || t.status === "PROCESSING").length,
    watched: txs
      .filter((t) => watch.includes(t.subject))
      .map((t) => ({ subject: t.subject, status: t.status, receivedAt: t.receivedAt.toISOString(), startedAt: t.startedAt?.toISOString() ?? null, completedAt: t.completedAt?.toISOString() ?? null })),
  };
}

export async function runStats(input: { runTagPrefix: string; subjects: string[]; includeEvents?: boolean; watch?: string[] }) {
  const [events, queue] = await Promise.all([input.includeEvents === false ? null : eventStats(input.runTagPrefix), queueStats(input.subjects, input.watch ?? [])]);
  return { events, queue, at: new Date().toISOString() };
}
