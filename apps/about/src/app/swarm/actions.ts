"use server";

import { redirect } from "next/navigation";
import { runSwarm } from "@/lib/swarm";

export async function run(formData: FormData) {
  const n = [10, 50, 100].includes(Number(formData.get("n"))) ? Number(formData.get("n")) : 100;
  const result = await runSwarm(n);
  redirect(`/swarm?r=${Buffer.from(JSON.stringify(result)).toString("base64url")}#results`);
}
