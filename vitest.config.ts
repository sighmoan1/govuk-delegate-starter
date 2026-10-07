import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests. They talk to the running services over HTTP and reach into
// Delegate's own code only to set up state (approve, revoke). Start the stack
// first: `docker compose up` (or db + simulator and `npm run dev`), then `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/delegate/src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
