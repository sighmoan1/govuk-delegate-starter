import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { config } from "@/lib/config";
import { authorizeUrl, OIDC_COOKIE } from "@/lib/oidc";
import { pendingFromRequest } from "@/lib/agent-session";
import { logEvent } from "@/lib/events";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // A visitor that asked to act for someone and, with the request still open,
  // heads for the sign-in instead: it gave up on the proper route. Worth
  // measuring, because that is the moment an agent starts to impersonate.
  const pending = await pendingFromRequest(req);
  if (pending) {
    await logEvent({
      lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "ABANDONED_AGENT_ROUTE", path: "/auth/login", latencyMs: 0, agentName: pending.agentName,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, signatureAgent: pending.signatureAgent,
    }).catch(() => {});
  }
  const returnTo = url.searchParams.get("returnTo") ?? "/your-tax";
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/your-tax";
  const state = randomUUID();
  const nonce = randomUUID();
  const cookie = await new SignJWT({ state, nonce, returnTo: safe })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(config.sessionSecret);
  const res = NextResponse.redirect(authorizeUrl(state, nonce));
  res.cookies.set(OIDC_COOKIE, cookie, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
