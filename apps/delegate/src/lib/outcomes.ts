// A small vocabulary for what happened after Delegate's check said yes.
// "Permission checked" is not in this list on purpose: it is not an outcome.
export const OUTCOME_STATUSES = ["SUBMITTED", "ACCEPTED", "FAILED", "COMPLETED"] as const;

export const outcomeLabel: Record<(typeof OUTCOME_STATUSES)[number], string> = {
  SUBMITTED: "Sent",
  ACCEPTED: "Accepted",
  FAILED: "Did not go through",
  COMPLETED: "Done",
};

const reasonText: Record<string, string> = {
  CAPACITY_EXCEEDED: "You had reached the limit for this service.",
  RATE_LIMITED: "The service was too busy and held it back.",
  SERVICE_UNAVAILABLE: "The service was unavailable just then and did nothing.",
  DUPLICATE_SUBMISSION: "It had already been done.",
  HANDLER_ERROR: "The service had a problem.",
};
export const reasonLabel = (r: string | null) => (r ? reasonText[r] ?? "The service refused it." : null);
