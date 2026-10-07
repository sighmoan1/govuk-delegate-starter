function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable ${name}`);
  return v;
}

// Example AI's configuration: its own credentials, and where the government systems are.
export const config = {
  get appUrl() { return need("APP_URL", "http://localhost:3303"); },
  get delegateUrl() { return need("DELEGATE_URL", "http://localhost:3300"); },
  get delegateInternalUrl() { return need("DELEGATE_INTERNAL_URL", this.delegateUrl); },
  get clientId() { return need("AGENT_CLIENT_ID", "demo-personal-agent"); },
  get clientSecret() { return need("AGENT_CLIENT_SECRET"); },
  get hmrcUrl() { return need("HMRC_URL", "http://localhost:3302"); },
  get hmrcInternalUrl() { return need("HMRC_INTERNAL_URL", this.hmrcUrl); },
};

export const AGENT_NAME = "Example AI";
