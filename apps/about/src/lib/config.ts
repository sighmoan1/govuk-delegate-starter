import { readFileSync } from "node:fs";

const env = (name: string, fallback: string) => process.env[name] || fallback;

export const urls = {
  get delegate() { return env("DELEGATE_URL", "http://localhost:3300"); },
  get delegateInternal() { return env("DELEGATE_INTERNAL_URL", this.delegate); },
  get hmrc() { return env("HMRC_URL", "http://localhost:3302"); },
  get hmrcInternal() { return env("HMRC_INTERNAL_URL", this.hmrc); },
  get oneLogin() { return env("ONE_LOGIN_URL", "http://localhost:3301"); },
  get oneLoginInternal() { return env("ONE_LOGIN_INTERNAL_URL", this.oneLogin); },
};

export const demoConsoleKey = () => {
  if (process.env.PUBLIC_BRIEFING_MODE === "true") throw new Error("Presenter controls are unavailable on the public briefing instance");
  return env("DEMO_CONSOLE_KEY", "dev-demo-console-key");
};

export function hmrcMiddlewareSource(): string {
  try {
    return readFileSync(env("HMRC_MIDDLEWARE_FILE", "../hmrc/src/lib/delegated-authority.ts"), "utf8");
  } catch {
    return "(source not available in this build)";
  }
}
