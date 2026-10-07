"use server";

import { redirect } from "next/navigation";
import { callService } from "@/lib/agent/hmrc-client";

/** Send one request with no agent identity, to show the untrusted lane. */
export async function sendUnidentified() {
  const r = await callService("view_tax_code", null, {}, false);
  redirect(`/operator/activity?untrusted=${r.status}#session`);
}
