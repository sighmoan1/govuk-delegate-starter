# Checks for a solo owner and multiple agents

Agents run focused local checks as they work. GitHub provides one independent check of a ready code PR; costly integration and research checks are started deliberately. This changes verification scheduling, not the tests or product behaviour.

## Automatic check

`fast.yml` runs **Fast code checks / code** when a code PR is opened ready for review, reopened, updated or marked ready. Draft PR jobs are skipped. Documentation-only changes are excluded (including Markdown within apps, packages and scripts). Application, package, style, script, test, workflow, dependency, root configuration and container/database-init changes qualify. Copy in application source qualifies because it can affect compilation. A newer run cancels an obsolete check for the same PR. There is no duplicate push-to-main run.

The check installs locked dependencies, generates Prisma clients, typechecks and builds every workspace, then tests the database-free research-feed schema, council authority handling, E2 comparator and Observatory import validation. It has a 15-minute timeout. It does not start Docker, migrate/reset fixtures, run browser journeys or call a vendor. It is a cheaper independent check, not the complete authorisation/regression assurance suite.

For the same check locally in a clean isolated checkout:

```bash
npm ci
bash scripts/ci-prepare.sh
CI=true NEXT_TELEMETRY_DISABLED=1 bash scripts/ci-fast.sh
```

`ci-prepare.sh` refuses to replace existing app environments. These commands generate local clients/build output but do not modify a running demo or database. Use the runtime/agent coordination guide before running integration checks that own ports and fixtures.

## Manual checks retained

Every existing verification command remains available in its workflow:

| Workflow file | Scope |
|---|---|
| `ci.yml` | Full synthetic stack: types/build, HMRC database tests, root API/swarm regression, browser consent/action/revocation journeys, public briefing, Observatory schema/UI and missing-vendor-key refusal checks. |
| `e2.yml` | Isolated controlled E2 API comparison and counterbalanced evidence, not a claimed research result merely because the harness passes. |
| `observatory-truth.yml` | Protected ledger, HTTP/archive auditing and concurrent enrollment against an isolated research database. |
| `whenisbins.yml` | Connector, email fixture browser and recurring-runner component types/tests. |
| `whenisbins-integration.yml` | Isolated fixture service journeys, connector/runner/email components and HMRC durable queue regression. No live WhenIsBins service execution. |
| `fingerprint-vendor.yml` | Existing explicit real EU vendor validation. Requires a configured key and owner-authorised vendor usage; never automatic and not run as part of this cleanup. |

Use **Actions → workflow → Run workflow → Branch** to select the branch under review, or:

```bash
gh workflow run ci.yml --ref codex/issue-123-example
gh workflow run whenisbins-integration.yml --ref codex/issue-123-example
```

No custom `ref` input overrides checkout: `workflow_dispatch` uses the selected branch/tag, and `actions/checkout` checks out that revision. The workflow must exist on the default branch for manual dispatch to be available. Confirm the displayed run branch and commit before treating it as PR evidence. Record run URLs and actual results in the issue/PR.

Manual fixture workflows cancel older runs for the same workflow/ref; different workflows can still run concurrently, so avoid launching overlapping suites for identical evidence. The vendor workflow retains non-cancelling concurrency to preserve deliberate vendor evidence and avoid accidental repeated external calls. Full regression already covers much of the component coverage; do not run every workflow for every PR.

Full synthetic regression retains redacted logs, JUnit and Playwright reports and failure traces for seven days; environment files and database dumps are not uploaded. Its cleanup removes only the isolated Actions stack/fixture volumes. For local reproduction follow the workflow commands in order with a unique `COMPOSE_PROJECT_NAME`, all required ports available and no shared demo database.

Before a significant release, run full synthetic regression and manually verify the three-minute clean-start demo. Authority/service changes need success, missing permission, revocation, expiry, unknown delegate, missing relationship and activity-event evidence. Observatory or WhenIsBins changes additionally need their relevant manual suite. Documentation-only changes need content/link checks; workflow changes need syntax and trigger review.

## Billing and repository checks

The owner's preference is **$0 additional Actions spending per month**. This repository cannot enforce an account billing cap. The billing setup and actual included allowance have not been verified or changed; existing Actions jobs reported that they could not start because of an account payment/spending-limit block. A manual trigger also consumes runner allowance if it starts. This scheduling change does not resolve that account block, guarantee a monthly cost, or enable paid usage.

Until the account block is resolved within the owner's $0 preference, attach local check evidence; never present a skipped or unstarted Actions job as a pass. Check account Billing budgets/usage separately with authorised access.

If branch protection names removed automatic research/regression checks, the owner must update those requirements to match this policy; manual jobs cannot satisfy an automatic gate until deliberately run. A path-filtered required workflow can remain pending on documentation-only PRs, so do not require `Fast code checks` for every PR without a separate policy for excluded changes. GitHub documents [workflow filters and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [manual dispatch and PR events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
