import React from "react";
import { type ApprovalEvidence } from "@/lib/consent-evidence";
import { fmtTime } from "@/lib/format";

export function ConsentHistory({ original, history, changed }: {
  original: ApprovalEvidence | null;
  history: { id: string; kind: string; occurredAt: Date; capability?: string; reason?: string }[];
  changed: boolean;
}) {
  return <section aria-labelledby="consent-history-h">
    <h2 id="consent-history-h">What you originally allowed</h2>
    {!original ? <p>No approval evidence was recorded for this older or preconfigured demo grant. Its original consent wording cannot be reconstructed reliably.</p> : <>
      <p>On {fmtTime(new Date(original.approved_at))}, you allowed {original.representative.name}, provided by {original.representative.provider}, to act with {original.service.name}.</p>
      <p>{original.purpose}</p>
      <p>{original.conditions}</p>
      <ul>{original.capabilities.map(c => <li key={c.id}>
        <strong>{c.name}</strong><p>{c.description}</p><p>{c.risk_explanation}</p><p>{c.identity_explanation}</p><p>{c.fresh_approval_explanation}</p>
      </li>)}</ul>
      <p>The original access lasted {original.authorisation_days} days from approval, until {fmtTime(new Date(original.valid_until))}. You could remove it at any time.</p>
      <p>Permission definitions: version {original.catalogue.version}. Representative identity assurance: {original.representative.assurance.toLowerCase()}.</p>
      <p>Approval recorded through {original.approval_method === "CITIZEN_BROWSER" ? "the signed-in citizen consent form" : "the synthetic demo API"}.</p>
      {changed && <p className="inset-text">The service has since published a different permission catalogue. The original wording above remains unchanged. A new catalogue does not give the assistant additional access.</p>}
    </>}
    <h3>Changes to this access</h3>
    {history.length === 0 ? <p>No consent history was recorded for this grant.</p> : <ul>{history.map(event => <li key={event.id}>
      {fmtTime(event.occurredAt)}: {event.kind === "APPROVED" ? "Access approved" : event.kind === "SCOPE_REMOVED" ? `Permission removed: ${original?.capabilities.find(c => c.code === event.capability)?.name ?? event.capability ?? "unknown permission"}` : event.reason === "REPLACED_BY_NEW_APPROVAL" ? "Access removed when you approved a new request" : "Access removed"}.
    </li>)}</ul>}
    <p>This is evidence of permission, separate from transaction receipts and outcomes. It does not prove that you approved every statement the assistant later made.</p>
  </section>;
}
