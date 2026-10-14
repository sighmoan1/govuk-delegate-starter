import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: ["ui.spec.ts", "classification.spec.ts", "workbench.spec.ts"],
  outputDir: "../../test-results/observatory",
  use: { baseURL: process.env.OBSERVATORY_UI_URL ?? "http://localhost:3303", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
