# Repository and delivery status — 9 October 2026

## Audit baseline

Remote `main` was fetched at `2882efc955403d5b84fc3a97b8a9ce516b629ef9` (catalogue publication, PR #85). The local imported snapshot `74bbdbd` had no shared Git ancestor with remote main. It was preserved as `backup/local-import-2026-10-09`; its only working-tree change, Finder metadata, was stashed. Local `main` was recreated tracking `origin/main` and verified zero commits ahead/behind with a clean tree. Documentation work continues on issue #87's focused branch.

All remote topic branches were checked against Git ancestry, patch equivalence and GitHub PR status. There were 29: 28 merged PRs and one open PR. A retained squash-merged branch can appear “unmerged” to Git despite its PR being merged. No branch was deleted or merged merely to clear that label.

## Branch inventory at the audit baseline

| Remote branch | Pull request | Disposition |
|---|---|---|
| `docs/decision-backlog` | [#60](https://github.com/sighmoan1/govuk-delegate-starter/pull/60) | Merged; ancestor of main |
| `docs/decision-disposition` | [#81](https://github.com/sighmoan1/govuk-delegate-starter/pull/81) | Merged; ancestor of main |
| `docs/delegate-orchestrate-boundary` | [#27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27) | Merged; ancestor of main |
| `docs/validation-and-evidence` | [#46](https://github.com/sighmoan1/govuk-delegate-starter/pull/46) | Merged; ancestor of main |
| `fix-consent-anon-redirect` | [#24](https://github.com/sighmoan1/govuk-delegate-starter/pull/24) | Merged PR; branch retained after squash/reconciliation |
| `fix/signed-browser-target` | [#82](https://github.com/sighmoan1/govuk-delegate-starter/pull/82) | Merged; ancestor of main |
| `integrate/swarm-polling` | [#79](https://github.com/sighmoan1/govuk-delegate-starter/pull/79) | Merged; ancestor of main |
| `issue-1-hmrc-guard-capability` | [#9](https://github.com/sighmoan1/govuk-delegate-starter/pull/9) | Merged PR; branch retained after squash/reconciliation |
| `issue-17-no-delegate-quota` | [#25](https://github.com/sighmoan1/govuk-delegate-starter/pull/25) | Merged PR; branch retained after squash/reconciliation |
| `issue-18-hmrc-idempotency` | [#26](https://github.com/sighmoan1/govuk-delegate-starter/pull/26) | Merged PR; branch retained after squash/reconciliation |
| `issue-19-transaction-bound-step-up` | [#44](https://github.com/sighmoan1/govuk-delegate-starter/pull/44) | Merged PR; branch retained after squash/reconciliation |
| `issue-2-web-bot-auth-binding` | [#13](https://github.com/sighmoan1/govuk-delegate-starter/pull/13) | Merged PR; branch retained after squash/reconciliation |
| `issue-20-throughput-split` | [#45](https://github.com/sighmoan1/govuk-delegate-starter/pull/45) | Merged PR; branch retained after squash/reconciliation |
| `issue-21-fair-queue` | [#62](https://github.com/sighmoan1/govuk-delegate-starter/pull/62) | Merged PR; branch retained after squash/reconciliation |
| `issue-22-swarm-experiments` | [#63](https://github.com/sighmoan1/govuk-delegate-starter/pull/63) | Merged; ancestor of main |
| `issue-23-claim-progress-etag` | [#61](https://github.com/sighmoan1/govuk-delegate-starter/pull/61) | Merged; ancestor of main |
| `issue-28-service-catalogues` | [#85](https://github.com/sighmoan1/govuk-delegate-starter/pull/85) | Merged; ancestor of main |
| `issue-29-hmrc-catalogue` | [#86](https://github.com/sighmoan1/govuk-delegate-starter/pull/86) | Open PR; not included in main |
| `issue-3-delegation-ancestors` | [#10](https://github.com/sighmoan1/govuk-delegate-starter/pull/10) | Merged PR; branch retained after squash/reconciliation |
| `issue-36-doc-alignment` | [#80](https://github.com/sighmoan1/govuk-delegate-starter/pull/80) | Merged; ancestor of main |
| `issue-37-atomic-step-up` | [#40](https://github.com/sighmoan1/govuk-delegate-starter/pull/40) | Merged PR; branch retained after squash/reconciliation |
| `issue-38-step-up-freshness` | [#41](https://github.com/sighmoan1/govuk-delegate-starter/pull/41) | Merged PR; branch retained after squash/reconciliation |
| `issue-39-withdrawn-answers-polling` | [#42](https://github.com/sighmoan1/govuk-delegate-starter/pull/42) | Merged PR; branch retained after squash/reconciliation |
| `issue-4-receipts-disputes` | [#14](https://github.com/sighmoan1/govuk-delegate-starter/pull/14) | Merged PR; branch retained after squash/reconciliation |
| `issue-5-completed-transactions` | [#12](https://github.com/sighmoan1/govuk-delegate-starter/pull/12) | Merged PR; branch retained after squash/reconciliation |
| `issue-6-atomic-approval` | [#16](https://github.com/sighmoan1/govuk-delegate-starter/pull/16) | Merged PR; branch retained after squash/reconciliation |
| `issue-7-consent-csrf` | [#11](https://github.com/sighmoan1/govuk-delegate-starter/pull/11) | Merged PR; branch retained after squash/reconciliation |
| `issue-8-repo-hygiene` | [#15](https://github.com/sighmoan1/govuk-delegate-starter/pull/15) | Merged PR; branch retained after squash/reconciliation |
| `issue-83-agent-work-tracking` | [#84](https://github.com/sighmoan1/govuk-delegate-starter/pull/84) | Merged PR; branch retained after squash/reconciliation |

The active catalogue migration #86 overlaps service-catalogue documentation; this refresh leaves its implementation and `SERVICE_CATALOGUES.md` untouched. Generic consent (#30), consent snapshots (#31), enforceable constraints (#32) and a second mock service (#33) are follow-up work. Observatory issues #64–78 describe a proposed research workbench; there is no Observatory app in this baseline.

## Implemented versus proposed

The current code includes atomic request approval, ancestor-chain checking, signature binding/replay defence, consent CSRF defence, receipt retry/freshness handling, actual service outcomes, transaction-bound step-up, idempotent submissions, durable queue processing and conditional progress polling. Delegate checks spend no citizen service allowance. Authenticated immutable catalogue publication/discovery is merged; HMRC catalogue-backed bootstrap remains in review.

[CURRENT_BEHAVIOUR.md](CURRENT_BEHAVIOUR.md) is the integration contract. [ARCHITECTURE.md](ARCHITECTURE.md) distinguishes implementation from target. The original build/content briefs and early numbered decisions preserve history. National decisions are deferred in [DECISION_DISPOSITIONS.md](DECISION_DISPOSITIONS.md). No comparative or economic result is inferred from implementation.

## Local runtime and verification

Before reconciliation the running Docker images were older than remote main: the About site's `/evidence` and `/delegate-orchestrate` returned 404, and no HMRC queue worker was running. Source synchronisation does not update container images. Rebuild with `docker compose up -d --build`; retain the database volume and let additive migrations run. Use a separate database/stack for reset-heavy tests.

Verification for this refresh is recorded below after execution. Existing `.last-run.json` files or test source alone are not evidence that the current checkout passes. No GitHub checks were reported for PRs #80 and #85 during the audit; absence of CI is not a passing result.

### Refresh verification

Executed against `949f2e2`: workspace typecheck and About production build passed; HMRC tests 118/118, root integration tests 223/223, browser tests 28 passed (6 public-tunnel tests skipped), documentation smoke passed at 1280px and 320px. The manual clean-fixture approval → ALLOW → undelegated DENY → revoke → DENY flow passed, with every attempt visible in activity.

The local demo stack was rebuilt with its database volume retained; the HMRC worker is running and `/evidence`, `/delegate-orchestrate` and `/project-status` return 200. [The pinned engineering record and archived output](evidence/ENGINEERING-20261009.md) include reproduction, independent DB assertions and invalid initial setup runs. Dependency installation reported 10 audit advisories; remediation remains separate work. [PR #88](https://github.com/sighmoan1/govuk-delegate-starter/pull/88) contains this refresh.


## Catalogue adoption follow-up — PR #86

HMRC now owns its versioned capability definitions in `apps/hmrc/service-catalogue.json`. Bootstrap registers them through the authenticated publication handler; citizen reset preserves publications. New requests select the current catalogue, while pending consent and grants retain historical capability IDs. Account and activity views use those stored labels. The branch inventory above preserves the earlier audit baseline; #30–33 remain follow-up work.
