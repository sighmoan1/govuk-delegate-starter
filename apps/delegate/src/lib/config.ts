import { readFileSync } from "node:fs";

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable ${name}`);
  return v;
}

// Read lazily so `next build` does not need runtime secrets.
export const config = {
  get appUrl() { return need("APP_URL", "http://localhost:3300"); },
  get oidcIssuer() { return need("OIDC_ISSUER", "http://localhost:3301"); },
  get oidcInternalUrl() { return need("OIDC_INTERNAL_URL", this.oidcIssuer); },
  get oidcClientId() { return need("OIDC_CLIENT_ID", "delegate-dev-client"); },
  get oidcPrivateKeyPem() {
    return readFileSync(need("OIDC_PRIVATE_KEY_FILE", "../../dev/oidc-client-private.pem"), "utf8");
  },
  get sessionSecret() { return new TextEncoder().encode(need("SESSION_SECRET")); },
  get agentTokenSecret() { return new TextEncoder().encode(need("AGENT_TOKEN_SECRET")); },
  get aboutUrl() { return need("ABOUT_URL", "http://localhost:3304"); },
};

/**
 * POLICY (owner to confirm; see Decision 22): how long a proposed sensitive
 * action stays approvable AND redeemable. One deadline, set when the service
 * proposes the transaction. It is not extended by approving or by reserving.
 * After it, the person has to approve a fresh proposal. 15 minutes is a
 * starting point: long enough to open GOV.UK, sign in and read the details,
 * short enough that an unused approval does not linger. Override for a
 * deployment with STEP_UP_VALIDITY_MINUTES.
 */
export const STEP_UP_VALIDITY_MINUTES_DEFAULT = 15;
export const stepUpValidityMs = () => {
  const n = Number(process.env.STEP_UP_VALIDITY_MINUTES ?? STEP_UP_VALIDITY_MINUTES_DEFAULT);
  return (Number.isFinite(n) && n > 0 ? n : STEP_UP_VALIDITY_MINUTES_DEFAULT) * 60_000;
};

/**
 * TECHNICAL, not policy: how long a service may hold an approval for one
 * in-flight operation before Delegate treats the holder as crashed and lets the
 * approval be reserved again. Longer than the service's own transaction timeout.
 */
export const STEP_UP_RESERVATION_LEASE_SECONDS = 60;

export const AUTHORISATION_DAYS = 30;
export const REQUEST_DAYS = 7;
