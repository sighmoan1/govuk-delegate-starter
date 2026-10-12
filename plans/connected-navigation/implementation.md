# Connected Navigation Implementation

Branch: `codex/155-connected-navigation`
Revision: draft PR branch tip
Issue: #155
Draft PR: #156

## Scope

Implemented a Delegate-owned connected service menu for About, Delegate, HMRC and WhenIsBins. The menu uses the existing design tokens and is available through `@prototype/connected-navigation` with React and plain HTML renderers.

Public mode is limited to verified public destinations and excludes presenter controls, reset routes, Sam's phone, sign-in codes, protected Observatory routes and internal research tooling. One Login remains an authentication destination reached from service journeys rather than a normal menu item.

## Changed Apps

- About: shared menu in the notes/briefing header plus public briefing asset allowlist.
- Delegate: shared menu in the GOV.UK account and consent shell.
- HMRC: shared menu in the public service shell.
- WhenIsBins: shared menu and versioned assets on public/demo/evidence pages.

## Verification

- `npx vitest run tests/connected-navigation.test.ts tests/public-briefing.test.ts` passed.
- `npm test -w apps/whenisbins -- assets` passed.
- `npm run typecheck -w apps/whenisbins` passed.
- `npm run build -w apps/about` passed.
- `npm run build -w apps/delegate` passed.
- `npm run build -w apps/hmrc` passed.
- Isolated acceptance stack on ports 4300/4302 with temporary Postgres databases: `npx vitest run tests/delegation.test.ts tests/hmrc.test.ts` passed, 32 tests.

## Limitations

No deployment was performed. Independent review, one repair round if requested, merge and any in-place deployment remain downstream of PR #156.
