import { config } from "./config";

export type DelegateChain = {
  mandate_id: string;
  delegation_id: string;
  parent_delegation_id: string | null;
  depth: number;
  label: string | null;
  assurance: "VERIFIED" | "REGISTERED" | "DECLARED";
};
export type DelegateCapacity = { rule: string; limit: number; used: number; remaining: number; resets_at: string };
type DelegateInfo = { id: string; name: string; provider: string };

export type DelegateCheck =
  | { authorised: true; status: "ACTIVE"; authorisation_id: string; principal_id: string; subject: string; delegate: DelegateInfo; chain: DelegateChain; capacity: DelegateCapacity; check_id: string }
  | {
      authorised: false;
      reason: string;
      status?: string | null;
      delegate?: DelegateInfo;
      chain?: DelegateChain | null;
      capacity?: DelegateCapacity | null;
      step_up?: { user_code: string; approve_url: string };
      check_id: string;
    };

/** GOV.UK Delegate could not be reached, or did not accept the request. Never swallowed: callers decide what to tell the person. */
export class DelegateUnavailableError extends Error {
  constructor(readonly operation: string, readonly retryable: boolean, detail: string) {
    super(`GOV.UK Delegate ${operation} failed: ${detail}`);
    this.name = "DelegateUnavailableError";
  }
}

const TIMEOUT_MS = 5_000;
const retryDelayMs = () => Number(process.env.DELEGATE_RETRY_DELAY_MS ?? 200);

/**
 * POST to Delegate with a timeout. Network errors, timeouts and 5xx are
 * retried (callers only pass retries for idempotent writes); anything below
 * 500 is returned for the caller to interpret. Out of attempts, it throws.
 */
async function post(operation: string, path: string, body: unknown, retries: number): Promise<Response> {
  let detail = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs() * attempt));
    try {
      const res = await fetch(`${config.delegateInternalUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 500) return res;
      detail = `status ${res.status}`;
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
  }
  throw new DelegateUnavailableError(operation, true, detail);
}

/**
 * The one call HMRC makes to GOV.UK Delegate. HMRC presents its own service
 * key; Delegate verifies the agent, the mandate, the capability and the
 * person's capacity, and tells HMRC who the person is only if the answer is yes.
 * Throws DelegateUnavailableError if Delegate can't answer: that is not a "no".
 */
export async function askDelegate(input: { agent_token: string; principal_id: string; capability: string }): Promise<DelegateCheck> {
  const res = await post("check", "/api/authorisations/check", { ...input, service: config.serviceSlug }, 0);
  if (!res.ok) throw new DelegateUnavailableError("check", false, `status ${res.status}`);
  return res.json();
}

/** The stable key for one submission of one answer: service + query + submission version. */
export const receiptKey = (queryId: string, version: number) => `${config.serviceSlug}:respond_to_query:${queryId}:v${version}`;

/**
 * Tell GOV.UK Delegate what an agent did in the person's name, in the agent's own words, so the person can see it.
 * Returns the receipt id, or throws: an action in the person's name must not be accepted unrecorded.
 * The idempotency key makes retries safe; repeating a write returns the same receipt.
 */
export async function recordReceipt(r: { mandate_id: string; delegation_id: string; capability: string; reference: string; text: string; agent_confirmed: boolean; idempotency_key: string }): Promise<string> {
  const res = await post("receipt", "/api/receipts", { ...r, service: config.serviceSlug }, 2);
  if (!res.ok) throw new DelegateUnavailableError("receipt", false, `status ${res.status}`);
  const id = (await res.json().catch(() => null))?.receipt_id;
  if (typeof id !== "string" || !id) throw new DelegateUnavailableError("receipt", false, "no receipt id returned");
  return id;
}

/**
 * Which of these receipts has the person said they did not agree to?
 * `ok: false` means Delegate could not say: callers must treat that as unknown, never as "none".
 */
export async function disputedReceipts(ids: string[]): Promise<{ ok: true; disputed: string[] } | { ok: false }> {
  if (ids.length === 0) return { ok: true, disputed: [] };
  try {
    const res = await post("status", "/api/receipts/status", { ids, service: config.serviceSlug }, 1);
    if (!res.ok) return { ok: false };
    const disputed = (await res.json().catch(() => null))?.disputed;
    return Array.isArray(disputed) ? { ok: true, disputed: disputed.map(String) } : { ok: false };
  } catch {
    return { ok: false };
  }
}
