# Engineering verification — 9 October 2026

Code tested: `949f2e22843ecef40701d9e26c00c33d6e82427f`, based on main `2882efc955403d5b84fc3a97b8a9ce516b629ef9`. Subsequent PR #88 commits add documentation evidence only. Run: `codex-docs-sync-20261009`.

Workspace `npm run typecheck` and `npm run build -w apps/about` passed. HMRC Vitest: 118 tests across 6 files passed. Root Vitest: 223 tests across 16 files passed. Playwright: 28 local tests passed; 6 public-tunnel tests skipped because tunnels were not configured. Additional documentation smoke: 1 test passed, checking five routes at 1280px/320px, navigation, overflow and first-focus skip link.

The API suite exercises authorised, undelegated, revoked, expired, unknown-agent and missing-relationship cases, activity persistence and independent database assertions for claims, receipts and duplicate prevention. These are bounded synthetic regression results; the comparative experiments in VALIDATION.md remain pending.

Manual verification used freshly seeded isolated containers: principal signed in through One Login, excluded employment updates and approved tax-code/expense access. A separately authenticated agent received 200 ALLOW for tax-code access and 403 PERMISSION_MISSING for employment. The principal removed access; the same tax-code call returned 403 AUTHORISATION_REVOKED. All three attempts and the completed tax-code result were visible in authority activity.

## Environment and reproduction

Local Docker Compose/PostgreSQL 16, Next.js 15.5.27 and Vitest 3.2.7; synthetic data only. A separate project `delegate-docs-validation` used its own fresh volume and explicitly named private network. Delegate/One Login/HMRC/About/simulator/database ports were 3410/3411/3412/3414/3499/55434. Public URL variables used those ports; internal URLs retained service names.

HMRC tests ran with the isolated background worker stopped, because tests drive their own worker:

```sh
DATABASE_URL='postgresql://delegate:delegate@localhost:55434/hmrc' APP_URL='http://localhost:3302' DELEGATE_INTERNAL_URL='http://localhost:3410' npm test -w apps/hmrc
```

The suite has fixed assertions for APP_URL 3302; the actual isolated HTTP server remained on 3412. Restart the worker for root integration tests:

```sh
DATABASE_URL='postgresql://delegate:delegate@localhost:55434/delegate' DELEGATE_URL='http://localhost:3410' HMRC_URL='http://localhost:3412' ABOUT_URL='http://localhost:3414' ONELOGIN_URL='http://localhost:3411' APP_URL='http://localhost:3410' OIDC_PRIVATE_KEY_FILE='dev/oidc-client-private.pem' npx vitest run
```

Browser tests used the same service URLs and TEST_APP_URL 3410. The standard global setup was disabled and replaced by explicit isolated container seeding, to avoid resetting the default demo database.

## Invalid setup and limits

The first test project's network inherited the main demo network name, causing ambiguous service aliases. The initial HMRC run also competed with its worker and had a fixed-URL assertion mismatch. Those initial logs are retained below as invalid setup runs. After recreating on an explicitly private network, confirming its membership and separating worker execution, both suites passed. The demo database volume was retained; routing ambiguity prevents a claim that no initial test request ever reached it.

This is engineering verification, not a completed E1–E7 experimental protocol or evidence of comparative/economic benefit. Public-tunnel behaviour was not verified. Dependency installation reported 10 audit advisories (2 moderate, 4 high, 4 critical); dependency remediation remains separate work. Existing workspace-root and CSS compatibility build warnings were non-fatal.

## Archived output

Console output has ANSI escapes removed and the checkout path replaced by `<repo>`. The manual record is an observation note, not a browser trace. Initial `hmrc-tests.log` and `http-tests.log` are invalid setup runs; files with `isolated` in the name are the corrected runs.

| Artifact | SHA-256 |
|---|---|
| [hmrc-tests-isolated.log](20261009/hmrc-tests-isolated.log) | `e860fc7a4ae6ed675086a3baa20ab24d1e957fcfe6ac087b06dfffbc46aadf11` |
| [http-tests-isolated.log](20261009/http-tests-isolated.log) | `3e466f19157d7fe321a1d7d79d3e2681f707e725c24f07610699f6cea0b39669` |
| [e2e.log](20261009/e2e.log) | `93eaeb9c7261f42f8fb7815e385c114acf66cf4871a853cae6985fbabb118b47` |
| [docs-browser.log](20261009/docs-browser.log) | `7a6ae2b5b9b43baeb2fd7bb56f7198090eee02ed5636baeb4d9a46637edb9e66` |
| [manual-result.txt](20261009/manual-result.txt) | `18c71ffdfb9771f0547a98f05f4f4c2ee560e3aa0312dd6754aa7974c55bb819` |
| [hmrc-tests.log](20261009/hmrc-tests.log) | `e28d92fcdf96ae4673c998654e9cef577bc14df596149312066de8355487cc52` |
| [http-tests.log](20261009/http-tests.log) | `a55e04b7ebc0d5dae0af8f223ed8270871e8a176b0c057d7a165979cadd34b9f` |
