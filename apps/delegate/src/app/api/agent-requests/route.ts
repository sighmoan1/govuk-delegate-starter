import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { fail, readJson } from "@/lib/http";
import { serviceFromRequest } from "@/lib/service-auth";
import { createServiceInitiatedRequest } from "@/lib/agent-requests";

/**
 * A service raises a request for an agent that has arrived without its own
 * Delegate credentials (an agent in a browser).
 *   { service, agent: { web_bot_auth_agent } | { name, provider }, capabilities }
 * The service tells Delegate whether it verified the agent's signature;
 * otherwise the agent's identity is recorded as declared.
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  const service = await serviceFromRequest(req, String(b.service ?? ""));
  if (!service) return NextResponse.json({ error: "INVALID_SERVICE_AUTHENTICATION" }, { status: 401 });
  const a = (b.agent ?? {}) as Record<string, unknown>;
  try {
    const { request, delegate } = await createServiceInitiatedRequest(
      service.id,
      typeof a.web_bot_auth_agent === "string"
        ? { kind: "verified", webBotAuthAgent: a.web_bot_auth_agent }
        : { kind: "declared", name: String(a.name ?? ""), provider: String(a.provider ?? "") },
      Array.isArray(b.capabilities) ? b.capabilities.map(String) : [],
    );
    return NextResponse.json(
      {
        request_id: request.id,
        user_code: request.userCode,
        approve_url: `${config.appUrl}/approve`,
        expires_at: request.expiresAt,
        agent: { name: delegate.name, provider: delegate.provider, assurance: request.requestedAssurance },
      },
      { status: 201 },
    );
  } catch (e) {
    return fail(e);
  }
}
