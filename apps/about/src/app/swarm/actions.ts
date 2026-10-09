"use server";

import { redirect } from "next/navigation";
import { defaultEnv, runExperiments } from "@/lib/swarm";
import { saveRun } from "@/lib/swarm-store";

export async function run(formData: FormData) {
  const n = [10, 50, 100].includes(Number(formData.get("n"))) ? Number(formData.get("n")) : 100;
  const result = await runExperiments(defaultEnv(), { n });
  redirect(`/swarm?r=${saveRun(result)}&n=${n}#results`);
}
