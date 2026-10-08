import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database-backed tests of HMRC's own code (no other service needed, only the
// `hmrc` database): idempotency, atomicity and failure injection.
//   docker compose up -d db && npm run db:migrate -w apps/hmrc && npm test -w apps/hmrc
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
