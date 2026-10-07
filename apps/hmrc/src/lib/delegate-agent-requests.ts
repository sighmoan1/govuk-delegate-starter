import { config } from "./config";

/** HMRC raises a request with GOV.UK Delegate for an agent that has arrived in a browser. */
export async function raiseAgentRequest(agent: { web_bot_auth_agent: string } | { name: string; provider: string }, capabilities: string[]) {
  const res = await fetch(`${config.delegateInternalUrl}/api/agent-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
    body: JSON.stringify({ service: config.serviceSlug, agent, capabilities }),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? body.error ?? `Delegate answered ${res.status}`);
  return body as { request_id: string; user_code: string; approve_url: string; expires_at: string; agent: { name: string; provider: string; assurance: string } };
}

export async function agentRequestStatus(requestId: string) {
  const res = await fetch(`${config.delegateInternalUrl}/api/agent-requests/${encodeURIComponent(requestId)}?service=${config.serviceSlug}`, {
    headers: { "x-service-key": config.serviceKey },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    status: string;
    principal_id?: string;
    subject?: string;
    agent?: { name: string; provider: string; web_bot_auth_agent: string | null };
    delegation_id?: string;
    assurance?: "VERIFIED" | "REGISTERED" | "DECLARED";
    granted?: string[];
    delegation_token?: string;
  };
}
