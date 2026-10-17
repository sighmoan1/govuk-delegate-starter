# GitHub-driven DigitalOcean deployment proposal

Status: proposal only. Do not deploy or modify existing runtimes until Delegate receiving ownership is acknowledged and a deployment plan is approved.

## Goal

Merge to main -> tests -> build immutable container images -> publish to GHCR -> deploy only the affected application services to a DigitalOcean Droplet -> verify health and roll back on failure.

Infrastructure is separately managed by OpenTofu in a future `bathos-infrastructure` repository. Application deployments must not run `tofu apply`.

## Boundary

- Keep Delegate, Cultivate and other Bathos projects independently deployed.
- Existing Delegate main demo is on the presenter's machine and is not to be reset, overwritten or retired by this proposal.
- Retain persistent PostgreSQL and connector volumes. Back up and verify restore before any migration.
- Use a deployment-specific Compose override, not the development Compose defaults.
- Bind application and database ports to loopback or private networks. Expose only intended public routes through a named Cloudflare Tunnel.
- Expose the read-only About briefing, never the presenter console, Observatory, database, simulator admin, or research feeds.
- Replace all example credentials with secrets provisioned outside Git. Do not commit .env files, keys, tokens or state.
- Never run `npm run public`, `db:reset`, `docker compose down -v` or global prune in deployment.
- Use a single deployment lock, pinned image digests, readiness checks, and a rollback strategy. Database migrations require forward/backward compatibility planning.
- Production approval is required before switching DNS, importing existing data, or enabling unattended main-branch deploys.

## Proposed release path

1. PR checks test and build.
2. Merge builds only changed service images; publish to GHCR by immutable commit SHA.
3. Deployment job obtains an ephemeral, scoped credential and updates image digests in a versioned release manifest.
4. Remote agent pulls images and runs `docker compose up -d --no-deps` for changed services, leaving Postgres volumes untouched.
5. Check One Login OIDC discovery, Delegate catalogue, HMRC, Council and public briefing endpoints, plus queue worker health.
6. On failed application checks, revert image manifest and redeploy previous images; never automatically roll back schema/data.
7. Publish deployment outcome and retained evidence in GitHub Actions.

## Before implementation

- Confirm receiving Codex ownership ACK and the Delegate handover acceptance.
- Select DigitalOcean region, SSH/identity bootstrap and private container registry access.
- Decide whether to migrate demo data or start a new isolated synthetic environment.
- Define public hostname mapping and Cloudflare tunnel ownership.
- Establish encrypted backups, restore test, monitoring, and operational cost alerts.
- Confirm GHCR image architecture and available GitHub Actions minutes.

No cloud resources are created by this document.
