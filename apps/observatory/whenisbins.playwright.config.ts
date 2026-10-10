import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests", testMatch: "whenisbins.spec.ts", outputDir: "../../test-results/whenisbins-observatory", workers: 1,
 use: { baseURL: process.env.OBSERVATORY_UI_URL || "http://127.0.0.1:5418", headless: true, screenshot: "only-on-failure" } });
