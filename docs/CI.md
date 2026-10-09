# Automated regression

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual
dispatch. The `regression` job uses Node 22, `npm ci`, generated Prisma clients,
workspace typechecks and production builds. It builds the existing Docker images
and starts Postgres, the One Login simulator, and all four apps in an isolated
Compose project. It uses only checked-in synthetic fixtures and local test keys.

Readiness probes wait for One Login discovery, Delegate's seeded HMRC catalogue,
HMRC and About. Tests run sequentially because they share and reset fixtures:

1. HMRC database tests run before the queue worker is started.
2. The queue worker starts for root HTTP/API and swarm tests.
3. Chromium browser tests reset fixtures and verify the cross-app journeys.

Failure diagnostics include console output, JUnit reports, redacted container
logs, a Playwright HTML report and retained failure traces/screenshots. Artifacts
expire after seven days. Environment files and database dumps are not uploaded.
The stack and its fixture volume are removed on success or failure.

For local reproduction use a clean checkout, Node 22 and Docker Compose v2.
Follow the workflow commands in order; set `COMPOSE_PROJECT_NAME` to a unique
name and ensure ports 3300, 3301, 3302, 3304, 3399 and 5433 are available. Never
point these reset-based suites at a shared demonstration database. The prepare
helper refuses to overwrite existing workspace `.env` files.

The workflow definition alone is not passing evidence. Verify the first Actions
run and record its link before treating the new job as validated or making it a
required branch-protection check. Existing test evidence remains separate from
Actions execution evidence.
