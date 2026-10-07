import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { completeLogin, OIDC_COOKIE } from "@/lib/oidc";
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
    // The stable One Login subject identifier is what identifies the principal.
    const principal = await prisma.principal.upsert({
      where: { oneLoginSubjectId: user.sub },
      update: {},
      create: { oneLoginSubjectId: user.sub, displayName: user.email ?? "GOV.UK One Login user" },
    });
    const res = back(String(payload.returnTo ?? "/account/delegates"));
    res.cookies.set(SESSION_COOKIE, await signSession(principal.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7200 });
    res.cookies.delete(OIDC_COOKIE);
    return res;
  } catch (e) {
    console.error("sign-in failed", e);
    return back("/?signin=failed");
  }
}
