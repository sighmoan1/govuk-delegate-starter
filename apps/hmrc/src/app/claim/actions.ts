"use server";

import { redirect } from "next/navigation";
import { currentTaxpayer, } from "@/lib/session";
import { claimJobExpenses } from "@/lib/taxpayers";
import { logEvent } from "@/lib/events";

/** The person's own claim, made on the website. The same business function the agent API uses. */
export async function submitClaim() {
  const started = Date.now();
  const taxpayer = await currentTaxpayer();
  if (!taxpayer) redirect("/auth/login?returnTo=/claim");
  const result = await claimJobExpenses(taxpayer, { kind: "SELF" });
  await logEvent({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", capability: "claim_job_expenses", path: "/claim/check", subject: taxpayer.oneLoginSubject, latencyMs: Date.now() - started });
  redirect(`/your-tax?claimed=${encodeURIComponent(result.claim_reference)}`);
}
