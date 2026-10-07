import { createHash } from "node:crypto";
import { cookies } from "next/headers";

const env = (n: string, f: string) => process.env[n] || f;

export const simulator = () => env("SIMULATOR_INTERNAL_URL", "http://localhost:3399");
export const aboutUrl = () => env("ABOUT_URL", "http://localhost:3304");
export const demoEmail = () => env("DEMO_EMAIL", "sam.taylor@example.com");

// The sign-in in progress: the relying party's original /authorize query, and the email typed so far.
const COOKIE = "ol_signin";
type Flow = { authorize: string; email?: string };

export async function readFlow(): Promise<Flow | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, "base64url").toString()); } catch { return null; }
}

export async function writeFlow(flow: Flow) {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 900 });
}

export async function clearFlow() {
  (await cookies()).delete(COOKIE);
}

/** One person per email address. The demo email is the seeded person. */
export function subjectFor(email: string) {
  const e = email.trim().toLowerCase();
  if (e === demoEmail()) return env("DEMO_SUBJECT", "urn:fdc:gov.uk:2022:56P4CMsGh_02YOlWpd8PAOI-2sVlB2nsNU7mcLZYhYw=");
  return `urn:fdc:gov.uk:2022:${createHash("sha256").update(e).digest("base64url").slice(0, 43)}`;
}

/**
 * Tell the simulator who just signed in, then let it finish the authorisation
 * code flow exactly as it normally would. Returns the relying party redirect.
 */
export async function completeWithSimulator(flow: Flow, email: string): Promise<string> {
  const cfg = await fetch(`${simulator()}/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ responseConfiguration: { sub: subjectFor(email), email: email.trim().toLowerCase(), emailVerified: true } }),
    cache: "no-store",
  });
  if (!cfg.ok) throw new Error(`Simulator config failed (${cfg.status})`);
  const res = await fetch(`${simulator()}/authorize?${flow.authorize}`, { redirect: "manual", cache: "no-store" });
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) throw new Error(`Simulator did not redirect (${res.status})`);
  return location;
}
