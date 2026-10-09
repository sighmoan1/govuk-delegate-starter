# Coding-agent brief — GOV.UK Delegate

Read these files before writing code:

1. `README.md`
2. `docs/PRODUCT_CASE.md`
3. `docs/BUILD_SPEC.md`
4. `docs/PROTOTYPE_CONTENT.md`
5. `docs/DECISIONS.md`
6. `styles/design.css`

## Your task

Maintain and extend the current four-app synthetic HMRC prototype. Read `docs/CURRENT_BEHAVIOUR.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md` and `docs/DECISION_BACKLOG.md` alongside the code. BUILD_SPEC and PROTOTYPE_CONTENT are preserved original briefs, not an instruction to rebuild DWP or Example AI. Keep each requested engineering issue in a focused PR against the resulting main.

Verify request → consent → scoped authority → service action → outcome → revocation → refusal, preserving both API and browser-agent journeys. The service owns domain validation, idempotency, technical throughput and durable queue processing; Delegate owns consent and authority.

## Work tracking — required

Make your work visible in GitHub before editing files. An agent's private working context is not a project status.

1. **Claim one issue before coding.** Find the existing issue that describes the work. Comment on it with:
   - a unique agent or run ID (a GitHub username alone is not enough when several agents share an account);
   - the issue number and concise scope;
   - the branch name;
   - likely files or components you expect to change;
   - current status (`claimed`, `in progress`, or `blocked`);
   - related active issues or possible overlap.
   
   Check recent issue comments and open pull requests for overlapping work before proceeding. If the work has no issue, create one before editing. If you cannot write the claim to GitHub, report that as blocked and do not start overlapping implementation work.

2. **Use one branch and focused PR per issue.** Name the branch so it includes the issue number. Open a draft pull request as soon as there is a meaningful first checkpoint; link the issue and summarize the scope. Keep the PR focused on that issue.

3. **Post checkpoints.** Update the issue or linked PR when the work materially changes status: when implementation starts, when blocked or paused, when the draft is ready for review, and when complete. Include what changed, what remains, blockers or dependencies, tests run and the next step. For long-running work, post a concise progress update at least once per working session.

4. **Coordinate shared files.** If another active claim or PR touches the same files or behavior, agree how to split or sequence the work before editing those areas. Update the issue/PR if the scope changes. Do not silently take over another agent's claim.

5. **Close issues accurately.**
   - For code work, do not close the issue while its PR is still open or awaiting review. Put `Closes #<issue-number>` in the PR description; GitHub will close the issue when that PR is merged. Before requesting review, report the acceptance criteria met and the actual test commands/results. If the issue is complete but the PR is not merged, mark it ready for review and leave it open.
   - For a non-code issue with no PR, close it only after its stated acceptance criteria are met. Post a completion comment summarizing the outcome and evidence, then close it.
   - If a decision, approval or acceptance test still needs a human owner, leave the issue open, state exactly what is needed, and request that owner's review or closure. Do not present a proposed decision as approved.
   - If work is abandoned or handed off, post the current state and remaining work, then release the claim so another agent can take it.

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

The current fixtures seed:

- Sam Taylor;
- Personal assistant;
- mock HMRC;
- eight capabilities;
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
