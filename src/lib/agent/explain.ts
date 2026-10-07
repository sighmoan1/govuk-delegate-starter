import { CAPABILITY_COPY } from "../capabilities";
import type { ServiceCallResult } from "./hmrc-client";

const lower = (code: string) => (CAPABILITY_COPY[code]?.label ?? code).replace(/^./, (c) => c.toLowerCase());

/** How the scripted assistant talks about an HMRC answer. */
export function explainStep(r: Pick<ServiceCallResult, "capability" | "decision" | "reason" | "result">): string {
  const res = (r.result ?? {}) as Record<string, string>;
  if (r.decision === "ALLOW") {
    switch (r.capability) {
      case "view_tax_code":
        return `Your tax code for ${res.tax_year ?? "this year"} is ${res.tax_code ?? "unknown"} (employer: ${res.employer ?? "unknown"}).`;
      case "claim_job_expenses":
        return `Done. HMRC accepted your claim for working from home: ${res.relief ?? "relief applied"}. Your new tax code will be ${res.new_tax_code ?? "updated"} (reference ${res.claim_reference ?? "pending"}).`;
      default:
        return `Done. HMRC accepted the request to ${lower(r.capability)}.`;
    }
  }
  switch (r.reason) {
    case "PERMISSION_MISSING":
      return `HMRC refused: you haven’t given me permission to ${lower(r.capability)}. I can ask you for that permission, or you can do it yourself on GOV.UK.`;
    case "AUTHORISATION_REVOKED":
      return "HMRC refused: you’ve removed my access on GOV.UK, so I can’t act for you any more. I can ask you to reconnect if you want me to.";
    case "AUTHORISATION_EXPIRED":
      return "HMRC refused: the permission you gave me has run out. I can ask you to renew it.";
    case "NO_AUTHORISATION":
      return "I’m not connected to your HMRC account yet, so HMRC won’t let me do anything for you.";
    default:
      return `HMRC refused the request (${r.reason ?? "no reason given"}).`;
  }
}

export const labelList = (codes: string[]) => codes.map(lower).join(", ");
