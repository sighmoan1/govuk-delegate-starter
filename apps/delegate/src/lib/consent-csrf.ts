import { createHmac } from "node:crypto";
import { config } from "./config";
import { safeEqual } from "./secrets";

// Anti-CSRF token for the consent decision forms. It is an HMAC of the person's
// session cookie and the pending request id, so it is unguessable without the
// server secret, differs per session, and is valid for one request only. Replay
// of a used form is stopped by the request leaving PENDING.
export function decisionToken(sessionCookie: string, requestId: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(`consent-decision\n${requestId}\n${sessionCookie}`)
    .digest("base64url");
}

export function verifyDecisionToken(sessionCookie: string | undefined, requestId: string, token: unknown): boolean {
  if (!sessionCookie || typeof token !== "string" || token === "") return false;
  return safeEqual(token, decisionToken(sessionCookie, requestId));
}

/** The origin a browser says a form was posted from: Origin, else Referer. Null if neither is usable. */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = req.headers.get("referer");
  if (!origin && referer) {
    try { return new URL(referer).origin; } catch { return null; }
  }
  return null;
}
