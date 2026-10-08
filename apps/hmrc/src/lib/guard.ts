import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentTaxpayer } from "./session";
import { CHALLENGE_COOKIE, takeToken } from "./friction";
import { logEvent } from "./events";
import { verifyAgentSignatureFromHeaders } from "./agent-identity";
import { currentAgentSession, type AgentSession } from "./agent-session";
import { askDelegate } from "./delegate-client";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";

export type Viewer = { kind: "person"; taxpayer: Taxpayer } | { kind: "agent"; taxpayer: Taxpayer; session: AgentSession };

/**
 * Pages for signed-in people, or for an agent the person has approved.
 *  - an approved agent is checked with GOV.UK Delegate (so removing access ends it);
 *  - a known agent without permission goes to "Act for someone", even if it
 *    holds the person's own session;
 *  - anyone else is sent to sign in; anonymous traffic that keeps hammering
 *    these pages meets the challenge page first.
 */
export async function requireViewer(path: string, capability: string): Promise<Viewer> {
  const started = Date.now();
  const h = await headers();
  const sig = await verifyAgentSignatureFromHeaders(h, "GET", path);
  const evidence = {
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    signatureAgent: sig.verified ? sig.agent : sig.agent ?? null,
    signatureResult: sig.verified ? "verified" : sig.reason,
  };
  const log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs" | "capability">) =>
    logEvent({ ...evidence, ...e, path, capability, latencyMs: Date.now() - started });

  const session = await currentAgentSession();
  if (session) {
    if (session.signatureAgent && !(sig.verified && sig.agent === session.signatureAgent)) {
      await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "AGENT_SESSION_NOT_BOUND", agentName: session.agentName });
      redirect("/act-for-someone?ended=session");
    }
    const check = await askDelegate({ agent_token: session.delegationToken, principal_id: session.principalId, capability: "view_tax_code" });
    if (!check.authorised && ["AUTHORISATION_REVOKED", "AUTHORISATION_EXPIRED", "NO_AUTHORISATION", "UNKNOWN_DELEGATE"].includes(check.reason)) {
      await log({ lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: check.reason, agentName: session.agentName, subject: session.subject });
      redirect(`/act-for-someone/stop?ended=${check.reason}`);
    }
    await log({ lane: "AUTHORISED_AGENT", outcome: "ALLOWED", agentName: session.agentName, subject: session.subject, delegationId: session.delegationId, assurance: session.assurance });
    return { kind: "agent", taxpayer: await findOrCreateTaxpayer(session.subject), session };
  }

  if (sig.verified) {
    // An agent using the person's own session (or about to sign in with their
    // password): not the person. Show it the proper route.
    const person = await currentTaxpayer();
    await log({ lane: "DECLARED_AGENT", outcome: "REFUSED", reason: "AGENT_NOT_AUTHORISED", agentName: sig.name, subject: person?.oneLoginSubject ?? null });
    redirect(`/act-for-someone?from=${encodeURIComponent(path)}`);
  }

  const taxpayer = await currentTaxpayer();
  if (taxpayer) {
    await log({ lane: "AUTHENTICATED_HUMAN", outcome: "ALLOWED", subject: taxpayer.oneLoginSubject });
    return { kind: "person", taxpayer };
  }
  const jar = await cookies();
  if (!jar.get(CHALLENGE_COOKIE)) {
    const key = h.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const rl = takeToken(`anon-page:${key}`, "UNTRUSTED");
    if (!rl.allowed) {
      await log({ lane: "UNTRUSTED", outcome: "CHALLENGED" });
      redirect(`/challenge?returnTo=${encodeURIComponent(path)}`);
    }
  }
  redirect(`/sign-in?returnTo=${encodeURIComponent(path)}`);
}

/** Kept for pages that only people use. */
export async function requireSignedIn(path: string, capability: string) {
  const v = await requireViewer(path, capability);
  return v.taxpayer;
}
