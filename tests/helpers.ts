import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { approveRequest, revokeAuthorisation } from "@/lib/requests";
import { signAgentToken } from "@/lib/agent-auth";

// The three services under test. Everything goes over HTTP except setting up
// Delegate state (creating principals, approving, revoking), which reaches
// into Delegate's own code the way its consent screen does.
export const DELEGATE = process.env.DELEGATE_URL ?? "http://localhost:3300";
export const HMRC = process.env.HMRC_URL ?? "http://localhost:3302";
export const AGENT = process.env.AGENT_URL ?? "http://localhost:3303";

export const CLIENT_ID = process.env.DEMO_AGENT_CLIENT_ID ?? "demo-personal-agent";
export const CLIENT_SECRET = process.env.DEMO_AGENT_CLIENT_SECRET ?? "dev-demo-agent-secret";
export const HMRC_SERVICE_KEY = process.env.HMRC_SERVICE_KEY ?? "dev-hmrc-service-key";
export const SERVICE = "hmrc-personal-tax";

export const CAPS = ["view_tax_code", "claim_job_expenses", "update_employment", "change_refund_account", "change_address"] as const;
export type Cap = (typeof CAPS)[number];

/** A fresh synthetic principal per test, so tests never depend on each other's state. */
export async function newPrincipal() {
  return prisma.principal.create({
    data: { oneLoginSubjectId: `urn:test:${randomUUID()}`, displayName: "Test Principal (synthetic)" },
  });
}

export async function agentToken(clientId = CLIENT_ID, secret = CLIENT_SECRET) {
  const res = await fetch(`${DELEGATE}/api/agent/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: secret }),
  });
  return { res, body: await res.json() };
}

export async function demoAgent() {
  const { body } = await agentToken();
  return { token: body.access_token as string, delegateId: body.delegate_id as string };
}

export async function createRequest(token: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${DELEGATE}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ service: SERVICE, capabilities: ["view_tax_code"], ...body }),
  });
  return { res, body: await res.json() };
}

/** The agent asks over HTTP; the principal approves as the consent screen does. */
export async function authorise(principalId: string, requested: Cap[], approve: Cap[] = requested) {
  const { token } = await demoAgent();
  const { body: req } = await createRequest(token, { capabilities: requested });
  const auth = await approveRequest(req.id, principalId, approve);
  return { requestId: req.id as string, authorisationId: auth.id, token };
}

/** The one call a service makes: Delegate's relationship check. */
export async function check(
  body: { agent_token?: string | null; principal_id?: string; service?: string; capability?: string },
  key: string | null = HMRC_SERVICE_KEY,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["x-service-key"] = key;
  const res = await fetch(`${DELEGATE}/api/authorisations/check`, {
    method: "POST",
    headers,
    body: JSON.stringify({ service: SERVICE, capability: "view_tax_code", ...body }),
  });
  return { status: res.status, body: await res.json() };
}

export const eventById = (id: string) => prisma.activityEvent.findUnique({ where: { id } });

export { prisma, revokeAuthorisation, signAgentToken, approveRequest };
