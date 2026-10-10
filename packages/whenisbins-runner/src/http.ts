import type { Lookup, Outcome } from "./index";
// Token acquisition/refresh is agent-owned and injected; secrets are never persisted in jobs.
export function connectorLookup(baseUrl: string, getToken: (reference: string) => Promise<string>, fetcher: typeof fetch = fetch): Lookup {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Error("Use HTTPS or a loopback connector");
  return async request => {
    const response = await fetcher(new URL("/api/collections", base), { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${await getToken(request.credentialEnv)}`, "x-principal-id": request.principalId, "Idempotency-Key": request.idempotencyKey, "Content-Type": "application/json" }, body: JSON.stringify({ property_id: request.propertyId }) });
    const data = await response.json().catch(() => ({})) as { reason?: string; code?: string; result?: { status?: string }; replayed?: boolean; provider_calls?: number };
    const retry = Number(response.headers.get("Retry-After"));
    const common = { providerCalls: Number.isInteger(data.provider_calls) && data.provider_calls! >= 0 ? data.provider_calls! : null, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined };
    if (response.status === 403 || response.status === 401) return { ...common, kind: "refused", code: data.reason || data.code || "AUTHORITY_REFUSED" };
    if (response.status === 202 || ["queued", "running"].includes(data.result?.status || "")) return { ...common, kind: "pending", code: "LOOKUP_PENDING" };
    if (response.ok && data.result?.status === "done") return { ...common, kind: data.replayed ? "unchanged" : "completed" };
    return { ...common, kind: "unavailable", code: response.status === 409 ? "IDEMPOTENCY_CONFLICT" : data.result?.status === "partial" ? "PARTIAL_LOOKUP" : "LOOKUP_UNAVAILABLE" } satisfies Outcome;
  };
}
