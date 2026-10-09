import React from "react";
import { CONSENT_UNAVAILABLE, freshApprovalExplanation, riskExplanation, type ConsentCapability, type consentPresentation } from "@/lib/consent-presentation";

export function PermissionDescription({ capability }: { capability: ConsentCapability }) {
  return <>
    <span className="choice-hint">{capability.description}</span>
    <span className="choice-hint">{riskExplanation(capability.risk)}</span>
    <span className="choice-hint">The assistant must have {capability.minimum_assurance === "VERIFIED" ? "a verified identity" : capability.minimum_assurance === "REGISTERED" ? "a registered identity" : "a declared identity"} to use this permission.</span>
    {Object.entries(capability.restrictions ?? {}).map(([key, values])=><span className="choice-hint" key={key}>{capability.constraint_labels?.[key] ?? key}: {values.join(", ")}. The assistant may only act within this restriction.</span>)}
    <span className="choice-hint">{freshApprovalExplanation(capability.requires_step_up)}</span>
  </>;
}

export function ConsentTerms({ presentation }: { presentation: ReturnType<typeof consentPresentation> }) {
  return <>
    <p>{presentation.purpose}</p>
    <p>{presentation.conditions}</p>
    <p>Access lasts for {presentation.authorisation_days} days from approval. You can remove it at any time.</p>
    <p>This request expires on {new Date(presentation.request_expires_at).toLocaleString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" })}.</p>
  </>;
}

export function ConsentUnavailable({ id, csrf }: { id: string; csrf: string }) {
  return <div className="two-thirds">
    <h1>We cannot show these permissions safely</h1>
    <p role="alert">{CONSENT_UNAVAILABLE}</p>
    <form action={`/consent/${id}/decision`} method="post">
      <input type="hidden" name="decision" value="reject" />
      <input type="hidden" name="csrf" value={csrf} />
      <button className="button button--secondary" type="submit">Reject request</button>
    </form>
  </div>;
}
