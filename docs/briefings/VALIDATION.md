# Briefing pack validation, 10 October 2026

Run: `briefing-20261010-01`. Original delivery: issue #111. Baseline: main `6b4f3895f246cfe9e274059c57e4dc1ea7989650`.

## Presentation exports

The bundled Artifact Tool exported 11 concept slides and 18 design-review slides. Each has speaker notes and source URLs. Text and tables are editable; the labelled Observatory access-screen image is a raster screenshot of the isolated review interface.

Finalizer package-integrity, layout/heading-fit, Arial font policy, native-table requirements and first-party import checks passed with zero findings. All 29 rendered slides were inspected; revised slides were inspected again and unchanged renders compared byte-for-byte. These checks do not establish native PowerPoint behaviour on every recipient's computer.

Original export SHA-256 (before the branding update below):

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

## Branding update, 10 October 2026 — issue #137

Run `branding-20261010-137` renamed product copy to Delegate and made briefing audience headings neutral. Both decks were regenerated from the shared JSON with the existing exporter. Package integrity, heading fit, Arial font policy, native tables and first-party import checks passed with zero findings. All 29 rendered slides were inspected. Slide and speaker-note XML contains no obsolete product or audience branding.

Current download SHA-256:

- Concept: `0f76724e89ad6e56b43e31592077a55342a616798821d0bc71d9e1af288c21ad`
- Design review: `8a5ad7277659595e600843360274e3a268242f53fa21400ae38ab15a48b219a0`

`npm ci`, `npm run typecheck` and `npm run build -w apps/about` passed. The About build retains the existing multiple-lockfile workspace-root warning.

A fresh isolated PostgreSQL/One Login stack used database port 55437, simulator port 5499 and application ports 5470–5474. The following regression passed both files and all 32 tests, covering authorised, undelegated, revoked, expired, unknown delegate, missing relationship and activity events:

```sh
DATABASE_URL=postgresql://delegate:delegate@localhost:55437/delegate \
DELEGATE_URL=http://localhost:5470 HMRC_URL=http://localhost:5472 \
AGENT_TOKEN_SECRET=dev-only-agent-token-secret-change-me-0123456789 \
DEMO_AGENT_CLIENT_SECRET=dev-demo-agent-secret HMRC_SERVICE_KEY=dev-hmrc-service-key \
node_modules/.bin/vitest run tests/delegation.test.ts tests/hmrc.test.ts
```

These are synthetic development credentials. The shared demonstration databases and recorded raw evidence were not reset or rewritten.

The browser-driven rehearsal on the fresh isolated stack passed: sign-in, unchecked consent with two permissions selected, approval, tax-code read 200, claim submission 200, excluded employment action 403 `PERMISSION_MISSING`, account outcomes shown as “Done”, browser removal and subsequent tax-code refusal 403 `AUTHORISATION_REVOKED`. About home and both briefing levels showed updated branding; home at 1280 pixels and briefing pages at 320 pixels had no horizontal overflow. Both deck downloads returned HTTP 200 with bytes matching the validated exports. T3 preview snapshot capture failed repeatedly; DOM inspection and browser interactions worked, so no new website screenshot is claimed.


## Current-copy refresh — 10 October 2026, issue #140

This addendum leaves the original preparation/rehearsal record above unchanged. Observatory PRs #109 and #110 are merged. The current guide, website copy, Markdown briefing notes and PPTX speaker notes now reflect that status; original baseline, screenshot and research claims remain dated provenance.

Verification on the issue #140 branch: `npm run typecheck -w apps/about` and `npm run build -w apps/about` passed. `npx vitest run tests/public-briefing.test.ts` passed all 3 allowlist tests. `git diff --check` passed. The build retains the existing CSS/root-tracing warnings.

Both decks were regenerated with `scripts/briefings/build.mjs` using the bundled Artifact Tool runtime. Package integrity, layout/font checks and first-party reimport passed for 11 concept and 18 design slides. XML comparison against the prior decks confirmed unchanged visible text, geometry and embedded media after excluding generated creation/relationship identifiers; the edits are speaker-note status and source labels. The Observatory slide was rendered and inspected. Private validation receipts are in `/tmp/delegate-briefings-140`, outside Git.

Coordinated T3 browser review of the isolated public-mode production About server at localhost:6140 passed `/briefing`, `/briefing/demo`, `/briefing/high-level` and `/briefing/detailed` at 1280px and 320px without horizontal overflow or stale branding/status terms. Both deck downloads returned HTTP 200 with the PowerPoint MIME type; `/console` returned 404. This is presentation/boundary verification, not a new authority journey, live provider action or research run. No public deployment or database reset was performed for this refresh.
