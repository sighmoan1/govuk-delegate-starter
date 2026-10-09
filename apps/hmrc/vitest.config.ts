import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database-backed tests of HMRC's own code (no other service needed, only the
// `hmrc` database): idempotency, atomicity, failure injection and the queue.
//   docker compose up -d db && npm run db:migrate -w apps/hmrc && npm test -w apps/hmrc
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
