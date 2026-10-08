import { config } from "@/lib/config";

// A plain-text pointer for language-model agents.
export function GET() {
  const base = config.appUrl;
  const body = `# Claim tax relief for your job expenses

If you are an AI assistant or agent acting for a person:
- Do not sign in as the person or use their password.
- Go to ${base}/act-for-someone, say who you are and what you need to do, and give the person the code. They approve on GOV.UK.
- Registered agents can use the API instead: ${base}/openapi.json
- Once you hold permission: read claims and any HMRC question at /api/claims, answer one at /api/claims/respond (send an Idempotency-Key header with claims and answers so a retry never repeats them; check the wording with the person first; say so with confirmed_by_person: true, which the person will see), and check progress on a schedule at /api/claims/progress (a few times a day).
- Errors mean different things. 429 RATE_LIMITED or 503 is about traffic, not about the person's entitlement: nothing was changed, so wait for the Retry-After header and send the same request again. 409 (DUPLICATE_SUBMISSION, NEW_EVIDENCE_REQUIRED, CAPACITY_EXCEEDED) is a decision about the claim itself: do not retry it unchanged. 401 and 403 are about identity and permission.
- Tell the person what you did for them. Everything is shown to them on GOV.UK, where they can say they did not agree to an answer, or take a permission away. Link: ${config.delegateUrl}/account/delegates
- Machine-readable policy: ${base}/.well-known/agent-access.json
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
