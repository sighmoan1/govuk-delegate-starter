import { defineConfig } from "@playwright/test";
// Explicit dedicated configuration: never run the repository's destructive global setup.
export default defineConfig({ testDir: ".", testMatch: "whenisbins.spec.ts", timeout: 90_000, workers: 1, reporter: [["list"]], use: { baseURL: process.env.WHENISBINS_URL ?? "http://127.0.0.1:5710", trace: "retain-on-failure", screenshot: "only-on-failure" } });
