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
    return readFileSync(need("OIDC_PRIVATE_KEY_FILE", "dev/oidc-client-private.pem"), "utf8");
  },
  get sessionSecret() { return new TextEncoder().encode(need("SESSION_SECRET")); },
  get agentTokenSecret() { return new TextEncoder().encode(need("AGENT_TOKEN_SECRET")); },
  get demoAgentClientId() { return need("DEMO_AGENT_CLIENT_ID", "demo-personal-agent"); },
  get demoAgentClientSecret() { return need("DEMO_AGENT_CLIENT_SECRET", "dev-demo-agent-secret"); },
  get dwpServiceKey() { return need("DWP_SERVICE_KEY", "dev-dwp-service-key"); },
  get delegateBaseUrl() { return need("DELEGATE_BASE_URL", this.appUrl); },
};

/** Simulated per-minute limits for the trusted-lane demonstration. */
export const LANE_LIMITS = {
  AUTHORISED_AGENT: 600,
  AUTHENTICATED_HUMAN: 600,
  UNTRUSTED: 5,
} as const;

export const AUTHORISATION_DAYS = 30;
export const REQUEST_DAYS = 7;
export const DWP_SLUG = "dwp-benefits";
