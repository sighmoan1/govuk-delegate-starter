// Everything Example AI knows about government it learns over these calls.
// It signs in to Delegate as itself and sends its own token to HMRC. It never
// holds the person's One Login session.
import { config } from "./config";

export type Exchange = { method: string; url: string; headers?: Record<string, string>; body?: unknown; status: number; ms: number; response: unknown };

const redact = (h: Record<string, string>) =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k, k.toLowerCase() === "authorization" ? "Bearer <agent token>" : v]));

async function exchange(url: string, init: { method: string; headers?: Record<string, string>; body?: unknown }): Promise<Exchange> {
  const started = Date.now();
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let response: unknown = text.trim();
  try { response = JSON.parse(text); } catch { /* plain text: the untrusted lane */ }
  return { method: init.method, url, headers: init.headers ? redact(init.headers) : undefined, body: init.body, status: res.status, ms: Date.now() - started, response };
}

const json = { "content-type": "application/json" };

/** Client-credentials sign-in to GOV.UK Delegate: the agent proves who IT is. */
export async function signInToDelegate() {
  const x = await exchange(`${config.delegateInternalUrl}/api/agent/token`, {
    method: "POST", headers: json, body: { client_id: config.clientId, client_secret: config.clientSecret },
  });
  const body = (typeof x.response === "object" && x.response ? x.response : {}) as { access_token?: string; delegate_id?: string };
  // Secrets never go into the step log.
  const logged: Exchange = {
    ...x,
    body: { client_id: config.clientId, client_secret: "<secret>" },
    response: body.access_token ? { access_token: "<agent token>", token_type: "Bearer", delegate_id: body.delegate_id } : x.response,
  };
  return { exchange: logged, token: body.access_token ?? null };
}

export async function requestAuthority(token: string, capabilities: string[], returnUrl: string) {
  const x = await exchange(`${config.delegateInternalUrl}/api/authorisation-requests`, {
    method: "POST", headers: { ...json, authorization: `Bearer ${token}` }, body: { service: "hmrc-personal-tax", capabilities, return_url: returnUrl },
  });
  const r = x.response as { id?: string; consent_url?: string };
  return { exchange: x, requestId: r.id ?? null, consentUrl: r.consent_url ?? null };
}

export async function readRequest(token: string, requestId: string) {
  const x = await exchange(`${config.delegateInternalUrl}/api/authorisation-requests/${encodeURIComponent(requestId)}`, {
    method: "GET", headers: { authorization: `Bearer ${token}` },
  });
  const r = x.response as { status?: string; principal_id?: string; granted_capabilities?: string[]; capabilities?: string[] };
  return { exchange: x, status: r.status ?? null, principalId: r.principal_id ?? null, granted: r.granted_capabilities ?? r.capabilities ?? [] };
}

export const HMRC_ACTIONS: Record<string, { label: string; method: "GET" | "POST"; path: string }> = {
  view_tax_code: { label: "View tax code", method: "GET", path: "/api/tax-code" },
  claim_job_expenses: { label: "Claim working-from-home relief", method: "POST", path: "/api/job-expenses" },
  update_employment: { label: "Update employment details", method: "POST", path: "/api/employment" },
  change_refund_account: { label: "Change refund bank account", method: "POST", path: "/api/refund-account" },
  change_address: { label: "Change address", method: "POST", path: "/api/address" },
};

/** Act with HMRC. With a token and principal: the trusted lane. Without: as any unidentified caller. */
export async function callHmrc(capability: string, identity: { token: string; principalId: string } | null, body: Record<string, unknown> = {}) {
  const a = HMRC_ACTIONS[capability];
  if (!a) throw new Error(`Unknown capability ${capability}`);
  const headers: Record<string, string> = { ...json };
  if (identity) {
    headers.authorization = `Bearer ${identity.token}`;
    headers["x-principal-id"] = identity.principalId;
  }
  const x = await exchange(`${config.hmrcInternalUrl}${a.path}`, { method: a.method, headers, body: a.method === "POST" ? body : undefined });
  const r = (typeof x.response === "object" && x.response ? x.response : {}) as { decision?: string; reason?: string; result?: Record<string, unknown> };
  return { exchange: x, allowed: x.status === 200, reason: r.reason ?? null, result: r.result ?? null };
}

export async function fetchHmrcPage(path: string) {
  const started = Date.now();
  const res = await fetch(`${config.hmrcInternalUrl}${path}`, { redirect: "manual", cache: "no-store" });
  return { status: res.status, location: res.headers.get("location"), ms: Date.now() - started };
}
