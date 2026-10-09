import { execSync } from "node:child_process";

// Every run starts from the clean demo state: Sam with no claims, the agent
// knowing nobody, Delegate with no live permission. Works against the dev
// servers and the Docker stack alike (both use Postgres on localhost:5433).
export default function globalSetup() {
  // Each workspace must load its own database; a test runner may inherit Delegate’s URL.
  const env = { ...process.env };
  delete env.DATABASE_URL;
  execSync("npm run db:reset", { stdio: "ignore", env });
}
