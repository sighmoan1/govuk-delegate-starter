import { readFileSync } from "node:fs";

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable ${name}`);
  return v;
}

// HMRC's own configuration. Read lazily so `next build` needs no secrets.
export const config = {
  get appUrl() { return need("APP_URL", "http://localhost:3302"); },
  // HMRC is an ordinary One Login relying party.
  get oidcIssuer() { return need("OIDC_ISSUER", "http://localhost:3301"); },
  get oidcInternalUrl() { return need("OIDC_INTERNAL_URL", this.oidcIssuer); },
  get oidcClientId() { return need("OIDC_CLIENT_ID", "delegate-dev-client"); },
  get oidcPrivateKeyPem() { return readFileSync(need("OIDC_PRIVATE_KEY_FILE", "../../dev/oidc-client-private.pem"), "utf8"); },
  get sessionSecret() { return new TextEncoder().encode(need("SESSION_SECRET")); },
  // What HMRC got when it registered with GOV.UK Delegate, once.
  get delegateUrl() { return need("DELEGATE_URL", "http://localhost:3300"); },
  get delegateInternalUrl() { return need("DELEGATE_INTERNAL_URL", this.delegateUrl); },
  get serviceSlug() { return need("DELEGATE_SERVICE_SLUG", "hmrc-personal-tax"); },
  get serviceKey() { return need("HMRC_SERVICE_KEY"); },
  get aboutUrl() { return need("ABOUT_URL", "http://localhost:3304"); },
};

/**
 * Per-caller throttles, per minute, for traffic that has not been admitted as a
 * person or an authorised agent: an agent that declares itself without
 * permission, and traffic that will not say what it is. Signed-in people and
 * authorised agents are admitted by operator, person and service per cost
 * class in throughput.ts; what a person may do is in domain-policy.ts.
 */
export const LANE_LIMITS = { DECLARED_AGENT: 30, UNTRUSTED: 5 } as const;
/** Simulated extra delay for traffic that will not identify itself. */
export const UNTRUSTED_DELAY_MS = 1500;
