# Working with several agents

Use GitHub issues and focused pull requests as the shared work queue. Private agent context is not project status. The repository's [AGENTS.md](../AGENTS.md) defines the claim, checkpoint and verification requirements.

## Current cleanup work

The owner authorised parallel cleanup on 10 October 2026. The starting source and deployed public stack were main `7979c85` (branding PR #138). Each implementation has its own issue, branch and worktree.

| Issue | Scope | File ownership | Dependency |
|---|---|---|---|
| [#139](https://github.com/sighmoan1/govuk-delegate-starter/issues/139) | Coordinate and verify the cleanup; retire the completed branding fixture runtime | This index; bounded operator actions | Integrate and review #140–142 |
| [#140](https://github.com/sighmoan1/govuk-delegate-starter/issues/140) | One current demo guide, accurate visitor entry points and briefing status | README, About, briefing source/decks, demo and repository-status documentation | Link the CI and runtime guides after their paths are agreed |
| [#141](https://github.com/sighmoan1/govuk-delegate-starter/issues/141) | Cheap automatic verification; explicit manual expensive suites | GitHub workflows, CI scripts, `docs/CI.md` | No billing change; no paid usage authorisation |
| [#142](https://github.com/sighmoan1/govuk-delegate-starter/issues/142) | Canonical visitor runtime and explicit isolated-stack ownership | `docs/LOCAL_RUNTIME.md`; narrowly scoped runtime tooling if needed | Retain research data and confirm owners before stopping old stacks |

Live status, acceptance evidence and remaining work belong on these issues and their linked PRs. This table defines scope; it is not a substitute for the live queue.

## Claim and isolate

Before editing, read the required briefs and current-state documents, check recent issue comments and open PRs, and post a unique run ID, issue, branch, likely files, status and overlaps. A claim that cannot be written to GitHub is blocked; do not begin overlapping implementation.

Use a separate worktree for each issue, based on current main. Keep build output, generated clients, dependencies and local environment files within that worktree. Do not switch another agent's branch or share `.next` output between simultaneous builds. Open a draft PR at the first meaningful checkpoint and link it to the T3 thread.

Agree shared-file changes before editing. Send the coordinator the PR URL, exact head, changed files, actual check results and any unmet acceptance. The coordinator reviews the final source, sequences merges and checks the combined result. A merged source change does not automatically update a running image.

## Reserve runtime resources

Record the owning run, checkout, Compose project, application ports and database ports in the issue before starting an isolated stack. Check that ports are free. Use its own database and explicit environment configuration; the main public/demo databases are not test fixtures.

Only the recorded owner or an explicit handoff may stop a shared test runtime. Preserve volumes, receipts and evidence by default. A process or container being old does not prove it is unused. Never use broad Docker cleanup commands to tidy this project: the machine hosts unrelated projects too.

The completed `delegate-branding-137` fixture services were stopped for #139, with their database volume retained. Other historical validation/research stacks require an ownership check before retirement. They are not additional visitor destinations.

## Verification and release

Run checks appropriate to the change and publish exact commands/results. The core acceptance is request → consent → scoped authority → service action → outcome → revocation → refusal, through API and browser-agent journeys. Automated acceptance covers authorised success, undelegated/revoked/expired/unknown/missing-relationship refusal and activity events. A clean local demo walkthrough supplies separate manual evidence.

Do not call a missing, skipped or billing-blocked Actions run a pass. The owner has authorised **$0 additional monthly Actions spending**; account billing access was unavailable at the cleanup start, so that preference is not evidence of a configured GitHub spending limit. Do not enable paid usage, change the account plan, enrol a vendor or provision paid infrastructure under this cleanup.

Before a non-resetting public update, record the source, back up private configuration and data, and verify retained records and credentials afterwards. Keep public briefings separate from private presenter and research tools. Leave issues open until their focused PRs merge; proposed research or policy decisions still need their named owner.

## Work that remains gated

This cleanup does not release [upstream WhenIsBins issues #120–122](https://github.com/sighmoan1/govuk-delegate-starter/issues/120), [parked live cancellation #132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132), human-participant recruitment, real vendor acceptance or deferred national decisions. Do not assign an agent to bypass their release conditions. Keep immutable raw evidence and the preserved original DWP/Example AI briefs.
