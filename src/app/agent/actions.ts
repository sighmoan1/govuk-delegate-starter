"use server";

// This file plays the part of an EXTERNAL software agent. It holds the agent's
// own credentials, signs in as the agent, and talks to Delegate and the mock
// DWP service over HTTP exactly as a real agent would. It never sees the
// principal's session.

import { redirect } from "next/navigation";
import { config, DWP_SLUG } from "@/lib/config";
import { CAPABILITY_COPY } from "@/lib/capabilities";

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

export async function requestAuthorityAction(formData: FormData) {
  const caps = formData.getAll("cap").map(String);
  const token = await agentToken();
  const res = await fetch(`${config.delegateBaseUrl}/api/authorisation-requests`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      service: DWP_SLUG,
      capabilities: caps,
      principal_hint: String(formData.get("hint") ?? ""),
    }),
    cache: "no-store",
  });
  if (!res.ok) redirect(`/agent?error=${res.status}`);
  redirect("/agent");
}

export async function cancelRequestAction(formData: FormData) {
  const token = await agentToken();
  await fetch(`${config.delegateBaseUrl}/api/authorisation-requests/${formData.get("id")}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  redirect("/agent");
}

async function attempt(capability: string, principalId: string | null, identify: boolean) {
  const spec = CAPABILITY_COPY[capability];
  if (!spec) redirect("/agent");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (identify) {
    headers.authorization = `Bearer ${await agentToken()}`;
    if (principalId) headers["x-principal-id"] = principalId;
  }
  const res = await fetch(`${config.delegateBaseUrl}${spec.endpoint}`, {
    method: spec.method,
    headers,
    body: spec.method === "POST" ? JSON.stringify({ description: "Synthetic payslip (demo)", change: "Moved house (demo)" }) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = text.trim();
  try { body = JSON.parse(text); } catch { /* untrusted lane returns plain text */ }
  const result = {
    capability,
    identified: identify,
    status: res.status,
    lane: res.headers.get("x-trusted-lane"),
    limit: res.headers.get("x-ratelimit-limit"),
    body,
  };
  redirect(`/agent?r=${Buffer.from(JSON.stringify(result)).toString("base64url")}`);
}

export async function actAction(formData: FormData) {
  await attempt(String(formData.get("capability")), String(formData.get("principal_id") ?? "") || null, true);
}

export async function actUntrustedAction(formData: FormData) {
  await attempt(String(formData.get("capability") ?? "check_claim_status"), null, false);
}
