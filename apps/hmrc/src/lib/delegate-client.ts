import { config } from "./config";

export type DelegateCheck =
  | { authorised: true; status: "ACTIVE"; authorisation_id: string; principal_id: string; subject: string; delegate: { id: string; name: string; provider: string }; check_id: string }
  | { authorised: false; reason: string; status?: string | null; delegate?: { id: string; name: string; provider: string }; check_id: string };

/**
 * The one call HMRC makes to GOV.UK Delegate. HMRC presents its own service
 * key; Delegate verifies the agent, the relationship and the capability, and
 * tells HMRC who the person is only if the answer is yes.
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
