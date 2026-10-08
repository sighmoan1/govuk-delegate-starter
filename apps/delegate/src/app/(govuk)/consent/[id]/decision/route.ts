import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { approveRequest, rejectRequest, loadRequest, returnTo, DomainError } from "@/lib/requests";
import { principalFromRequest, cookieFromHeader, SESSION_COOKIE } from "@/lib/session";
import { requestOrigin, verifyDecisionToken } from "@/lib/consent-csrf";
import { verifyAgentSignature } from "@/lib/agent-identity";

// The person's decision on the consent screen. A plain form POST answered with a
// 303, so the browser really leaves GOV.UK for the agent's registered return URL,
// as with an OAuth consent screen.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const go = (url: string) => NextResponse.redirect(new URL(url, config.appUrl), 303);

  // Same-origin only: a form on another site must not be able to approve. A
  // missing Origin (and Referer) is not let through.
  if (requestOrigin(req) !== new URL(config.appUrl).origin) {
    return NextResponse.json({ error: "CROSS_ORIGIN" }, { status: 403 });
  }
  const form = await req.formData();
  // Nobody signed in has anything to forge: send them to sign in first.
  const principal = await principalFromRequest(req);
  if (!principal) return go(`/auth/login?returnTo=${encodeURIComponent(`/consent/${id}`)}`);
  // Origin can be absent or spoofed by non-browser clients, so the decision also
  // needs the token issued with this form for this session and this request.
  const session = cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE);
  if (!verifyDecisionToken(session, id, form.get("csrf"))) {
    return NextResponse.json({ error: "BAD_CSRF_TOKEN" }, { status: 403 });
  }

  // Only the person can give permission. A browser that signs its requests as
  // an AI agent is the agent, even if it holds the person's session.
  const signed = await verifyAgentSignature(req);
  if (signed.verified) return go(`/consent/${id}?error=AGENT_CANNOT_APPROVE`);

  const decision = String(form.get("decision"));
  try {
    if (decision === "approve") {
      await approveRequest(id, principal.id, form.getAll("c").map(String));
    } else if (decision === "reject") {
      await rejectRequest(id, principal.id);
    } else {
      return go(`/consent/${id}`);
    }
  } catch (e) {
    if (e instanceof DomainError) return go(`/consent/${id}?error=${e.code}`);
    throw e;
  }
  const r = await loadRequest(id);
  const status = decision === "approve" ? "approved" : "rejected";
  const back = r && returnTo(r, status);
  if (back) return NextResponse.redirect(back, 303);
  return go(decision === "approve" ? `/consent/${id}/confirmation` : "/account/delegates?rejected=1");
}
