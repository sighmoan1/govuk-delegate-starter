import { defineConfig } from "@playwright/test";

// Explicit separate invocation: never included in ordinary regression and never
// records vendor IDs, enrolment credentials or the public key in traces.
export default defineConfig({ testDir: ".", testMatch: "fingerprint-vendor.spec.ts", workers: 1,
  timeout: 120_000, reporter: "list", use: { trace: "off", screenshot: "off", video: "off" } });
