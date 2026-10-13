# Cheapest Cloud Run rollout for Delegate

**State:** GitHub implementation prepared; no Google Cloud or Neon resources have been created. No existing Delegate runtime is modified. Deployment stays disabled until a Google Cloud project and GitHub OIDC integration are configured.

## Target and principles

- Deploy the **read-only About briefing first**, without a database or always-on worker. The existing `.github/workflows/bathos-cloudrun-preview.yml` deploys this from pushes to `main` once configured.
- Select `us-central1` initially where acceptable for a *synthetic, non-sensitive* demonstration because Cloud Run free-tier pricing is benchmarked against Tier 1; benchmark latency against a UK region before choosing a location for personal data. Don't imply that the free tier only applies in US regions.
- Set `min-instances=0`, `max-instances=1`, `--cpu-throttling` (request-based billing), 1 vCPU, 512 MiB and concurrency 20. Do not configure minimum warm instances, a global load balancer, Cloud NAT, VPC connectors, always-on monitoring pings or a continuous worker.
- Use the included `*.run.app` URL for the initial trial, with no custom-domain infrastructure. For production domain use, Firebase Hosting proxy or other justified routing can be assessed separately; Cloud Run domain mapping is preview and isn't recommended for production.
- Build containers on GitHub Actions runners and push to one regional Artifact Registry repository. Keep the registry in the same region as Cloud Run. Configure a retention/cleanup policy to avoid unbounded image storage (but always retain deployed revision images and at least one previous release).
- Configure a Google Cloud billing budget and alert thresholds; **budget alerts aren't hard spending caps**. Scale and concurrency caps bound but do not eliminate costs.
- Use short-lived GitHub OIDC credentials with restricted Workload Identity Federation, not committed service-account credentials. Separate the deployer identity from the minimally privileged runtime identity.
- Keep secrets out of GitHub workflow command lines, logs and source. Use Secret Manager for runtime secrets only as needed.

## Full Delegate: why it's not one-container deployment

The existing Compose project includes One Login OIDC simulator/proxy, Delegate, HMRC, a database, a continuously polling HMRC worker, the Council service, About and private Observatory. Moving an unchanged background loop to a scale-to-zero Cloud Run HTTP instance is **not equivalent**: it may be suspended when no HTTP request is running. It also uses ephemeral container filesystem, which cannot be treated as durable storage.

After the briefing proves the deployment route:

1. Deploy the HTTP services as separate Cloud Run services. For public synthetic demo entry points use request-based billing with min 0, and preserve correct OIDC issuer, callback and cookie URLs.
2. Run new isolated Postgres databases on Neon. Start with free tier where appropriate. Keep Delegate, HMRC and Observatory ownership/logins separated; test Prisma TLS and pool settings, migrations, database grants and startup without resetting original data. Only synthetic fixtures.
3. Replace the always-running worker with a **bounded Cloud Run Job** triggered by Cloud Scheduler for periodic processing *if that meets product latency requirements*. Cloud Scheduler has its own pricing/free quota and jobs are billed while executing. For near-immediate asynchronous requests, evaluate Cloud Tasks push-to-Cloud Run or an authenticated worker endpoint instead of polling; preserve idempotency and queue semantics.
4. Keep WhenIsBins connector state and research evidence in durable storage. Do not put operational state solely on an ephemeral container.
5. Run the full consent, expiry, revocation, claims and swarm test suite against the isolated environment. Review auth, abuse limits, persistent sessions, Cloud Run concurrency and per-principal fairness.
6. Only after Delegate handover issue #158 is formally accepted, independently review a cutover. Until then no DNS change, deletion, reset or interruption of the existing demo.

## One-time Google Cloud account bootstrap (requires account access)

- Create/select a Google Cloud project; enable billing.
- Enable Cloud Run, Artifact Registry, IAM Credentials and Security Token Service APIs.
- Create regional Artifact Registry Docker repository `bathos-preview`; set a conservative cleanup policy.
- Create deployer and runtime service accounts. Give the deployer image-writer, Cloud Run deploy/update and service-account-user permissions on the appropriate resources only. The runtime account should have no special IAM roles for this read-only briefing.
- Create GitHub Workload Identity Federation provider restricted to repository `sighmoan1/govuk-delegate-starter` and branch `refs/heads/main`, then allow that principal to impersonate the deployer account.
- Set GitHub repository variables `BATHOS_GCP_PROJECT`, `BATHOS_GCP_REGION`, `BATHOS_GCP_WORKLOAD_IDENTITY_PROVIDER`, `BATHOS_GCP_DEPLOYER_SERVICE_ACCOUNT`, `BATHOS_GCP_RUNTIME_SERVICE_ACCOUNT`. Set `BATHOS_CLOUDRUN_PREVIEW_ENABLED=true` **last**.
- Push/merge to `main` and check the public read-only briefing and 404 on private paths. No routine approval should be needed after bootstrap.

## Costs and limits

At low use, Cloud Run can remain within its monthly free allowance; Neon free projects can remain free if usage fits. Additional charges can arise from egress, Google logging, Artifact Registry beyond 0.5 GiB-month free per billing account, Cloud Scheduler/Tasks, Secret Manager, GitHub Actions minutes and any non-free Neon usage. The free allowances are not a guaranteed zero-cost bill. Report actual billing usage after the trial.

## Future shared GitOps

Keep the caller workflow compact. Once a dedicated shared repository exists, extract the authenticated image-build/deploy logic to a version-pinned reusable `workflow_call` workflow. Each application must still own its build/tests/service metadata and deploy independently on `main`; no applications should depend on rebuilding a shared repo to ship their own changes.
