import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentTaxpayer } from "./session";
import { CHALLENGE_COOKIE, takeToken } from "./friction";
import { logEvent } from "./events";

/**
 * Pages for signed-in people. Anyone else is sent to sign in; anonymous
 * traffic that keeps hammering these pages meets the challenge page first.
 */
export async function requireSignedIn(path: string, capability: string) {
  const started = Date.now();
  const taxpayer = await currentTaxpayer();
  if (taxpayer) {
    await logEvent({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", capability, path, subject: taxpayer.oneLoginSubject, latencyMs: Date.now() - started });
    return taxpayer;
  }
  const jar = await cookies();
  if (!jar.get(CHALLENGE_COOKIE)) {
    const h = await headers();
    const key = h.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const rl = takeToken(`anon-page:${key}`, "UNTRUSTED");
    if (!rl.allowed) {
      await logEvent({ lane: "UNTRUSTED", outcome: "CHALLENGED", path, latencyMs: Date.now() - started });
      redirect(`/challenge?returnTo=${encodeURIComponent(path)}`);
    }
  }
  redirect(`/auth/login?returnTo=${encodeURIComponent(path)}`);
}
