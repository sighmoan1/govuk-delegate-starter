import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { agentRequestStatus } from "@/lib/delegate-agent-requests";
import { pendingFromRequest, sealAgentSession, AGENT_SESSION_COOKIE, PENDING_COOKIE } from "@/lib/agent-session";
import { verifyAgentSignature } from "@/lib/agent-identity";
import { findOrCreateTaxpayer } from "@/lib/taxpayers";

/** Has the person decided? If they approved, the agent's session begins. */
export async function GET(req: Request) {
  const go = (path: string) => NextResponse.redirect(new URL(path, config.appUrl), 303);
  const pending = await pendingFromRequest(req);
  if (!pending) return go("/act-for-someone");
  // A signing agent must still be the one asking.
  if (pending.signatureAgent) {
    const sig = await verifyAgentSignature(req);
    if (!(sig.verified && sig.agent === pending.signatureAgent)) return go("/act-for-someone?ended=session");
  }
  const s = await agentRequestStatus(pending.requestId);
  if (!s || s.status === "PENDING") return go("/act-for-someone/waiting");
  if (s.status !== "APPROVED" || !s.delegation_token || !s.principal_id || !s.subject) {
    const res = go(`/act-for-someone?error=${encodeURIComponent(s.status === "REJECTED" ? "The person said no." : "The code ran out. Get a new one.")}`);
    res.cookies.delete(PENDING_COOKIE);
    return res;
  }
  await findOrCreateTaxpayer(s.subject);
  const res = go("/your-tax");
  res.cookies.delete(PENDING_COOKIE);
  res.cookies.set(
    AGENT_SESSION_COOKIE,
    await sealAgentSession({
      delegationToken: s.delegation_token, delegationId: s.delegation_id!, principalId: s.principal_id, subject: s.subject,
      agentName: s.agent?.name ?? pending.agentName, agentProvider: s.agent?.provider ?? "", assurance: s.assurance ?? "DECLARED",
      signatureAgent: pending.signatureAgent, granted: s.granted ?? [],
    }),
    { httpOnly: true, sameSite: "lax", path: "/", maxAge: 4 * 3600 },
  );
  return res;
}
