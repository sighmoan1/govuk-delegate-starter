"use server";

import { redirect } from "next/navigation";
import { demoConsoleKey, urls } from "./config";

async function post(base: string, body: unknown) {
  const res = await fetch(`${base}/api/demo/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-key": demoConsoleKey() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reset failed at ${base} (${res.status})`);
  return res.json();
}

/**
 * Put all three services back to a starting point.
 *   clean        nobody can act for Sam; Example AI knows nothing
 *   with-access  Sam has already let Example AI view her tax code and claim relief
 */
export async function resetDemo(formData: FormData) {
  const mode = formData.get("mode") === "with-access" ? "with-access" : "clean";
  const back = String(formData.get("back") ?? "/");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/";

  const delegate = await post(urls.delegateInternal, { withAuthority: mode === "with-access" });
  await post(urls.hmrcInternal, {});
  await post(urls.agentInternal, mode === "with-access" ? { principal_id: delegate.principal_id, granted: delegate.granted } : {});

  redirect(`${safe}?reset=${mode}#start`);
}
