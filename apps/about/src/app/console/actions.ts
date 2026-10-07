"use server";

import { redirect } from "next/navigation";
import { demoConsoleKey, urls } from "@/lib/config";

export type FloodSummary = { who: "bot" | "agent"; n: number; gotData: number; counts: Record<string, number>; medianMs: number; error?: string };

const N = 40;

function summarise(who: FloodSummary["who"], rows: { status: number; ms: number; reason?: string | null }[]): FloodSummary {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = r.status === 200 ? "200 OK" : r.status === 429 ? "429 Too many requests" : `${r.status} ${r.reason ?? "Refused"}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  // Time to an answer: throttled requests never got one.
  const answered = rows.filter((r) => r.status !== 429).map((r) => r.ms).sort((a, b) => a - b);
  return { who, n: rows.length, gotData: rows.filter((r) => r.status === 200).length, counts, medianMs: answered[Math.floor(answered.length / 2)] ?? 0 };
}

const back = (s: FloodSummary) => redirect(`/console?r=${Buffer.from(JSON.stringify(s)).toString("base64url")}#results`);

/** An unregistered bot: no identity at all, straight at HMRC's API. */
export async function floodAsBot() {
  const rows = await Promise.all(
    Array.from({ length: N }, async () => {
      const t = Date.now();
      const res = await fetch(`${urls.hmrcInternal}/api/tax-code`, { headers: { "x-forwarded-for": "203.0.113.77" }, cache: "no-store" });
      await res.text();
      return { status: res.status, ms: Date.now() - t, reason: res.status === 401 ? "Plain-text refusal" : null };
    }),
  );
  back(summarise("bot", rows));
}

/** Example AI, acting for Sam with the permission Sam gave. It sends the requests itself. */
export async function floodAsAgent() {
  const res = await fetch(`${urls.agentInternal}/api/demo/flood`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-demo-key": demoConsoleKey() },
    body: JSON.stringify({ n: N }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    back({ who: "agent", n: 0, gotData: 0, counts: {}, medianMs: 0, error: body.message ?? "Example AI could not run the test." });
  }
  back(summarise("agent", body.statuses));
}
