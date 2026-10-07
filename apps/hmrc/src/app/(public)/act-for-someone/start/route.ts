import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { verifyAgentSignature } from "@/lib/agent-identity";
import { raiseAgentRequest } from "@/lib/delegate-agent-requests";
import { sealPending, PENDING_COOKIE } from "@/lib/agent-session";
import { logEvent } from "@/lib/events";

export async function POST(req: Request) {
  const sig = await verifyAgentSignature(req);
  const form = await req.formData().catch(() => new FormData());
  const capabilities = form.getAll("capabilities").map(String);
  const back = (msg: string) => NextResponse.redirect(new URL(`/act-for-someone?error=${encodeURIComponent(msg)}`, config.appUrl), 303);
  if (capabilities.length === 0) return back("Choose at least one thing you need to do.");
  const agent = sig.verified
    ? { web_bot_auth_agent: sig.agent }
    : { name: String(form.get("name") ?? "").trim(), provider: String(form.get("provider") ?? "").trim() };
  if (!sig.verified && (!("name" in agent) || !agent.name || !agent.provider)) return back("Say which assistant you are and who provides it.");
  try {
    const r = await raiseAgentRequest(agent, capabilities);
    await logEvent({
      lane: "DECLARED_AGENT", outcome: "ALLOWED", reason: "DELEGATION_REQUESTED", path: "/act-for-someone/start", latencyMs: 0, agentName: r.agent.name, assurance: r.agent.assurance,
      signatureAgent: sig.verified ? sig.agent : null, signatureResult: sig.verified ? "verified" : sig.reason, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    const res = NextResponse.redirect(new URL("/act-for-someone/waiting", config.appUrl), 303);
    res.cookies.set(PENDING_COOKIE, await sealPending({ requestId: r.request_id, userCode: r.user_code, agentName: r.agent.name, signatureAgent: sig.verified ? sig.agent : null }), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 1200 });
    return res;
  } catch (e) {
    return back(e instanceof Error ? e.message : "Something went wrong.");
  }
}
