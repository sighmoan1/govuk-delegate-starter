// The agent's own HTTP client. Everything the agent knows about Sam's authority
// it learns over these calls: it never reads Delegate's tables or Sam's session.
import { config, SERVICE_SLUG } from "../config";
import { CAPABILITY_COPY } from "../capabilities";

async function agentToken(): Promise<string> {
  const res = await fetch(`${config.delegateBaseUrl}/api/agent/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: config.demoAgentClientId, client_secret: config.demoAgentClientSecret }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Agent sign-in failed (${res.status})`);
  return (await res.json()).access_token;
}

export type ServiceCallResult = {
  capability: string;
  status: number;
  decision: "ALLOW" | "DENY";
  reason: string | null;
  lane: string | null;
  result?: unknown;
  raw: unknown;
};

export async function callService(
  capability: string,
  principalId: string | null,
  body: Record<string, unknown> = {},
  identify = true,
): Promise<ServiceCallResult> {
  const spec = CAPABILITY_COPY[capability];
  if (!spec) throw new Error(`Unknown capability ${capability}`);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (identify) {
    headers.authorization = `Bearer ${await agentToken()}`;
    if (principalId) headers["x-principal-id"] = principalId;
  }
  const res = await fetch(`${config.delegateBaseUrl}${spec.endpoint}`, {
    method: spec.method,
    headers,
    body: spec.method === "POST" ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let raw: unknown = text.trim();
  try { raw = JSON.parse(text); } catch { /* the untrusted lane answers in plain text */ }
  const json = (typeof raw === "object" && raw ? raw : {}) as { decision?: string; reason?: string; result?: unknown };
  return {
    capability,
    status: res.status,
    decision: res.status === 200 ? "ALLOW" : "DENY",
    reason: json.reason ?? null,
    lane: res.headers.get("x-trusted-lane"),
    result: json.result,
    raw,
  };
}

export async function createAuthorisationRequest(capabilities: string[], returnUrl: string) {
  const res = await fetch(`${config.delegateBaseUrl}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await agentToken()}` },
    body: JSON.stringify({ service: SERVICE_SLUG, capabilities, return_url: returnUrl }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Delegate refused the request: ${json.error ?? res.status}`);
  return json as { id: string; consent_url: string; capabilities: string[] };
}

export async function getAuthorisationRequest(id: string) {
  const res = await fetch(`${config.delegateBaseUrl}/api/authorisation-requests/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${await agentToken()}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    id: string;
    status: string;
    capabilities: string[];
    principal_id?: string;
    authorisation_id?: string;
    granted_capabilities?: string[];
  };
}

