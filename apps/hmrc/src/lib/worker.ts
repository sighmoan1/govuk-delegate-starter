// HMRC's queue worker (issue #21). `npm run worker -w apps/hmrc` runs it as its
// own process, as many copies as you like against one database: the queue
// (transaction-queue.ts) is what keeps them from taking the same item.
//
// Bounded concurrency: one process runs `concurrency` slots, each handling one
// item at a time, so a process never has more than that in flight. Stopping
// (an AbortSignal, or SIGTERM in the script) lets items already being worked
// on finish and then returns; anything left stays queued for the next worker.
import { reportOutcome } from "./delegate-client";
import { claimNext, markOutcomeReported, processClaimed, queueSettings, unreportedOutcomes, type Processed, type Processor, type QueueSettings } from "./transaction-queue";
import { processClaimJob } from "./transactions";

export type WorkerOptions = Partial<QueueSettings> & {
  process?: Processor;
  signal?: AbortSignal;
  /** The clock, for tests. */
  now?: () => Date;
  log?: (message: string) => void;
};

const settingsOf = (o: WorkerOptions): QueueSettings => {
  const s = queueSettings();
  return {
    leaseMs: o.leaseMs ?? s.leaseMs, maxAttempts: o.maxAttempts ?? s.maxAttempts, backoffBaseMs: o.backoffBaseMs ?? s.backoffBaseMs,
    backoffCapMs: o.backoffCapMs ?? s.backoffCapMs, concurrency: o.concurrency ?? s.concurrency, pollMs: o.pollMs ?? s.pollMs,
  };
};

/** Take one due item and work on it. Null when nothing is due. */
export async function workOne(o: WorkerOptions = {}): Promise<Processed | null> {
  const settings = settingsOf(o);
  const now = o.now?.() ?? new Date();
  const job = await claimNext({ now, leaseMs: settings.leaseMs });
  if (!job) return null;
  const result = await processClaimed(job, o.process ?? processClaimJob, { now: o.now?.() ?? new Date(), settings });
  o.log?.(`${job.id} attempt ${job.attempts}/${job.maxAttempts}: ${result}`);
  if (result === "COMPLETED" || result === "FAILED") await reportOutcomes();
  return result;
}

/**
 * Tell GOV.UK Delegate how agent-submitted claims ended (issue #12's outcome
 * log: ACCEPTED was reported at receipt, COMPLETED or FAILED is reported here).
 * Best effort and repeatable: a report that could not be delivered is tried
 * again on the next sweep, and Delegate ignores a repeat of one it has.
 */
export async function reportOutcomes(): Promise<number> {
  let sent = 0;
  for (const t of await unreportedOutcomes()) {
    const ok = await reportOutcome(
      t.status === "COMPLETED"
        ? { check_id: t.delegateCheckId!, status: "COMPLETED", reference: t.claimReference, idempotency_key: `tx:${t.id}:COMPLETED` }
        : { check_id: t.delegateCheckId!, status: "FAILED", reason: "PROCESSING_FAILED", idempotency_key: `tx:${t.id}:FAILED` },
    );
    if (ok) {
      await markOutcomeReported(t.id);
      sent += 1;
    }
  }
  return sent;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done);
  });

/** Run until `signal` aborts. Resolves once every slot has finished the item it was on. */
export async function runWorker(o: WorkerOptions = {}): Promise<void> {
  const settings = settingsOf(o);
  const slot = async () => {
    while (!o.signal?.aborted) {
      let result: Processed | null = null;
      try {
        result = await workOne(o);
      } catch (e) {
        // The database was unreachable or similar: nothing is lost, items stay where they were. Wait and try again.
        o.log?.(`worker error: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (result === null) await sleep(settings.pollMs, o.signal);
    }
  };
  const sweeper = async () => {
    while (!o.signal?.aborted) {
      await sleep(settings.pollMs * 10, o.signal);
      if (!o.signal?.aborted) await reportOutcomes().catch(() => undefined);
    }
  };
  await Promise.all([sweeper(), ...Array.from({ length: settings.concurrency }, slot)]);
}
