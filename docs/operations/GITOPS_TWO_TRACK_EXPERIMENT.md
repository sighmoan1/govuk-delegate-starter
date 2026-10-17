# GitOps deployment experiment: DigitalOcean vs Cloud Run + Neon

**Status:** Proposed; no cloud resources provisioned or current live Delegate traffic moved.

This experiment is in response to the parallel architecture review: Cloud Run + Neon may reduce server administration and idle cost, while DigitalOcean Docker Compose requires the least code migration. Both must offer the same developer experience: merge/push to `main` -> validate -> automatically deploy. Neither should require manual releases.

## Experimental tracks

| Dimension | DigitalOcean Docker Compose | Google Cloud Run + Neon |
| --- | --- | --- |
| Existing services | Current Compose stack, including worker | Cloud Run services, worker pool/job |
| Data | Persistent Postgres Docker volume | Separate Neon Postgres project |
| Internet entry | Cloudflare named tunnel; hostnames unchanged after cutover | Isolated Cloud Run preview URL; later Cloudflare routing |
| App release | Existing proposed workflow | Proposed preview workflow, expand after baseline |
| Reset/destructive tests | Forbidden on main demo | Fresh, synthetic preview data only |
| Server lifecycle | Always-on Droplet | HTTP apps can scale to zero |
| Background tasks | Existing HMRC worker loop | Prefer worker pool; jobs/queues if appropriate |
| Authentication | Existing One Login simulator | Preserve OIDC issuer, redirect URLs and cookie/session behaviour |

## Experiment sequence

1. **Both targets prove GitHub-driven deployment** from a deliberately trivial change: verified source revision, automatic build, health check, no manual intervention.
2. **Cloud Run smoke test** starts with `apps/about` in `PUBLIC_BRIEFING_MODE`, because it is intentionally read-only and requires no database. It runs on an independent URL and never gets access to the presenter console. Current `main`-branch workflow is gated on `BATHOS_CLOUDRUN_PREVIEW_ENABLED`.
3. **Neon migration experiment** uses a *new isolated database*, never the existing public demo database. Verify Delegate/HMRC/Observatory Prisma migrations, TLS connections, pool limits, grants and seed behaviour. Redact DSNs from logs.
4. **Full-path Cloud Run evaluation** adds One Login, Delegate, HMRC, independent Council and HMRC worker pool. Assess cross-service URLs, internal authentication, distributed sessions, idempotency, rate-limit behaviour, queue fairness, operation receipts, and in-memory counters. Run the consent -> allowed -> prohibited -> revoked journey and swarm/load tests using only synthetic fixtures.
5. **WhenIsBins** is a separate acceptance gate: persistent file state, recurring worker, provider integrations and evidence retention must be accounted for. Do not silently replace these with ephemeral filesystem state.
6. Collect deployment lead time, successful deployments, regression failures, cold-start latency, functional equivalence, hours of operational maintenance, and 30-day *observed* hosting + DB + registry + backup + bandwidth costs. Keep cost estimates separate from measurements.

## Critical constraints

- The existing public Mac-hosted demo and research databases stay unchanged until handover #158 is accepted and a reviewed cutover is authorised. No reset, restart, DNS change or research data deletion.
- Do not make both experiments claim `delegate-demo.bathos.org` or otherwise share a live write database.
- Cloud Run HTTP services can scale to zero; worker pools do **not** automatically scale to zero in the same way, and continuous background work still incurs charges. See Google's Cloud Run worker-pools documentation.
- Public Cloud Run URL for the briefing is intentional. The future full application must limit network ingress and privilege, and keep non-public APIs non-public. Cloudflare alone is not proof that an `*.run.app` endpoint is private.
- Cloud Run default instances are ephemeral. Provider-specific secrets are stored in Google Secret Manager / DigitalOcean host secret store, never in Git, workflow outputs, or application logs.
- Postgres migrations must be reviewed for data safety. Automatically run compatible migrations only after an independently test-restored backup exists. Application rollback does not roll back a schema.
- The reusable deployment interface should be provider-neutral: per-app `deploy/bathos.yaml` (service ports, health checks, dependencies, public routes, release strategy), plus one shared workflow version. Implementation stays provider-specific.
- If GitHub Actions account billing prevents jobs from starting, fix the account limitation first; do not infer success from a merged commit.

## Decision

Choose the default for new Bathos apps based on **observed** cost and complexity, not merely nominal cloud pricing. Keep the VPS as a straightforward fallback for persistent or heavyweight workloads. Cloudflare Pages already deploys the static `bathos.org` site from Git: don't migrate a working static site just to standardise hosts.

## One-time prerequisites for this preview

Configure a Google Cloud project with billing, Artifact Registry repository `bathos-preview`, GitHub OIDC workload identity federation locked to `sighmoan1/govuk-delegate-starter` and `refs/heads/main`, an image publisher / Cloud Run deployer service account, and a low-permission Cloud Run runtime service account.

GitHub repository variables: `BATHOS_GCP_PROJECT`, `BATHOS_GCP_REGION`, `BATHOS_GCP_WORKLOAD_IDENTITY_PROVIDER`, `BATHOS_GCP_DEPLOYER_SERVICE_ACCOUNT`, `BATHOS_GCP_RUNTIME_SERVICE_ACCOUNT`, `BATHOS_CLOUDRUN_PREVIEW_ENABLED=true`. Only set the last after identities and billing are configured.

The workflow uses short-lived OIDC credentials rather than a stored Google service account JSON key. It is not enabled by default.
