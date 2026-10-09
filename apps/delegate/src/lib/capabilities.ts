export const capabilityLabel = (code: string) => code.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

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
