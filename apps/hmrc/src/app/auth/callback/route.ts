import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { config } from "@/lib/config";
import { completeLogin, OIDC_COOKIE } from "@/lib/oidc";
import { findOrCreateTaxpayer } from "@/lib/taxpayers";
import { signSession, SESSION_COOKIE, cookieFromHeader } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (path: string) => NextResponse.redirect(new URL(path, config.appUrl));
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state) return back("/?signin=failed");
    const raw = cookieFromHeader(req.headers.get("cookie"), OIDC_COOKIE);
    if (!raw) return back("/?signin=failed");
    const { payload } = await jwtVerify(raw, config.sessionSecret);
    if (payload.state !== state) return back("/?signin=failed");

    const user = await completeLogin(code, String(payload.nonce));
    // The One Login subject is how HMRC knows its customer, today and when an agent acts for them.
    const taxpayer = await findOrCreateTaxpayer(user.sub, user.email);
    const res = back(String(payload.returnTo ?? "/your-tax"));
    res.cookies.set(SESSION_COOKIE, await signSession(taxpayer.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7200 });
    res.cookies.delete(OIDC_COOKIE);
    return res;
  } catch (e) {
    console.error("sign-in failed", e);
    return back("/?signin=failed");
  }
}
