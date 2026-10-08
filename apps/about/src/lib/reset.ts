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
 * Put both services back to a starting point.
 *   clean        nobody can act for Sam
 *   with-access  Sam has already let the assistant view her tax code and claim relief
 */
export async function resetDemo(formData: FormData) {
  const mode = formData.get("mode") === "with-access" ? "with-access" : "clean";
  const back = String(formData.get("back") ?? "/");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/";

  await post(urls.delegateInternal, { withAuthority: mode === "with-access" });
  await post(urls.hmrcInternal, {});

  redirect(`${safe}?reset=${mode}#start`);
}
