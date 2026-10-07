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
