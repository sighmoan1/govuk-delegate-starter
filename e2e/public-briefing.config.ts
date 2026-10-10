import { defineConfig } from "@playwright/test";
// Dedicated read-only checks: no global setup or shared demo reset.
export default defineConfig({ testDir: ".", testMatch: "public-briefing.spec.ts", workers: 1, retries: 0, use: { headless: true }, reporter: "list" });
