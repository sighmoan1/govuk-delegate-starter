# Shared Bathos foundation

Delegate pins `@bathos/design-system` **1.0.1** to its exact GitHub release archive in the root package and lockfile. The [canonical catalogue](https://design.bathos.org) explains the shared system; it is not a runtime dependency. Installed release bytes are bundled locally. There is no remote stylesheet or floating `latest` dependency.

## Service ownership

`styles/service-css.mjs` combines the namespaced `--bathos-*` foundation with the unchanged supplied `styles/design.css` and the small `bathos-prototype.css` spacing adapter. Delegate, HMRC, About and Observatory generate their local public stylesheet before development/build. The WhenIsBins connector serves the same assembled bytes, with a content-derived URL and immutable caching only for an exact matching version.

One Login bundles the foundation and `bathos-onelogin.css` separately. Its existing stylesheet continues to own GOV.UK colours, Arial typography, controls and focus treatment. Its adapter retains the same header gap and vertical spacing. The independent council is an API-only service with no visual shell, so it has no stylesheet dependency.

Adapters currently map equivalent spacing values only: shell gutters, main spacing, form-group spacing and footer gaps. Existing palettes, fonts, focus, form/button rules and consent behaviour stay service-owned. Screen-only shell overrides preserve the supplied print layout. Docker workspace installs explicitly include the root dependency; One Login also copies the shared styles into its build context.

## Verification and updates

Run `npm run test:styles`, all workspace types/builds, and `npm test -w apps/whenisbins`. The ordinary full isolated regression must also pass before adoption. `e2e/design-foundation.spec.ts` compares actual rendered service styles and keyboard focus against the original stylesheet at 1280px and 320px, and checks that each visual app receives the foundation. It uses `OBSERVATORY_URL` alongside the other explicit fixture URLs. Rehearse the clean consent → selected scope → action/outcome → excluded-action refusal → revocation → refusal journey; retain its evidence with the PR.

`node scripts/design-system-update.mjs --check` reads the latest stable release without changing files. The **Prepare shared design-system update** workflow is manual to follow [the included-only CI policy](CI.md). Configure `DESIGN_SYSTEM_UPDATE_TOKEN` with repository contents/pull-request write access before dispatch. A dedicated token allows downstream PR checks to run; no paid runner allowance or account plan is configured by this workflow.

The updater accepts only newer releases within the pinned major version and requires the exact official archive asset. It installs and verifies the candidate before creating or refreshing one draft PR on `codex/bathos-foundation-update`. The draft still needs full isolated API/browser/manual acceptance and review. There is no automatic merge or deployment. Major versions require a separate migration decision.

After review and merge, the designated operator backs up retained private configuration/databases and runs the existing non-resetting [public update](briefings/PUBLIC_DEPLOYMENT.md). Never use fresh-install/reset commands to upgrade the demo. Roll back by reverting the dependency/adapter PR, rebuilding and verifying the retained runtime; preserve records and credentials throughout.
