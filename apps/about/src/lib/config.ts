import { readFileSync } from "node:fs";

const env = (name: string, fallback: string) => process.env[name] || fallback;

export const urls = {
  get delegate() { return env("DELEGATE_URL", "http://localhost:3300"); },
  get hmrc() { return env("HMRC_URL", "http://localhost:3302"); },
  get hmrcInternal() { return env("HMRC_INTERNAL_URL", this.hmrc); },
  get agent() { return env("AGENT_URL", "http://localhost:3303"); },
  get agentInternal() { return env("AGENT_INTERNAL_URL", this.agent); },
  get oneLogin() { return env("ONE_LOGIN_URL", "http://localhost:3301"); },
};

export const demoConsoleKey = () => env("DEMO_CONSOLE_KEY", "dev-demo-console-key");

export function hmrcMiddlewareSource(): string {
  try {
    return readFileSync(env("HMRC_MIDDLEWARE_FILE", "../hmrc/src/lib/delegated-authority.ts"), "utf8");
  } catch {
    return "(source not available in this build)";
  }
}
