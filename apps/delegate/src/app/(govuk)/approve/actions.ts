"use server";

import { redirect } from "next/navigation";
import { currentPrincipal } from "@/lib/session";
import { approveStepUp, declineStepUp } from "@/lib/step-ups";

/** The person approves (or declines) one specific proposed change. The code only works for the person it was issued to. */
export async function decideStepUp(formData: FormData) {
  const code = String(formData.get("code") ?? "").toUpperCase().trim();
  const decision = String(formData.get("decision"));
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/approve?code=${code}`)}`);
  const result = decision === "approve" ? await approveStepUp(code, principal.id) : await declineStepUp(code, principal.id);
  if (!result.ok) redirect(`/approve?code=${code}&error=${result.reason === "NOT_FOUND" ? "not-found" : result.reason.toLowerCase().replace("_", "-")}`);
  redirect(`/approve?code=${code}&done=${decision === "approve" ? "approved" : "declined"}`);
}
