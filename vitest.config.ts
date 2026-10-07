import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// These are integration tests: they talk to the running app (BASE_URL) and its
// database. Start the stack first: `docker compose up -d db simulator && npm run dev`
// (or `docker compose up`), then `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
