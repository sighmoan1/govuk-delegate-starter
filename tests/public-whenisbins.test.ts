import { describe, expect, it } from "vitest";
import { whenisbinsPublicPlan, publicEnvValues, updatePublicAddresses } from "../scripts/public-whenisbins.mjs";

const named = { hosts: { about: "about-demo.example.org", whenisbins: "whenisbins-demo.example.org" } };
const values = {
  PUBLIC_MODE: "true", WHENISBINS_MODE: "live", WHENISBINS_LIVE_ENABLED: "true", WHENISBINS_PRIVATE_CONFIG_DIR: ".public/whenisbins",
  WHENISBINS_SERVICE_KEY: "service-" + "s".repeat(32), WHENISBINS_AGENT_CLIENT_SECRET: "agent-" + "a".repeat(32),
  WHENISBINS_RESEARCH_FEED_KEY: "feed-" + "f".repeat(32), WHENISBINS_RESEARCH_PSEUDONYM_KEY: "hash-" + "h".repeat(32),
  WHENISBINS_RESEARCH_FEED_ENABLED: "true", WHENISBINS_AGENT_CLIENT_ID: "registered-agent", WHENISBINS_PRESENTER_CODE_HASH: "a".repeat(64),
};
const env = (overrides = {}) => Object.entries({ ...values, ...overrides }).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
const options = { cwd: "/isolated/repository", exists: () => true };

describe("optional real-provider public delivery", () => {
  it("leaves existing deployments disabled without an explicit live request", () => {
    expect(whenisbinsPublicPlan({ hosts: { about: "about.example.org" } }, "PUBLIC_MODE=true\n", { exists: () => { throw Error("must not inspect private files"); } })).toEqual({ enabled: false });
  });
  it("requires live mode, a hostname, private inputs and separate strong credentials", () => {
    for (const override of [{ WHENISBINS_MODE: "fixture" }, { WHENISBINS_LIVE_ENABLED: "false" }, { PUBLIC_MODE: "false" }, { WHENISBINS_PRIVATE_CONFIG_DIR: "" }, { WHENISBINS_SERVICE_KEY: "short" }, { WHENISBINS_AGENT_CLIENT_SECRET: "" }, { WHENISBINS_RESEARCH_FEED_KEY: values.WHENISBINS_SERVICE_KEY }, { WHENISBINS_PRESENTER_CODE_HASH: "bad" }, { WHENISBINS_RESEARCH_FEED_ENABLED: "false" }]) expect(() => whenisbinsPublicPlan(named, env(override), options)).toThrow();
    expect(() => whenisbinsPublicPlan({ hosts: {} }, env(), options)).toThrow();
    expect(() => whenisbinsPublicPlan({ hosts: { whenisbins: "bad.example.org\nservice: private" } }, env(), options)).toThrow();
    expect(() => whenisbinsPublicPlan(named, env(), { ...options, exists: path => !path.endsWith("mailboxes.json") })).toThrow("mailboxes.json");
  });
  it("returns only non-secret deployment metadata and never creates or changes credentials", () => {
    const before = env(); const plan = whenisbinsPublicPlan(named, before, options);
    expect(plan).toEqual({ enabled: true, configDir: "/isolated/repository/.public/whenisbins", url: "https://whenisbins-demo.example.org" });
    for (const secret of [values.WHENISBINS_SERVICE_KEY, values.WHENISBINS_AGENT_CLIENT_SECRET, values.WHENISBINS_RESEARCH_FEED_KEY, values.WHENISBINS_PRESENTER_CODE_HASH]) expect(JSON.stringify(plan)).not.toContain(secret);
    expect(env()).toBe(before);
  });
  it("preserves every existing credential and unrelated value when updating public addresses", () => {
    const old = env() + "DELEGATE_SESSION_SECRET=retained-private-session-value\nAGENT_CLIENT_SECRET=retained-existing-agent-value\nABOUT_PUBLIC_URL=https://old.example.org\nOTHER_SETTING=unchanged\n";
    const before = publicEnvValues(old); const after = publicEnvValues(updatePublicAddresses(old, "https://about-demo.example.org", whenisbinsPublicPlan(named, old, options)));
    for (const [key, value] of Object.entries(before)) if (key !== "ABOUT_PUBLIC_URL") expect(after[key]).toBe(value);
    expect(after.ABOUT_PUBLIC_URL).toBe("https://about-demo.example.org"); expect(after.WHENISBINS_PUBLIC_URL).toBe("https://whenisbins-demo.example.org");
    expect(publicEnvValues(updatePublicAddresses(old, "https://about-demo.example.org", { enabled: false })).WHENISBINS_PUBLIC_URL).toBeUndefined();
  });
});
