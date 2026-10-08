export type CapabilitySpec = {
  label: string; // what the person reads on GOV.UK
  short: string; // compact form for tables and agent steps
  endpoint: string;
  method: "GET" | "POST";
};

export const CAPABILITY_COPY: Record<string, CapabilitySpec> = {
  view_tax_code: { label: "View your tax code", short: "View tax code", endpoint: "/api/hmrc/tax-code", method: "GET" },
  claim_job_expenses: { label: "Claim tax relief for working from home", short: "Claim working-from-home relief", endpoint: "/api/hmrc/job-expenses", method: "POST" },
  update_employment: { label: "Update your employment details", short: "Update employment details", endpoint: "/api/hmrc/employment", method: "POST" },
  change_refund_account: { label: "Change the bank account for refunds", short: "Change refund bank account", endpoint: "/api/hmrc/refund-account", method: "POST" },
  view_claim_status: { label: "See how your claims are going", short: "View claim status", endpoint: "/api/hmrc/claims", method: "GET" },
  respond_to_query: { label: "Answer HMRC’s questions about your claim, once you have agreed the answer", short: "Answer HMRC question", endpoint: "/api/hmrc/claims/respond", method: "POST" },
  check_claim_progress: { label: "Check your claim progress on a schedule (a few times a day)", short: "Check claim progress", endpoint: "/api/hmrc/claims/progress", method: "GET" },
  change_address: { label: "Change your address", short: "Change address", endpoint: "/api/hmrc/address", method: "POST" },
};

export const CAPABILITY_CODES = Object.keys(CAPABILITY_COPY);
export const capabilityLabel = (code: string) => CAPABILITY_COPY[code]?.short ?? code;

/** Plain-English reasons, from the person's point of view. */
export const REASON_COPY: Record<string, string> = {
  VALID_AUTHORISATION: "The agent is known and you have allowed it to do this.",
  PERMISSION_MISSING: "The agent is known, but you have not allowed it to do this.",
  AUTHORISATION_REVOKED: "You removed this agent’s access.",
  AUTHORISATION_EXPIRED: "The permission you gave has run out.",
  UNKNOWN_DELEGATE: "The caller is not a registered agent.",
  INVALID_AGENT_AUTHENTICATION: "The caller did not prove who it is.",
  NO_AUTHORISATION: "You have not given this agent permission to act for you with this service.",
  RATE_LIMITED: "The caller went over the limit for its lane.",
  HUMAN_SESSION: "A signed-in person acting for themselves.",
};
