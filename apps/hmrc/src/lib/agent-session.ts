// An agent acting for someone in a browser, after the person approved it on
// GOV.UK: a session bound to the agent (and to its signature, if it signs) and
// to one delegation in Delegate. Every action still asks Delegate.
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { cookieFromHeader } from "./session";

export const AGENT_SESSION_COOKIE = "hmrc_agent_session";
export const PENDING_COOKIE = "hmrc_agent_pending";

export type AgentSession = {
  delegationToken: string;
  delegationId: string;
  principalId: string;
  subject: string;
  agentName: string;
  agentProvider: string;
  assurance: "VERIFIED" | "REGISTERED" | "DECLARED";
  signatureAgent: string | null; // if set, every request must carry this agent's valid signature
  granted: string[];
};

export type PendingRequest = { requestId: string; userCode: string; agentName: string; signatureAgent: string | null };

const ISS = "hmrc-demo";

export async function sealAgentSession(s: AgentSession) {
  return new SignJWT({ typ: "agent-session", ...s }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISS).setIssuedAt().setExpirationTime("4h").sign(config.sessionSecret);
}
export async function sealPending(p: PendingRequest) {
  return new SignJWT({ typ: "agent-pending", ...p }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISS).setIssuedAt().setExpirationTime("20m").sign(config.sessionSecret);
}

async function open<T>(token: string | undefined, typ: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret, { issuer: ISS });
    return payload.typ === typ ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

export const agentSessionFromRequest = (req: Request) => open<AgentSession>(cookieFromHeader(req.headers.get("cookie"), AGENT_SESSION_COOKIE), "agent-session");
export const pendingFromRequest = (req: Request) => open<PendingRequest>(cookieFromHeader(req.headers.get("cookie"), PENDING_COOKIE), "agent-pending");
export async function currentAgentSession() {
  return open<AgentSession>((await cookies()).get(AGENT_SESSION_COOKIE)?.value, "agent-session");
}
export async function currentPending() {
  return open<PendingRequest>((await cookies()).get(PENDING_COOKIE)?.value, "agent-pending");
}
