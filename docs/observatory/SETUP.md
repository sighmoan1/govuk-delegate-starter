# Observatory scaffold setup

Independent internal research prototype; synthetic fixtures only. The scaffold implements no collection feeds, browser sensors, classifiers or operational actions. The UI is read-only and requires no service credentials. Do not expose the research workbench publicly; authentication is not implemented. Compose binds its port to loopback; Next development servers are local research tools and must not be exposed through tunnels.

## Fresh database volume

Run `docker compose up --build`. Postgres creates the independent `observatory` database and owner on first initialization. Observatory applies its migration before listening on port 3303. Open http://localhost:3303. Readiness: http://localhost:3303/api/health (200 ready; 503 unavailable). The health query checks the migrated table, not only connectivity; neither readiness response includes credentials or research data.

## Existing database volumes

Postgres initialization scripts do not rerun on an existing volume. Provision the new local development login and database once, preserving existing fixtures:

```bash
docker compose exec db psql -U delegate -d postgres -c "CREATE USER observatory WITH PASSWORD 'observatory';"
docker compose exec db psql -U delegate -d postgres -c "CREATE DATABASE observatory OWNER observatory;"
docker compose up -d --build observatory
```

Skip each CREATE if that role/database already exists. Never delete the existing volume to upgrade. Credentials here are synthetic development defaults.

## Workspace development

Copy `apps/observatory/.env.example` to `apps/observatory/.env`, then:

```bash
npm ci
npm run db:migrate -w apps/observatory
npm run dev -w apps/observatory
npm run typecheck -w apps/observatory
npm test -w apps/observatory
npm run build -w apps/observatory
```

Root dev/build/typecheck/test scripts include the workspace. Its typecheck/build/dev scripts generate only its own client under `apps/observatory/src/generated/prisma`; no shared client or app imports are used. The schema currently contains only scaffold metadata. There is no fixture seed/reset that touches another service database.

## Isolation acceptance check

With the full stack ready, record `/api/health` as 200. Stop only Observatory with `docker compose stop observatory`; verify existing One Login/Delegate/HMRC browser and API journeys, including authority checking, still work. Start Observatory again, check health, and rerun its tests. A database outage returns 503 from its health endpoint; it cannot alter an authority grant or queue. The shared Postgres container remains common development infrastructure, so stopping that container affects all database-backed apps.

Full Compose boot and outage verification must be recorded before closing #66. Unit health tests alone do not establish full-stack isolation.
