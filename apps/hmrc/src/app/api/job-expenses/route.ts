import { requireDelegatedAuthority } from "@/lib/delegated-authority";
import { claimJobExpenses } from "@/lib/taxpayers";
import { receiveClaim } from "@/lib/transactions";

export const dynamic = "force-dynamic";
// Synchronous by default. With `Prefer: respond-async` (and an Idempotency-Key) HMRC stores the claim and answers
// 202 with a receipt and a Location; a worker records the claim later (docs/DECISIONS.md, Decision 25).
export const POST = requireDelegatedAuthority("claim_job_expenses", ({ taxpayer, actor, admitted, db, async, checkId }) =>
  async ? receiveClaim(taxpayer, actor, admitted, db, checkId) : claimJobExpenses(taxpayer, actor, admitted, db));
