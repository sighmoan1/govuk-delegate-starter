# Briefing pack validation, 10 October 2026

Run: `briefing-20261010-01`. Original delivery: issue #111. Baseline: main `6b4f3895f246cfe9e274059c57e4dc1ea7989650`.

## Presentation exports

The bundled Artifact Tool exported 11 concept slides and 18 design-review slides. Each has speaker notes and source URLs. Text and tables are editable; the labelled Observatory access-screen image is a raster screenshot of the isolated review interface.

Finalizer package-integrity, layout/heading-fit, Arial font policy, native-table requirements and first-party import checks passed with zero findings. All 29 rendered slides were inspected; revised slides were inspected again and unchanged renders compared byte-for-byte. These checks do not establish native PowerPoint behaviour on every recipient's computer.

Final download SHA-256:

- Concept: `c5916da2df977af3ef8e2ab72bcefffa1ef5d58fff98b96c38593ff44c776cfe`
- Design review: `ec9eedeab86c9772fa52ef6ec6246231fd75ea29b59c5d2780109b61f448ad8f`

## Browser pages

`npm run typecheck -w apps/about` and `npm run build -w apps/about` passed. The build emitted the existing workspace-root warning about multiple lockfiles.

Playwright exercised `/briefing`, both level pages and `/briefing/demo` at widths 1280 and 320 pixels: eight page checks passed, no horizontal overflow, no broken images, no page errors, working section targets and keyboard-operated speaker notes. The final production preview served both downloadable files with HTTP 200 and bytes matching the validated exports. Unknown, `constructor` and `toString` level URLs returned 404.

## Presenter client and existing authority behaviour

`node --check scripts/briefings/demo.mjs` passed. The client stopped before service actions when the request was not approved. A browser rehearsal on the isolated review stack (applications 5300–5305, PostgreSQL 55434) used a fresh synthetic email, unchecked consent, two selected capabilities, check/allow, service actions, account outcomes, browser revocation and the next refusal.

Observed results: tax-code read 200; synchronous claim 200; repeated `act` returned the same claim reference with `idempotent_replay: true`; excluded employment change 403 `PERMISSION_MISSING`; account detail showed a service outcome as “Done”; after removal tax-code read returned 403 `AUTHORISATION_REVOKED`. No global reset was used. An initial attempt using the prefilled, previously used Sam account correctly returned `NEW_EVIDENCE_REQUIRED`; the runbook now requires a fresh local synthetic identity for a new first-claim rehearsal.

With the isolated Delegate private environment loaded (never printed), the actual regression command was:

```sh
DATABASE_URL=postgresql://delegate:delegate@localhost:55434/delegate \
DELEGATE_URL=http://localhost:5300 HMRC_URL=http://localhost:5302 \
node --env-file=/Users/apple/.codex/worktrees/observatory-coordination/govuk-delegate-starter/apps/delegate/.env \
node_modules/vitest/vitest.mjs run tests/delegation.test.ts tests/hmrc.test.ts
```

Both files passed: 32 tests, including authorised, undelegated, revoked, expired, unknown delegate, missing relationship and one activity event per attempt. Earlier attempts failed at environment preparation (missing generated Prisma client, then missing token signing configuration); generating the ignored client and loading the existing isolated configuration resolved those setup failures.

This is a browser-driven synthetic rehearsal, not a newly enrolled human or real-agent research result. It used the compatible combined Observatory review stack. The pack's Observatory and participant/pilot dependencies remain explicitly unmerged or unfulfilled at preparation. The existing swarm/Observatory evidence is linked in the runbook and addendum; no new vendor event or combined detection accuracy was manufactured.

## Editorial checks

The complete texts, slide headings and notes were reviewed using tropes.fyi and the humanizer guidance. Findings are attributed, precedent is distinguished from legal equivalence, test counts retain their denominators, and the adoption/observation hypotheses remain proposed tests. Centralisation, standards and production ownership are discussion questions rather than approved architecture decisions.
