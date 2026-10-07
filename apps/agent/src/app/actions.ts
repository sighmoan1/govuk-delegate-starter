"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { act, flood, runBot, startRun } from "@/lib/runner";

/** The agent's memory of Sam: the opaque id Delegate gave it, from its latest run that has one. */
export async function knownPerson() {
  return prisma.run.findFirst({ where: { persona: "AGENT", principalId: { not: null } }, orderBy: { createdAt: "desc" } });
}

export async function runTask() {
  const known = await knownPerson();
  await startRun(known?.principalId ?? null, known?.granted ?? []);
  redirect("/#log");
}

export async function forgetAndRun() {
  await startRun(null);
  redirect("/#log");
}

export async function tryAction(formData: FormData) {
  const runId = String(formData.get("run"));
  const cap = String(formData.get("capability"));
  await act(runId, null, [cap]);
  redirect("/#log");
}

export async function runBotTask() {
  await runBot();
  redirect("/bot#log");
}

export async function floodAs(formData: FormData) {
  const persona = formData.get("persona") === "BOT" ? "BOT" : "AGENT";
  const known = await knownPerson();
  await flood(persona, 40, known?.principalId ? { principalId: known.principalId } : null);
  redirect("/flood#results");
}
