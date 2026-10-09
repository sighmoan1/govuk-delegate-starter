export const SERVICE = "council-casework";
export type Case = { reference: string; subject: string; status: string };
type Config = { delegateUrl: string; serviceKey: string; cases: Case[] };
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** The council owns its records and business rule. Delegate only answers authority. */
export function councilHandler(config: Config, transport: typeof fetch = fetch) {
  const post = (path: string, body: unknown) => transport(`${config.delegateUrl}${path}`, {
    method: "POST", headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
    body: JSON.stringify({ service: SERVICE, ...body as object }), signal: AbortSignal.timeout(5000),
  });
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/health") return json({ service: SERVICE, synthetic: true });
    if (url.pathname === "/") return new Response("Synthetic council casework. Agent API: GET /api/cases/status?reference=CASE-SAM. Requires agent bearer token and x-principal-id. No real government connections.\n", { headers: { "content-type": "text/plain" } });
    if (url.pathname !== "/api/cases/status") return json({ error: "NOT_FOUND" }, 404);
    if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    const principal = req.headers.get("x-principal-id");
    if (!token || !principal) return json({ decision: "DENY", reason: "AGENT_IDENTITY_REQUIRED" }, 401);
    try {
      // Service and operation cannot be supplied by the agent.
      const response = await post("/api/authorisations/check", { agent_token: token, principal_id: principal, capability: "view_case_status" });
      if (!response.ok) throw new Error("Authority unavailable");
      const check = await response.json();
      if (!check.authorised) return json({ decision: "DENY", reason: check.reason, delegate_check_id: check.check_id }, 403);
      if (typeof check.subject !== "string" || typeof check.check_id !== "string") throw new Error("Invalid authority answer");
      const record = config.cases.find(c => c.reference === url.searchParams.get("reference") && c.subject === check.subject);
      // An unknown case and somebody else's case give the same response.
      const outcome = await post("/api/outcomes", { check_id: check.check_id, status: record ? "COMPLETED" : "FAILED", reference: record?.reference, reason: record ? undefined : "CASE_NOT_ACCESSIBLE" });
      if (!outcome.ok) throw new Error("Outcome unavailable");
      if (!record) return json({ decision: "DENY", kind: "BUSINESS_REFUSAL", reason: "CASE_NOT_ACCESSIBLE", delegate_check_id: check.check_id }, 404);
      return json({ decision: "ALLOW", delegate_check_id: check.check_id, result: { reference: record.reference, status: record.status } });
    } catch {
      return json({ decision: "DENY", reason: "DELEGATE_UNAVAILABLE", retryable: true }, 503);
    }
  };
}
