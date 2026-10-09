import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "ui.spec.ts",
  outputDir: "../../test-results/observatory",
  use: { baseURL: "http://localhost:3303", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
