// Runs HMRC's queue worker as its own process: `npm run worker -w apps/hmrc`.
// Start as many as you like; they share the work safely. Ctrl-C or SIGTERM lets
// items in hand finish, then exits. Settings: HMRC_QUEUE_* (see src/lib/transaction-queue.ts).
import { runWorker } from "../src/lib/worker";
import { queueSettings } from "../src/lib/transaction-queue";
import { prisma } from "../src/lib/db";

const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { console.log(`[worker] ${sig}: finishing items in hand`); controller.abort(); });

const s = queueSettings();
console.log(`[worker] started: ${s.concurrency} at a time, lease ${s.leaseMs / 1000}s, up to ${s.maxAttempts} attempts`);
runWorker({ signal: controller.signal, log: (m) => console.log(`[worker] ${m}`) })
  .then(() => console.log("[worker] stopped"))
  .finally(() => prisma.$disconnect());
