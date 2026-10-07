import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { prisma } from "./db";

// HMRC's own session for people who signed in with One Login. Nothing to do
// with Delegate: an agent never holds one of these.
export const SESSION_COOKIE = "hmrc_session";
const ISSUER = "hmrc-demo";

export async function signSession(taxpayerId: string): Promise<string> {
  return new SignJWT({ typ: "hmrc-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(taxpayerId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(config.sessionSecret);
}

async function taxpayerIdFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { issuer: ISSUER });
    return payload.typ === "hmrc-session" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function currentTaxpayer() {
  const jar = await cookies();
  const id = await taxpayerIdFromToken(jar.get(SESSION_COOKIE)?.value);
  return id ? prisma.taxpayer.findUnique({ where: { id } }) : null;
}

export function cookieFromHeader(header: string | null, name: string): string | undefined {
  return header?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function taxpayerFromRequest(req: Request) {
  const id = await taxpayerIdFromToken(cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE));
  return id ? prisma.taxpayer.findUnique({ where: { id } }) : null;
}
