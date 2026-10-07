"use server";

import { redirect } from "next/navigation";
import { currentTaxpayer } from "@/lib/session";
import { claimJobExpenses } from "@/lib/taxpayers";
import { logEvent } from "@/lib/events";
import { withPrincipalCapacity } from "@/lib/capacity";

/**
 * The person's own claim, made on the website. The same business function, and
 * the same per-person limits, as the agent API: if an agent HMRC can't see is
 * driving this browser, it still spends this person's capacity.
 */
export async function submitClaim() {
  const started = Date.now();
  const taxpayer = await currentTaxpayer();
  if (!taxpayer) redirect("/auth/login?returnTo=/claim");
  const run = await withPrincipalCapacity(taxpayer, "claim_job_expenses", {}, (admitted) => claimJobExpenses(taxpayer, { kind: "SELF" }, admitted));
  const base = { lane: "AUTHENTICATED_HUMAN" as const, capability: "claim_job_expenses", path: "/claim/check", subject: taxpayer.oneLoginSubject };
  if (!run.ok) {
    await logEvent({ ...base, outcome: "REFUSED", reason: run.refusal.reason, rule: run.refusal.rule, capacityUsed: run.refusal.used, capacityLimit: run.refusal.limit, latencyMs: Date.now() - started });
    redirect(`/your-tax?refused=${run.refusal.reason}`);
  }
  await logEvent({ ...base, outcome: "ALLOWED", rule: run.admitted.rule, capacityUsed: run.admitted.used, capacityLimit: run.admitted.limit, latencyMs: Date.now() - started });
  redirect(`/your-tax?claimed=${encodeURIComponent(run.result.claim_reference)}`);
}
