import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { prisma } from "./db";

export const SESSION_COOKIE = "delegate_session";
const ISSUER = "govuk-delegate";

export async function signSession(principalId: string): Promise<string> {
  return new SignJWT({ typ: "principal-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(principalId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(config.sessionSecret);
}

export async function principalIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { issuer: ISSUER });
    return payload.typ === "principal-session" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function currentPrincipal() {
  const jar = await cookies();
  const id = await principalIdFromToken(jar.get(SESSION_COOKIE)?.value);
  return id ? prisma.principal.findUnique({ where: { id } }) : null;
}

/** Read a Cookie header by name (for route handlers that get a Request). */
export function cookieFromHeader(header: string | null, name: string): string | undefined {
  return header?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function principalFromRequest(req: Request) {
  const id = await principalIdFromToken(cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE));
  return id ? prisma.principal.findUnique({ where: { id } }) : null;
}
