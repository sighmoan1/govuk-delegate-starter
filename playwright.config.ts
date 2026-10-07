import { defineConfig } from "@playwright/test";

// Expects the stack to be running: `docker compose up` (or db+simulator and `npm run dev`).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.TEST_APP_URL ?? "http://localhost:3300", trace: "retain-on-failure", screenshot: "only-on-failure" },
});
