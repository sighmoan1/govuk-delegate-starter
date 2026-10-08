"use server";

import { redirect } from "next/navigation";
import { urls } from "@/lib/config";

export type Burst = { who: "bot" | "web"; n: number; gotData: number; counts: Record<string, number>; medianMs: number; error?: string };

const N = 40;
const PAGE = "/prioritise-trusted-traffic";

function summarise(who: Burst["who"], rows: { status: number; ms: number; label: string }[], ok: (r: { status: number }) => boolean): Burst {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.label] = (counts[r.label] ?? 0) + 1;
  // Time to an answer: throttled requests never got one.
  const answered = rows.filter((r) => r.status !== 429).map((r) => r.ms).sort((a, b) => a - b);
  return { who, n: rows.length, gotData: rows.filter(ok).length, counts, medianMs: answered[Math.floor(answered.length / 2)] ?? 0 };
}

const back = (b: Burst) => redirect(`${PAGE}?r=${Buffer.from(JSON.stringify(b)).toString("base64url")}#results`);

const apiLabel = (status: number) =>
  status === 200 ? "200 OK" : status === 429 ? "429 Too many requests" : status === 401 ? "401 Plain-text refusal" : `${status}`;

/** An unregistered bot: no identity at all, straight at HMRC's API. */
export async function botBurst() {
  const rows = await Promise.all(
    Array.from({ length: N }, async () => {
      const t = Date.now();
      const res = await fetch(`${urls.hmrcInternal}/api/tax-code`, { headers: { "x-forwarded-for": "203.0.113.77" }, cache: "no-store" });
      await res.text();
      return { status: res.status, ms: Date.now() - t, label: apiLabel(res.status) };
    }),
  );
  back(summarise("bot", rows, (r) => r.status === 200));
}

/** Someone not signed in loading HMRC's "Your tax" page over and over. */
export async function webBurst() {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    const res = await fetch(`${urls.hmrcInternal}/your-tax`, { redirect: "manual", headers: { "x-forwarded-for": "203.0.113.88" }, cache: "no-store" });
    const loc = res.headers.get("location") ?? "";
    rows.push({ status: res.status, ms: Date.now() - t, label: loc.includes("/challenge") ? "Sent to the “Before you continue” check" : "Sent to sign in" });
  }
  back(summarise("web", rows, () => false));
}
