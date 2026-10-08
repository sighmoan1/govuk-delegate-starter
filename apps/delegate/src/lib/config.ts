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

export const AUTHORISATION_DAYS = 30;
export const REQUEST_DAYS = 7;

/**
 * How long a person's step-up approval stays usable after they give it (issue #38).
 * Approval covers the NEXT positive check for that mandate + capability (it is not
 * bound to transaction details; see docs/DECISIONS.md). Ten minutes is long enough
 * to switch from the GOV.UK approval page back to the agent and let it retry, and
 * short enough that an abandoned approval cannot be picked up later.
 * Override with STEP_UP_MAX_AGE_MINUTES (a positive number; invalid values use the default).
 */
export const DEFAULT_STEP_UP_MAX_AGE_MINUTES = 10;
export function stepUpMaxAgeMs(): number {
  const n = Number(process.env.STEP_UP_MAX_AGE_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP_UP_MAX_AGE_MINUTES) * 60_000;
}
