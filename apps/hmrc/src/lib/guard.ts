import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentTaxpayer } from "./session";
import { CHALLENGE_COOKIE, takeToken } from "./friction";
import { logEvent } from "./events";
import { verifyAgentSignatureFromHeaders } from "./agent-identity";
import { currentAgentSession, type AgentSession } from "./agent-session";
import { askDelegate } from "./delegate-client";
import { findOrCreateTaxpayer, type Taxpayer } from "./taxpayers";

/** An agent viewer lists the capabilities Delegate confirmed; pages showing several kinds of data must omit what is not listed. */
export type Viewer = { kind: "person"; taxpayer: Taxpayer } | { kind: "agent"; taxpayer: Taxpayer; session: AgentSession; granted: string[] };

const SESSION_ENDED = ["AUTHORISATION_REVOKED", "AUTHORISATION_EXPIRED", "NO_AUTHORISATION", "UNKNOWN_DELEGATE"];

/** Can this viewer see data guarded by this capability? People can; agents only if Delegate said yes. */
export const viewerCan = (v: Viewer, capability: string) => v.kind === "person" || v.granted.includes(capability);

/**
 * Pages for signed-in people, or for an agent the person has approved.
 *  - an approved agent is checked with GOV.UK Delegate (so removing access ends it);
 *  - a known agent without permission goes to "Act for someone", even if it
 *    holds the person's own session;
 *  - anyone else is sent to sign in; anonymous traffic that keeps hammering
 *    these pages meets the challenge page first.
 */
export async function requireViewer(path: string, capability: string | string[]): Promise<Viewer> {
  const started = Date.now();
  const h = await headers();
  const sig = await verifyAgentSignatureFromHeaders(h, "GET", path);
  const evidence = {
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    signatureAgent: sig.verified ? sig.agent : sig.agent ?? null,
    signatureResult: sig.verified ? "verified" : sig.reason,
  };
  const log = (e: Omit<Parameters<typeof logEvent>[0], "path" | "latencyMs">) =>
    logEvent({ ...evidence, capability: Array.isArray(capability) ? capability.join(",") : capability, ...e, path, latencyMs: Date.now() - started });

  const session = await currentAgentSession();
  if (session) {
    if (session.signatureAgent && !(sig.verified && sig.agent === session.signatureAgent)) {
      await log({ lane: "UNTRUSTED", outcome: "REFUSED", reason: "AGENT_SESSION_NOT_BOUND", agentName: session.agentName });
      redirect("/act-for-someone?ended=session");
    }
    // Fail closed: ask Delegate about every capability this page needs, and let
    // the agent in only for those Delegate positively authorises. An outage,
    // an error or any unrecognised answer counts as a refusal.
    const wanted = Array.isArray(capability) ? capability : [capability];
    const granted: string[] = [];
    let firstDenial: { reason: string; checkId: string | null } | null = null;
    let allowedCheckId: string | null = null;
    for (const cap of wanted) {
      let reason = "DELEGATE_UNAVAILABLE";
      let checkId: string | null = null;
      try {
        const check = await askDelegate({ agent_token: session.delegationToken, principal_id: session.principalId, capability: cap });
        if (check && check.authorised === true) {
          granted.push(cap);
          allowedCheckId ??= check.check_id ?? null;
          continue;
        }
        reason = (check && typeof check.reason === "string" && check.reason) || "DENIED";
        checkId = check?.check_id ?? null;
      } catch {
        // Delegate unreachable or returned an error: no answer is not a yes.
      }
      firstDenial ??= { reason, checkId };
    }
    if (granted.length === 0) {
      const denial = firstDenial ?? { reason: "DENIED", checkId: null };
      await log({ lane: "AUTHORISED_AGENT", outcome: "REFUSED", reason: denial.reason, delegateCheckId: denial.checkId, agentName: session.agentName, subject: session.subject });
      // The permission has ended: forget the session. Otherwise (missing
      // permission, assurance, outage) keep it and say what is wrong.
      if (SESSION_ENDED.includes(denial.reason)) redirect(`/act-for-someone/stop?ended=${encodeURIComponent(denial.reason)}`);
      redirect(`/act-for-someone?denied=${encodeURIComponent(denial.reason)}`);
    }
    await log({ lane: "AUTHORISED_AGENT", outcome: "ALLOWED", capability: granted.join(","), delegateCheckId: allowedCheckId, agentName: session.agentName, subject: session.subject, delegationId: session.delegationId, assurance: session.assurance });
    return { kind: "agent", taxpayer: await findOrCreateTaxpayer(session.subject), session, granted };
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
