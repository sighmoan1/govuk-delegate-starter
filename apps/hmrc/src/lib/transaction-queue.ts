// The queue mechanics behind HMRC's asynchronous claim path (issue #21): a
// PostgreSQL table, row locks and leases. No business rule is decided here
// (domain-policy.ts) and no traffic limit (throughput.ts); this file only
// stores accepted work and hands it out safely.
//
// Guarantees
//   - Durable acceptance. A work item exists only as the same row as its
//     receipt, written in the caller's database transaction. A crash before
//     commit leaves nothing; after commit the item survives restarts.
//   - Safe across workers. Claiming is one UPDATE ... FOR UPDATE SKIP LOCKED
//     statement, so two workers never take the same item.
//   - Leases. A claimed item carries a lease. If its worker dies, the lease
//     runs out and another worker takes the item (counted as an attempt).
//   - Fenced side effects. Work is done in a transaction that first re-reads the
//     row with a lock and checks the lease token it was given. A worker whose
//     lease was taken over, or whose item is already done, changes nothing.
//     The claim reference is reserved at receipt and unique, as a backstop.
//   - Retry, backoff, exhaustion. A failed attempt goes back with exponential
//     backoff. After maxAttempts it becomes FAILED, which is visible to the
//     client and to operators and is never retried by itself.
//
// Fairness (demo policy, not a legal priority rule)
//   Scheduling is per person (One Login subject), never by agent or provider.
//   - A person's items run one at a time and in the order received: only the
//     oldest unfinished item of each person is eligible.
//   - Among eligible people, whoever was served least recently goes next (a
//     person never served first, then oldest). One person with a hundred items
//     gets one turn per round, so cannot starve anyone else.
//   Nothing here looks at who sent the work or what kind of caller it was.
import { randomBytes, randomUUID } from "node:crypto";
import type { TransactionStatus, Transaction } from "@/generated/prisma";
import { prisma } from "./db";
import type { Tx } from "./domain-policy";
import type { Actor } from "./delegated-authority";

/**
 * Timestamps in raw SQL. The columns are `timestamp` (UTC, no zone), as Prisma writes them. Sending a Date as a
 * parameter would be converted to the database session's time zone and stored shifted, so send the UTC text and
 * cast it to `timestamp`, which ignores the zone suffix.
 */
const utc = (d: Date) => d.toISOString();

export const CLAIM_OPERATION = "claim_job_expenses";
/** Operations that have an asynchronous path. Anything else is always synchronous. */
export const ASYNC_OPERATIONS: ReadonlySet<string> = new Set([CLAIM_OPERATION]);

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Read each time so tests and operators can change them without a restart. */
export const queueSettings = () => ({
  /** How long a worker may hold an item before another may take it over. */
  leaseMs: num("HMRC_QUEUE_LEASE_SECONDS", 60) * 1000,
  maxAttempts: Math.floor(num("HMRC_QUEUE_MAX_ATTEMPTS", 5)),
  backoffBaseMs: num("HMRC_QUEUE_BACKOFF_SECONDS", 5) * 1000,
  backoffCapMs: num("HMRC_QUEUE_BACKOFF_CAP_SECONDS", 300) * 1000,
  /** How many items one worker process handles at the same time. */
  concurrency: Math.floor(num("HMRC_QUEUE_CONCURRENCY", 4)),
  pollMs: num("HMRC_QUEUE_POLL_MS", 1000),
});
export type QueueSettings = ReturnType<typeof queueSettings>;

/** Retry delay after the nth failed attempt: base * 2^(n-1), capped. */
export const backoffMs = (attempt: number, s: Pick<QueueSettings, "backoffBaseMs" | "backoffCapMs"> = queueSettings()) =>
  Math.min(s.backoffCapMs, s.backoffBaseMs * 2 ** Math.max(0, attempt - 1));

/** Opaque and unguessable, so the id is not a way to find anyone else's claim (the status endpoint also checks whose it is). */
export const newTransactionId = () => `tx_${randomBytes(16).toString("base64url")}`;
const newClaimReference = () => `JE-${randomUUID().slice(0, 8).toUpperCase()}`;

/**
 * Receive one claim: the receipt and the work item are this one row. Call it
 * inside the person's transaction (runOperation's `run`), so it commits or
 * rolls back together with the idempotency record.
 */
export async function enqueueClaim(
  db: Tx,
  p: { subject: string; evidenceFingerprint: string | null; actor: Actor; delegateCheckId?: string | null; now?: Date; maxAttempts?: number },
): Promise<Transaction> {
  const now = p.now ?? new Date();
  const agent = p.actor.kind === "AGENT" ? p.actor : null;
  return db.transaction.create({
    data: {
      id: newTransactionId(), subject: p.subject, operation: CLAIM_OPERATION, status: "QUEUED",
      claimReference: newClaimReference(), evidenceFingerprint: p.evidenceFingerprint,
      submittedBy: agent ? "AGENT" : "SELF", agentName: agent?.name ?? null, agentId: agent?.id ?? null,
      mandateId: agent?.chain.mandate_id ?? null, delegationId: agent?.chain.delegation_id ?? null, delegateCheckId: p.delegateCheckId ?? null,
      receivedAt: now, nextAttemptAt: now, maxAttempts: p.maxAttempts ?? queueSettings().maxAttempts,
    },
  });
}

export type Claimed = Transaction & { leaseToken: string };

/**
 * Take the next item that is due, fairly (see the header). Returns null when
 * nothing is due. Items whose lease ran out on their last allowed attempt are
 * failed first, so a worker that keeps crashing cannot loop on one item.
 */
export async function claimNext(opts: { now?: Date; leaseMs?: number } = {}): Promise<Claimed | null> {
  const now = opts.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (opts.leaseMs ?? queueSettings().leaseMs));
  const token = randomUUID();
  await failExhaustedLeases(now);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "transaction" t
    SET "status" = 'PROCESSING', "attempts" = t."attempts" + 1, "lease_token" = ${token}, "lease_expires_at" = ${utc(leaseUntil)}::timestamp, "started_at" = ${utc(now)}::timestamp
    WHERE t."id" = (
      SELECT c."id" FROM "transaction" c
      WHERE ((c."status" = 'QUEUED' AND c."next_attempt_at" <= ${utc(now)}::timestamp) OR (c."status" = 'PROCESSING' AND c."lease_expires_at" <= ${utc(now)}::timestamp))
        AND c."id" = (
          SELECT h."id" FROM "transaction" h
          WHERE h."subject" = c."subject" AND h."status" IN ('QUEUED', 'PROCESSING')
          ORDER BY h."received_at", h."id" LIMIT 1
        )
      ORDER BY (SELECT max(s."started_at") FROM "transaction" s WHERE s."subject" = c."subject") ASC NULLS FIRST, c."received_at", c."id"
      LIMIT 1
      FOR UPDATE OF c SKIP LOCKED
    )
    RETURNING t."id"`;
  if (rows.length === 0) return null;
  return (await prisma.transaction.findUniqueOrThrow({ where: { id: rows[0].id } })) as Claimed;
}

/** An item whose worker vanished on its last allowed attempt: nobody will try it again, so say so. */
export async function failExhaustedLeases(now: Date): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "transaction"
    SET "status" = 'FAILED', "failed_at" = ${utc(now)}::timestamp, "lease_token" = NULL, "lease_expires_at" = NULL, "last_error" = 'LEASE_EXPIRED_ON_LAST_ATTEMPT'
    WHERE "status" = 'PROCESSING' AND "lease_expires_at" <= ${utc(now)}::timestamp AND "attempts" >= "max_attempts"`;
}

/**
 * This attempt did not work. Put the item back with a delay, or fail it for good
 * once it has used its attempts. Only the holder of the lease may do this.
 */
export async function failAttempt(job: Claimed, error: unknown, opts: { now?: Date; settings?: QueueSettings } = {}): Promise<"RETRY" | "FAILED" | "LOST_LEASE"> {
  const now = opts.now ?? new Date();
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300);
  const exhausted = job.attempts >= job.maxAttempts;
  const { count } = await prisma.transaction.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken, status: "PROCESSING" },
    data: exhausted
      ? { status: "FAILED", failedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: message }
      : { status: "QUEUED", nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts, opts.settings)), leaseToken: null, leaseExpiresAt: null, lastError: message },
  });
  return count === 0 ? "LOST_LEASE" : exhausted ? "FAILED" : "RETRY";
}

/** What a worker does for one claimed item, inside the fenced transaction. Must write only through `tx`. */
export type Processor = (job: Transaction, tx: Tx) => Promise<void>;

export type Processed = "COMPLETED" | "RETRY" | "FAILED" | "LOST_LEASE";

/**
 * Do the work for one claimed item, once. The business change and the move to
 * COMPLETED are one database transaction under the person's lock; if anything
 * throws, nothing is kept and the attempt is recorded as failed.
 */
export async function processClaimed(job: Claimed, run: Processor, opts: { now?: Date; settings?: QueueSettings } = {}): Promise<Processed> {
  const now = opts.now ?? new Date();
  try {
    const kept = await prisma.$transaction(
      async (tx) => {
        // Same lock order as runOperation (the person, then the row), so the two never deadlock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`principal:${job.subject}`}))`;
        const [row] = await tx.$queryRaw<{ status: TransactionStatus; lease_token: string | null }[]>`
          SELECT "status", "lease_token" FROM "transaction" WHERE "id" = ${job.id} FOR UPDATE`;
        // Taken over by another worker, or already finished: this attempt must change nothing.
        if (!row || row.status !== "PROCESSING" || row.lease_token !== job.leaseToken) return false;
        await run(job, tx);
        await tx.transaction.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: null },
        });
        return true;
      },
      { timeout: 20_000, maxWait: 20_000 },
    );
    return kept ? "COMPLETED" : "LOST_LEASE";
  } catch (e) {
    return failAttempt(job, e, opts);
  }
}

/** Items that reached COMPLETED or FAILED and whose outcome Delegate has not been told (agent submissions only). */
export const unreportedOutcomes = (limit = 50) =>
  prisma.transaction.findMany({
    where: { status: { in: ["COMPLETED", "FAILED"] }, outcomeReported: false, delegateCheckId: { not: null } },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

export const markOutcomeReported = (id: string) => prisma.transaction.update({ where: { id }, data: { outcomeReported: true } });
