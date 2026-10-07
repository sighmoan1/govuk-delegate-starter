import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { approveRequest, revokeAuthorisation } from "@/lib/requests";
import { signAgentToken } from "@/lib/agent-auth";

export const BASE = process.env.TEST_APP_URL ?? "http://localhost:3300";
export const CLIENT_ID = process.env.DEMO_AGENT_CLIENT_ID ?? "demo-personal-agent";
export const CLIENT_SECRET = process.env.DEMO_AGENT_CLIENT_SECRET ?? "dev-demo-agent-secret";

export const ENDPOINT = {
  view_tax_code: ["GET", "/api/hmrc/tax-code"],
  claim_job_expenses: ["POST", "/api/hmrc/job-expenses"],
  update_employment: ["POST", "/api/hmrc/employment"],
  change_refund_account: ["POST", "/api/hmrc/refund-account"],
  change_address: ["POST", "/api/hmrc/address"],
} as const;
export type Cap = keyof typeof ENDPOINT;

/** A fresh synthetic principal per test, so tests never depend on each other's state. */
export async function newPrincipal() {
  return prisma.principal.create({
    data: { oneLoginSubjectId: `urn:test:${randomUUID()}`, displayName: "Test Principal (synthetic)" },
  });
}

export async function agentToken(clientId = CLIENT_ID, secret = CLIENT_SECRET) {
  const res = await fetch(`${BASE}/api/agent/token`, {
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

/** The agent asks over HTTP; the principal approves via the domain function (the browser flow is covered by Playwright). */
export async function authorise(principalId: string, requested: Cap[], approve: Cap[] = requested) {
  const { token } = await demoAgent();
  const res = await fetch(`${BASE}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ service: "hmrc-personal-tax", capabilities: requested }),
  });
  const req = await res.json();
  const auth = await approveRequest(req.id, principalId, approve);
  return { requestId: req.id as string, authorisationId: auth.id };
}

export async function callService(
  cap: Cap,
  o: { token?: string | null; principalId?: string; ip?: string } = {},
) {
  const [method, path] = ENDPOINT[cap];
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": o.ip ?? `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.principalId) headers["x-principal-id"] = o.principalId;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: method === "POST" ? "{}" : undefined });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, requestId: res.headers.get("x-request-id")!, lane: res.headers.get("x-trusted-lane") };
}

export const eventsFor = (requestId: string) => prisma.activityEvent.findMany({ where: { requestId } });

export { prisma, revokeAuthorisation, signAgentToken };
