"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentPrincipal } from "@/lib/session";

/** Sam approves (or declines) one consequential action, once. */
export async function decideStepUp(formData: FormData) {
  const code = String(formData.get("code") ?? "").toUpperCase().trim();
  const decision = String(formData.get("decision"));
  const principal = await currentPrincipal();
  if (!principal) redirect(`/auth/login?returnTo=${encodeURIComponent(`/approve?code=${code}`)}`);
  const stepUp = await prisma.stepUp.findUnique({ where: { userCode: code }, include: { mandate: true } });
  if (!stepUp || stepUp.mandate.principalId !== principal.id || stepUp.status !== "PENDING") redirect(`/approve?code=${code}&error=not-found`);
  if (decision === "approve") {
    await prisma.stepUp.update({ where: { id: stepUp.id }, data: { status: "APPROVED", approvedAt: new Date() } });
    redirect(`/approve?code=${code}&done=approved`);
  }
  await prisma.stepUp.delete({ where: { id: stepUp.id } });
  redirect(`/approve?code=${code}&done=declined`);
}
