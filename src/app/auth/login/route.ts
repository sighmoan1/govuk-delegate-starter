import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { config } from "@/lib/config";
import { authorizeUrl, OIDC_COOKIE } from "@/lib/oidc";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/account/delegates";
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account/delegates";
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
