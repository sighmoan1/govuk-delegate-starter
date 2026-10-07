export const CAPABILITY_COPY: Record<string, { label: string; verb: string; endpoint: string; method: "GET" | "POST" }> = {
  check_claim_status: { label: "Check my claim status", verb: "Check claim status", endpoint: "/api/dwp/claim/status", method: "GET" },
  submit_evidence: { label: "Submit evidence", verb: "Submit evidence", endpoint: "/api/dwp/claim/evidence", method: "POST" },
  report_change: { label: "Report a change", verb: "Report change", endpoint: "/api/dwp/claim/change", method: "POST" },
  change_payment_details: { label: "Change payment details", verb: "Change payment details", endpoint: "/api/dwp/claim/payment-details", method: "POST" },
  withdraw_claim: { label: "Withdraw my claim", verb: "Withdraw claim", endpoint: "/api/dwp/claim/withdraw", method: "POST" },
};

export const capabilityLabel = (code: string) => CAPABILITY_COPY[code]?.verb ?? code;

export const REASON_COPY: Record<string, string> = {
  VALID_AUTHORISATION: "The agent is known and has active authority for this action.",
  PERMISSION_MISSING: "The agent is known, but the principal did not give it permission for this action.",
  AUTHORISATION_REVOKED: "The principal has removed this agent's authority.",
  AUTHORISATION_EXPIRED: "The authority has expired.",
  UNKNOWN_DELEGATE: "The caller is not a registered delegate.",
  INVALID_AGENT_AUTHENTICATION: "The caller did not prove who it is.",
  NO_AUTHORISATION: "There is no authority from this principal to this delegate for this service.",
  RATE_LIMITED: "The caller exceeded the simulated limit for its lane.",
  HUMAN_SESSION: "A signed-in person acting for themselves.",
};
