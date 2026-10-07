import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { prisma } from "./db";
import { verifySecret } from "./secrets";

const ISS = "govuk-delegate";
const AUD = "delegate-agent-api";

export type AgentAuthFailure = "UNKNOWN_DELEGATE" | "INVALID_AGENT_AUTHENTICATION";

/** Client-credentials style: the agent proves who IT is. Never the principal. */
export async function authenticateAgent(clientId: string, clientSecret: string) {
  const delegate = await prisma.delegate.findUnique({ where: { clientId } });
  if (!delegate || delegate.status !== "ACTIVE") return { ok: false as const, reason: "UNKNOWN_DELEGATE" as const };
  if (!verifySecret(clientSecret, delegate.clientSecretHash)) {
    return { ok: false as const, reason: "INVALID_AGENT_AUTHENTICATION" as const, delegate };
  }
  return { ok: true as const, delegate };
}

export async function signAgentToken(delegateId: string, clientId: string, ttlSeconds = 900) {
  return new SignJWT({ typ: "delegate-agent", cid: clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(delegateId)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(config.agentTokenSecret);
}

export async function verifyAgentToken(token: string): Promise<{ delegateId: string; clientId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, config.agentTokenSecret, { issuer: ISS, audience: AUD });
    if (payload.typ !== "delegate-agent" || !payload.sub) return null;
    return { delegateId: payload.sub, clientId: String(payload.cid ?? "") };
  } catch {
    return null;
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/** For the delegate-facing authorisation-request API. */
export async function delegateFromRequest(req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const claims = await verifyAgentToken(token);
  if (!claims) return null;
  const delegate = await prisma.delegate.findUnique({ where: { id: claims.delegateId } });
  return delegate && delegate.status === "ACTIVE" ? delegate : null;
}
