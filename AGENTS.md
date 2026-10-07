# Coding-agent brief — GOV.UK Delegate

Read these files before writing code:

1. `README.md`
2. `docs/PRODUCT_CASE.md`
3. `docs/BUILD_SPEC.md`
4. `docs/PROTOTYPE_CONTENT.md`
5. `docs/DECISIONS.md`
6. `styles/design.css`

## Your task

Build the working MVP described in `docs/BUILD_SPEC.md`.

This is not a mock-up task. Prioritise the complete working flow:

```text
agent creates authorisation request
        ↓
principal authenticates through One Login simulator
        ↓
principal approves selected capabilities
        ↓
active relationship is persisted
        ↓
agent authenticates separately
        ↓
agent attempts mock DWP transaction
        ↓
mock DWP checks Delegate relationship
        ↓
ALLOW / DENY
        ↓
principal revokes authority
        ↓
previously allowed transaction becomes DENY
        ↓
all attempts appear in activity view
```

## Architectural rule

**Copy HMRC's relationship-based agent-authorisation pattern before inventing new protocol machinery.**

For the MVP, prefer central relationship checking / introspection over building portable delegation credentials.

Do not introduce a JWT delegation format merely because it is convenient unless the end-to-end relationship flow already works and there is a concrete need.

## Product rule

The prototype should explain itself to a non-technical visitor.

Implement an `About this project` page using the supplied copy in `docs/PROTOTYPE_CONTENT.md`.

The central claim is:

> Make legitimate automation easier than illegitimate automation.

Explain that:

- AI-written text is not reliably detectable;
- legitimate agents should have an incentive to identify themselves;
- explicit delegation makes declared agent activity measurable;
- unknown activity still requires abuse controls;
- accessibility barriers must not push legitimate people into the untrusted route.

## Design rule

Use `styles/design.css` as the initial design system.

Do not replace it with Tailwind defaults or another component library.

Preserve its typography, colour variables, focus treatment, button/form behaviour, responsive reflow and accessible interaction patterns.

You may add small Delegate-specific classes in a separate stylesheet, but do not rewrite the supplied CSS unless necessary to fix an actual defect.

## Build choices

Default to:

- TypeScript
- Next.js
- PostgreSQL
- Prisma or Drizzle
- Docker Compose
- GOV.UK One Login simulator
- Vitest
- Playwright

If the existing repo already uses equivalent tools, preserve the existing stack rather than gratuitously migrating it.

## Synthetic data only

Do not connect to production GOV.UK One Login, Universal Credit or real claimant data.

Seed:

- one principal;
- Demo Personal Agent;
- DWP Benefits Demo;
- five capabilities;
- enough activity data to make the monitoring page useful before the first demo transaction.

## Test before completion

Do not declare the project complete until you have run automated tests for:

- authorised action succeeds;
- undelegated action fails;
- revoked authority fails;
- expired authority fails;
- unknown delegate fails;
- missing relationship fails;
- every attempt generates an activity event.

Also manually verify that the three-minute demo flow works from a clean local start.
