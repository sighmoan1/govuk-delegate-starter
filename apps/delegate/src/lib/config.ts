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
 * TECHNICAL, not policy: how long a service may hold an approval for one
 * in-flight operation before Delegate treats the holder as crashed and lets the
 * approval be reserved again. Longer than the service's own transaction timeout.
 */
export const STEP_UP_RESERVATION_LEASE_SECONDS = 60;

export const AUTHORISATION_DAYS = 30;
export const REQUEST_DAYS = 7;

/**
 * POLICY (owner to confirm; Decision 24): the one validity window for a step-up
 * approval (issues #38, #19). A proposed sensitive change is approvable and
 * redeemable until this long after the service proposed it. The deadline is fixed
 * when the proposal is made; approving or reserving does not extend it. A change
 * already reserved when the window closes may still finish; nothing new may start.
 * Ten minutes is long enough to go from the agent to GOV.UK, sign in, read the
 * details and come back, and short enough that an abandoned approval cannot be
 * picked up later while the mandate is still active. A product and risk call.
 * Override with STEP_UP_MAX_AGE_MINUTES (a positive number; invalid values use the default).
 */
export const DEFAULT_STEP_UP_MAX_AGE_MINUTES = 10;
export function stepUpMaxAgeMs(): number {
  const n = Number(process.env.STEP_UP_MAX_AGE_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP_UP_MAX_AGE_MINUTES) * 60_000;
}
