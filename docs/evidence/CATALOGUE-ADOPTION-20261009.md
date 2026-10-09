# Catalogue adoption verification — 9 October 2026

Run `codex-pr86-finish-20261009`, issue #29 / PR #86. Final application code: `b1d8d915987cfd9315a1471aace7356a7f0a40aa`. Subsequent commit adds evidence only. Synthetic local Docker/PostgreSQL 16; Vitest 3.2.7 and repository Playwright Chromium. This is bounded engineering verification, not a comparative evaluation.

## Results

- Workspace typecheck and Delegate, HMRC, worker and About production image builds passed.
- Final stable API suite: **227 passed**, 17 files. It includes four catalogue-adoption tests, mandatory authority/refusal/activity scenarios, step-up, independent database outcomes, idempotency and swarms.
- HMRC suite: **118 passed**, 6 files. Receiving-service code is unchanged by the completion fixes.
- Final upgraded-stack browser suite: **28 passed**, 6 public-tunnel tests skipped; duration 42.5 seconds.
- Fresh-database browser suite after account-label correction: **28 passed**, 6 public-tunnel skips. The subsequent first-publication replay fix has its own regression in the final API suite and bootstrap verification on the upgraded stack.
- Documentation smoke: **1 passed**, five routes at 1280px and 320px, navigation, no overflow and keyboard skip link.
- Pre/post migration inspection preserved all **8 legacy capability IDs, names, risk flags and step-up settings**. Bootstrap on a fresh named volume succeeded; repeat registration returned `replayed: true`.
- Delegate source scan found no HMRC capability codes or operation endpoint paths. Definitions reside in the HMRC-owned JSON artifact.

Focused tests independently inspect persisted capability metadata and permission IDs: equivalent/incompatible legacy rows, immutable historical rows, pending consent approved after update, higher-version rollback, latest catalogue text surviving reset, bounded approval expressions, and replay of a publication made before adoption. Browser tests exercise consent, service actions, receipts, revocation, signed-agent separation and reset. The manual baseline flow recorded in ENGINEERING-20261009.md predates this PR; it is not presented as a new manual run.

## Reproduction

Use the separate `delegate-docs-validation` project/network/database volume described in [the previous engineering record](ENGINEERING-20261009.md), with ports 3410/3411/3412/3414 and PostgreSQL 55434. Build first, start services, wait for HTTP/database readiness, then run checks sequentially. Stop its HMRC worker while running the HMRC database suite; restart it for integration/browser checks. Fresh setup used another project/network/volume `delegate-pr86-fresh`, ports 3420/3421/3422/3424 and PostgreSQL 55444.

```sh
DATABASE_URL='postgresql://delegate:delegate@localhost:55434/hmrc' APP_URL='http://localhost:3302' DELEGATE_INTERNAL_URL='http://localhost:3410' npm test -w apps/hmrc
DATABASE_URL='postgresql://delegate:delegate@localhost:55434/delegate' DELEGATE_URL='http://localhost:3410' HMRC_URL='http://localhost:3412' ABOUT_URL='http://localhost:3414' ONELOGIN_URL='http://localhost:3411' APP_URL='http://localhost:3410' OIDC_PRIVATE_KEY_FILE='dev/oidc-client-private.pem' npx vitest run
DELEGATE_URL='http://localhost:3410' HMRC_URL='http://localhost:3412' ABOUT_URL='http://localhost:3414' ONELOGIN_URL='http://localhost:3411' TEST_APP_URL='http://localhost:3410' npx playwright test --config .validation/playwright.config.ts
```

The browser config uses repository tests but disables default global setup; explicitly seed only the isolated containers beforehand. Reset tests preserve catalogue publications.

## Negative runs and limitations

Initial fresh/upgrade browser runs exposed generated-code labels in account/activity views. The answer-link assertion failed, leaving an unseen receipt that caused the subsequent singular-notification assertion to fail. Both were corrected by using pinned catalogue labels; final full runs passed. Type/build checks caught intermediate label-name and receipt-relation mistakes before the final build.

One API rerun overlapped container refresh and had connection/pool failures; a later run started before the new HTTP server was ready and had closed-socket failures. Another upgrade browser run timed out in reset while image building overloaded Docker. These failed runs are retained as labelled excerpts. After builds/restarts finished and readiness was confirmed, the final sequential API/browser runs passed. They do not justify attributing those setup failures to business logic.

Public tunnels were not configured. No production security, real citizen comprehension, scale or comparative/economic benefit is established. Generic consent expansion and immutable consent snapshots remain #30/#31.

## Output and hashes

ANSI escapes removed; checkout path replaced by `<repo>`. Files ending `excerpt` are explicitly partial output; full originals remain in local `.validation`. The initial full browser failure log is retained alongside passing output.

| Artifact | SHA-256 |
|---|---|
| [pr86-docs-final.txt](catalogue-20261009/pr86-docs-final.txt) | `638e10370575be9f8f1d55c4ae45d2815ef49fd6fb0e6e0c9ec87e1283368fc3` |
| [pr86-e2e.txt](catalogue-20261009/pr86-e2e.txt) | `ea44bd36eb1c136d304db4dfd1737840d574d0d003d4e97766b56661a6cf35ac` |
| [pr86-final-api-excerpt.txt](catalogue-20261009/pr86-final-api-excerpt.txt) | `2c79e1e3fde7e4ac289058fc55f705afca84b11746a0256534a1c65af98f69de` |
| [pr86-final-api-ready.txt](catalogue-20261009/pr86-final-api-ready.txt) | `fa3d37e2304cdea7da3bf6d65b199a0807dbd727a1bb49c5f34956bb472bee45` |
| [pr86-final-browser-ready.txt](catalogue-20261009/pr86-final-browser-ready.txt) | `b51cb6aa6a906386129ad1f20e176ac4b6891e12f73e98d49f5da68078e4fdec` |
| [pr86-fresh-e2e-final.txt](catalogue-20261009/pr86-fresh-e2e-final.txt) | `41818bb80c159eb3e6f2ba640ac78dc35b605909bb3061fe2ab6cd45df08f242` |
| [pr86-hmrc.txt](catalogue-20261009/pr86-hmrc.txt) | `5794378a13f5ed8a0e8fc53829aec0136c86c88d933f3038f648f978821a28ce` |
| [pr86-http-final-excerpt.txt](catalogue-20261009/pr86-http-final-excerpt.txt) | `5cc292547385e0b72591d6b62689617f551b27d7c35c3fe80a6553778cce6521` |
| [pr86-replay.txt](catalogue-20261009/pr86-replay.txt) | `64706ff7d5674263bc539450764f72b7d9f4fb709fb66dc0c0aa3f5e25624f61` |
| [pr86-typecheck-final.txt](catalogue-20261009/pr86-typecheck-final.txt) | `4cecc105e93eea908057d072b5c5c014998fa84452c2bcd44b7629de2095563d` |
| [pr86-upgrade-e2e-final-excerpt.txt](catalogue-20261009/pr86-upgrade-e2e-final-excerpt.txt) | `d66992d4fa0b75c51f249b623a157b428b9b737094970dff85dc5b87de9d5354` |
