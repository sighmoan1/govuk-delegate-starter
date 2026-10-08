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

/**
 * The one call HMRC makes to GOV.UK Delegate. HMRC presents its own service
 * key; Delegate verifies the agent, the mandate, the capability and the
 * person's capacity, and tells HMRC who the person is only if the answer is yes.
 */
export async function askDelegate(input: { agent_token: string; principal_id: string; capability: string }): Promise<DelegateCheck> {
  const res = await fetch(`${config.delegateInternalUrl}/api/authorisations/check`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
    body: JSON.stringify({ ...input, service: config.serviceSlug }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GOV.UK Delegate answered ${res.status}`);
  return res.json();
}

/** Tell GOV.UK Delegate what an agent did in the person's name, in the agent's own words, so the person can see it. */
export async function recordReceipt(r: { mandate_id: string; delegation_id: string; capability: string; reference: string; text: string; agent_confirmed: boolean }): Promise<string | null> {
  try {
    const res = await fetch(`${config.delegateInternalUrl}/api/receipts`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
      body: JSON.stringify({ ...r, service: config.serviceSlug }),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()).receipt_id as string) : null;
  } catch {
    return null;
  }
}

/** Which of these receipts has the person said they did not agree to? */
export async function disputedReceipts(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  try {
    const res = await fetch(`${config.delegateInternalUrl}/api/receipts/status`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
      body: JSON.stringify({ ids, service: config.serviceSlug }),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()).disputed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Tell GOV.UK Delegate what happened after it said yes to a check. Best effort:
 * a failure to report must never change what the person gets from HMRC.
 * Reporting twice is safe; Delegate keeps one row per idempotency key.
 */
export async function reportOutcome(o: { check_id: string; status: "SUBMITTED" | "ACCEPTED" | "FAILED" | "COMPLETED"; reference?: string | null; reason?: string | null; idempotency_key?: string }): Promise<boolean> {
  try {
    const res = await fetch(`${config.delegateInternalUrl}/api/outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
      body: JSON.stringify({ ...o, service: config.serviceSlug }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
