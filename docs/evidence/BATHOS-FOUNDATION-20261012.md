# Bathos foundation adoption evidence — 12 October 2026

Issue #151; PR #153; run `bathos-151-20261012-r1`; branch `codex/151-shared-bathos-foundation`, based on main `90c5910`. Implementation checkpoint `f4d634a` was tested with the final workflow/documentation/fast-check changes described in the PR.

## Isolation and restoration

Restoration issue #152 is complete: the retained public containers and named tunnel were restarted without resetting records, rotating secrets or replacing the deployment. Private configuration and both databases were backed up. Public readiness returned HTTP 200, and the briefing's private/reset routes remained unavailable.

Candidate verification used `/private/tmp/delegate-151`, Compose project `delegate-issue-152-r1`, its own database volume, database port 6343 and simulator 6399. Production-built host processes used 6300–6305; the read-only briefing used 6306. No candidate was deployed publicly. Explicit fixture URLs/databases and the existing synthetic development keys were used. Temporary council startup wrappers changed only the isolated listening port and are excluded from the PR.

## Automated checks

| Command / scope | Actual result |
|---|---|
| `npm run typecheck` after generating all three Prisma clients | All workspaces passed |
| `npm run build` | All workspaces passed |
| `npm run test:styles` | 4 passed |
| `npx vitest run` with isolated Delegate/HMRC/council URLs, both database URLs and synthetic OIDC signing-key path | 269 passed, 27 files |
| `npm test -w apps/whenisbins` | 104 passed, including assembled stylesheet bytes and versioned caching |
| `npm test -w packages/whenisbins-runner` | 28 passed |
| Research-feed, council, Observatory unit suites | 7, 10 and 45 passed respectively |
| `node --test scripts/e2/local-authority.test.mjs scripts/observatory/import-e2.test.mjs` | 7 passed |
| `npx playwright test e2e/agents.spec.ts e2e/delegate.spec.ts e2e/hmrc.spec.ts e2e/onelogin.spec.ts e2e/demo.spec.ts e2e/second-service.spec.ts e2e/swarm.spec.ts e2e/design-foundation.spec.ts --workers 1` with explicit isolated URLs | 32 passed |
| `npx playwright test --config e2e/public-briefing.config.ts` against 6306 | 4 passed |
| Rendered original-vs-adapter comparisons, included in browser suite and also run separately | 2 passed: five visual apps at 1280px and 320px, equal sampled typography/colour/spacing/focus and no horizontal overflow |
| Candidate Docker builds: One Login, About, Delegate, HMRC, Observatory | All five built successfully with the root package installed |
| Updater `--check`; workflow YAML and embedded shell syntax review | No newer compatible release; syntax passed |

The root authority tests cover authorised success, missing permission, revocation, expiry, unknown delegate, missing relationship and event logging. Browser coverage includes signed and declared agents, self-approval refusal, second service, claims, reflow and revocation. HMRC database tests passed 131/131 on the restored baseline before candidate work; the candidate does not change HMRC domain/queue logic. `styles/design.css` has no diff.

Initial checks exposed missing generated Prisma clients, a sandbox IPC restriction in the runner suite, and a transient package-download connection reset during Docker building. Client generation, running the runner suite with the required local permissions, and rebuilding resolved those failures; the results above are the successful final runs. This is local evidence, not a claim that GitHub Actions ran successfully. The manual upgrade workflow has not been dispatched or its dedicated token configured. Live vendor, email delivery and research runs were not performed.

## Clean synthetic walkthrough

Reset and seeded only the isolated databases with `npm run db:reset`. Used `scripts/briefings/demo.mjs prepare`, signed in through the local One Login browser, selected tax-code reading and working-from-home relief, left employment updates unselected, checked the scope and allowed access.

Request `ba7b1c2f-ca16-4383-a46d-3ee515bebf2d`; authority `1436438c-8a80-4325-84db-ebfa85413047`.

| Presenter action | Result | Activity check ID |
|---|---|---|
| `demo.mjs act`: tax-code read | 200, ALLOW | `85ef1abe-5396-4a86-85b9-38098516f43b` |
| Same command: synthetic working-from-home claim | 200, reference `JE-D7AF316E` | `3eb4d11a-cff8-4ef8-8fd5-e6e4d1a1d3a5` |
| Same command: excluded employment update | 403, `PERMISSION_MISSING` | `8ad8e8fe-17df-4d59-9094-069bc9edeb9c` |
| After citizen removed access: `demo.mjs after-revoke` tax-code read | 403, `AUTHORISATION_REVOKED` | `3d208577-180e-4243-a18e-1e1a4df0119f` |

The citizen browser showed original consent, two completed outcomes, the claim reference, excluded-action refusal, access removal and the new revoked refusal. A direct query confirmed all four activity rows. HMRC had one `job_expenses` claim and no employment claim. Seeded historical events were not counted as evidence of these new attempts.

Local logs and screenshot are under `/private/tmp/delegate-runtime-152/` (`style-*.log`, `manual-candidate-action.json`, `manual-candidate-revoked.json`, `manual-candidate-revoked.png`). Private state/configuration/databases are not committed or uploaded. Issue #151 stays open until its PR is reviewed and merged; public upgrade follows the retained-data operator procedure afterward.
