# Delegate GitHub-driven release

The caller in `deploy.yml` belongs at `.github/workflows/bathos-deploy.yml` in Delegate. The production override belongs at `deploy/compose.production.yml` in Delegate. The shared reusable workflow initially belongs at `.github/workflows/bathos-deploy-compose.yml` in Delegate and can later be moved to a separate **public** `bathos-gitops` repository.

Provision the DigitalOcean Droplet and shared edge first, then place a production-only environment file from `secrets.env.example` at `/srv/bathos/secrets/delegate-demo.env` on the server (0600). Replace every placeholder, and ensure the database passwords in DATABASE_URL match POSTGRES_PASSWORD. Note that `dev/db-init.sql` creates an Observatory login with development-only credentials; the Observatory is not started in the public profile and must be separately hardened before use.

Enable only after the receiving Delegate owner has acknowledged the handover in issue #158 and the existing live Mac demo and research records are backed up. The new stack starts with fresh synthetic fixtures; this code does **not** copy or reset the existing demo. Cut DNS/tunnel routing over only after functional testing, and do not point `about-demo` at private port 3304. Keep research feeds and demo reset controls private.

The override requires Docker Compose >= 2.24.4 for `!override`; it removes host-published database and simulator ports and attaches only the public apps to `bathos-edge`. Its public routes use `*.bathos.org` with the original demo hostnames. Cloudflare tunnel routing is provisioned separately as a one-time wildcard rule; subsequent app changes need no Cloudflare dashboard work.

Not yet automated: moving the pre-existing local database and connector state, provisioning secret **values**, the optional WhenIsBins live integration and research-only Observatory, and an off-host test-restored Postgres backup. The current release action takes on-host pre-release SQL dumps and retains volumes, and DigitalOcean Droplet backups are enabled, but neither is a verified independent database recovery system.
