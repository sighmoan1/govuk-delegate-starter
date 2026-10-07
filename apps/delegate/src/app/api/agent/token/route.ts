import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateAgent, signAgentToken } from "@/lib/agent-auth";
import { recordActivity } from "@/lib/activity";
import { readJson } from "@/lib/http";

// The agent signs in as ITSELF. Failures are activity: they are attempts.
export async function POST(req: Request) {
  const body = await readJson(req);
  const clientId = String(body.client_id ?? "");
  const clientSecret = String(body.client_secret ?? "");
  const result = await authenticateAgent(clientId, clientSecret);
  if (!result.ok) {
    await recordActivity({
      requestId: randomUUID(),
      lane: "UNTRUSTED",
      decision: "DENY",
      reason: result.reason,
      capability: "agent_token",
      delegateId: result.reason === "INVALID_AGENT_AUTHENTICATION" ? result.delegate?.id ?? null : null,
      presentedClientId: clientId.slice(0, 100) || null,
    });
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }
  const token = await signAgentToken(result.delegate.id, result.delegate.clientId);
  return NextResponse.json({ access_token: token, token_type: "Bearer", expires_in: 900, delegate_id: result.delegate.id });
}
