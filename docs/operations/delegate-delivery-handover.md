# Delegate Delivery Handover

Snapshot time: 2026-10-12T21:55Z.

This is the controlled handover record for a direct Codex receiver working in
`sighmoan1/govuk-delegate-starter`. A fresh receiver should start from this
document and GitHub issue #158; it should not reconstruct Gas City or Mayor
context to decide ownership.

## Authority

- Receiver ACK issue: <https://github.com/sighmoan1/govuk-delegate-starter/issues/158>
- Handover branch: `docs/delegate-delivery-handover-20261012`
- Handover worktree used to prepare this document:
  `/Users/apple/.codex/worktrees/delegate-handover-20261012/govuk-delegate-starter`
- Repository default branch at snapshot:
  `8ca2258e936fdba911c6708823acbbaf5d713b5b`
- Transfer is not complete until a receiving Codex or owner posts an explicit
  ownership ACK on issue #158 after inspecting access and the linked work.

The intended receiver is direct Codex on this GitHub repository. This is not a
request to restart Gas City orchestration, resume Delegate rig workers, dispatch
new work, merge PRs, deploy, reset data, or alter shared Bathos/Cultivate or
infrastructure state.

## What Is Being Handed Over

The active implementation checkpoint is connected navigation:

- GitHub issue: <https://github.com/sighmoan1/govuk-delegate-starter/issues/155>
- Draft PR: <https://github.com/sighmoan1/govuk-delegate-starter/pull/156>
- PR branch: `codex/155-connected-navigation`
- PR head: `2cf1846f4feaffe2b3983265f027e33759d95882`
- Current PR state at snapshot: open draft, no GitHub checks reported,
  `mergeable: CONFLICTING`

PR #156 added a Delegate-owned `@prototype/connected-navigation` package and
wired an accessible service menu into About, Delegate, HMRC and permitted
WhenIsBins public surfaces. It intentionally excludes presenter controls, reset
flows, synthetic sign-in details, protected Observatory routes and internal
research tooling from public navigation.

PR #157 landed after PR #156:

- <https://github.com/sighmoan1/govuk-delegate-starter/pull/157>
- Merged head: `f945b0d837f0f5f0e06cd1181718d58710a40fda`
- Resulting `main`: `8ca2258e936fdba911c6708823acbbaf5d713b5b`
- Scope: Delegate-local Bathos design-system settings.

Because PR #157 changed the base branch after PR #156, PR #156 is now
conflicting and must be rebased or repaired before review/merge can proceed.

## Receiver ACK Checklist

The receiver must post a comment on issue #158 confirming all of the following:

- Repository, issue #158, issue #155, PR #156, branch
  `codex/155-connected-navigation` and this document are accessible.
- PR #156 is understood to be a draft and not merge-ready because it is
  conflicting and unreviewed.
- The next owner/action is identified: conflict repair, independent review,
  merge/deploy decision, or explicit parking.
- Shared Bathos, Cultivate, infrastructure, live runtime, research databases,
  credentials and public tunnels remain outside this handover unless a separate
  explicit owner accepts them.

Do not count this handover document, a Gas City note, or the human clarification
that requested it as receiver ACK.

## GitHub Backlog

The authoritative backlog is GitHub issues and PRs. No extra executable dispatch
is created by this handover.

| Item | State | Owner/action |
| --- | --- | --- |
| #158 handover ACK | Open | Receiver must inspect and ACK before transfer completion. |
| #156 connected navigation PR | Open draft, conflicting | Repair/review decision required. No checks reported. |
| #155 connected navigation issue | Open | Tracks #156 implementation and remains the feature issue. |
| #149 AGENTS.md coordination | Open | Separate documentation/coordination issue. |
| #132 native reminder cancellation | Open/parked | Real cancellation remains unverified and parked. |
| #120-#122 Tom-dependent WhenIsBins items | Open/on hold | External discussion required before action. |
| #90 delivery evidence umbrella | Open | Broader research/vendor milestones remain outside this handover. |
| #64, #68-#78 Observatory/research issues | Open as listed in GitHub | Research backlog; no human/vendor result is implied here. |
| #48-#59 decision backlog | Open/deferred | National policy/identity/legal decisions remain deferred. |

Closed issues and merged PRs remain provenance, not new work. Do not close or
delete duplicate-looking records silently; reconcile by comments or explicit
maintainer decision.

## Gas City Bead Mapping

These IDs are recorded only for traceability. The receiver should not need Gas
City access to continue.

| Bead | Status at handover | GitHub mapping / meaning |
| --- | --- | --- |
| `gds-ocp` | Closed pass | Source anchor for connected navigation; maps to issue #155 and PR #156. |
| `gds-bsu` | Closed pass | Implementation worker checkpoint; records branch `codex/155-connected-navigation`, commit `2cf1846f4feaffe2b3983265f027e33759d95882`, PR #156 and issue #155. |
| `gds-47z` | Closed fail | Earlier wrapper workflow recorded failed publish/summarize path; do not use as merge readiness. |
| `gds-eic` | Closed pass with caveat | `do-work` child recorded a misrouted workflow latch; no source work was performed by that latch. |
| `gds-hz7` | Closed fail/quarantined | Control gate failed because `.gc/scripts/checks/build-artifact-valid.sh` was missing in the repo root. |
| `gds-54w` | Open, `hold:mayor` | City-held independent review placeholder for PR #156; direct Codex handover uses issue #158 instead. |

At the snapshot, the only non-closed Delegate rig bead observed was `gds-54w`.
The Delegate rig had no active implementation workers to preserve; do not resume
or spawn rig workers from this handover.

## Completed

- Bathos foundation adoption was merged earlier in PR #153.
- Delegate-local design-system settings were merged in PR #157.
- Connected navigation implementation checkpoint exists on PR #156 at commit
  `2cf1846f4feaffe2b3983265f027e33759d95882`.
- Implementation report exists on the PR branch at
  `plans/connected-navigation/implementation.md`.
- Workflow summary artifact was observed locally at
  `/Users/apple/govuk-delegate-starter/plans/connected-navigation/workflow-summary.md`.
- GitHub issue #155 records implementation checkpoints from the worker.

## In Progress Or Pending

- PR #156 needs conflict repair against current `main`.
- PR #156 needs independent review after repair.
- Merge and deployment are not authorized by this handover.
- Issue #158 needs explicit receiver ACK.
- Any final acceptance must be linked back to #158.

## Blocked Or Known Failures

- PR #156 is currently conflicting.
- PR #156 has no GitHub checks reported.
- Earlier direct publish wrapper `gds-47z` failed closed because its summary was
  not successful at publish preflight.
- Control gate `gds-hz7` failed because the expected repo-local
  `.gc/scripts/checks/build-artifact-valid.sh` was absent; the worker instead
  validated with the pack script path recorded on issue #155.
- A first relationship-suite attempt against shared localhost ports 3300/3302
  failed because those ports were occupied by the shared public-mode demo stack
  with rotated secrets. The worker reran with isolated temporary databases and
  short-lived app servers on 4300/4302, then stopped and dropped them.

## Verification Evidence

From PR #156 and issue #155:

- `npx vitest run tests/connected-navigation.test.ts tests/public-briefing.test.ts`
  passed.
- `npm test -w apps/whenisbins -- assets` passed.
- `npm run typecheck -w apps/whenisbins` passed.
- `npm run build -w apps/about` passed.
- `npm run build -w apps/delegate` passed.
- `npm run build -w apps/hmrc` passed.
- Isolated acceptance run for `tests/delegation.test.ts` and `tests/hmrc.test.ts`
  passed with 32 tests on temporary services/databases.
- Pack-level build artifact validation passed for `gds-bsu`.

These results support the implementation checkpoint only. They do not prove the
current conflicting PR is ready to merge.

## Data, Runtime And Secret Safety

- Do not reset the shared public demo stack.
- Do not run `docker compose down -v`, global Docker prune, blanket process
  kills, worktree deletion, database removal, or credential rotation from this
  handover.
- Preserve existing root dirtiness, generated directories, worktrees, DBs,
  volumes, credentials, deployed URLs, raw evidence and research records.
- Use isolated worktrees, isolated databases and explicit ports for any repair
  or validation work.
- Do not copy secrets into comments or docs. Existing docs may describe local
  development variable names and commands; keep actual credentials out of
  GitHub text.

Shared Bathos dependencies and any Cultivate/shared infrastructure ownership
remain with their existing Gas City owners unless a separate explicit handover
accepts them.

## Resume Instructions For A Fresh Codex Receiver

1. Open issue #158 and post no ACK until after inspection.
2. Read this file on the handover PR/branch.
3. Inspect PR #156, issue #155 and current `main`.
4. Confirm PR #156 conflict status locally or through GitHub.
5. Decide one next action: repair PR #156, request independent review, park it,
   or ask the owner for a merge/deploy decision.
6. Post the explicit ACK or blocker on issue #158.

Useful starting commands:

```sh
gh issue view 158 --repo sighmoan1/govuk-delegate-starter
gh pr view 156 --repo sighmoan1/govuk-delegate-starter
git fetch origin
git worktree add /tmp/delegate-pr156 origin/codex/155-connected-navigation
```

Do not rely on Gas City or Mayor state for delivery decisions after this point.
