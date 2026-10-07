import { config } from "./config";

export type RelationshipCheck = {
  authorised: boolean;
  authorisation_id?: string;
  status?: string;
  reason?: string;
  principal_id?: string;
};

/**
 * How a receiving service (the mock DWP) asks GOV.UK Delegate whether a
 * relationship is live. A real HTTP call with the service's own API key —
 * the service does not read Delegate's tables.
 */
export async function checkRelationship(input: {
  principal_id: string;
  delegate_id: string;
  service: string;
  capability: string;
}): Promise<RelationshipCheck> {
  const res = await fetch(`${config.delegateBaseUrl}/api/authorisations/check`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-service-key": config.dwpServiceKey },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Relationship check failed (${res.status})`);
  return res.json();
}
