# Delegate Delivery Handover

Snapshot time: 2026-10-12T21:59:53Z.

This is the controlled handover record for a direct Codex receiver working in
`sighmoan1/govuk-delegate-starter`. A fresh receiver should start from this
document and GitHub issue #158; it should not reconstruct Gas City or Mayor
context to decide ownership.

Transfer is **not complete**. It remains blocked until:

1. this handover PR receives independent acceptance on the repaired revision;
2. a receiving Codex or repository owner inspects access and posts an explicit
   ownership ACK on issue #158;
3. the owner decides the next action for PR #156: repair, review, merge/deploy
   decision, or parking.

The human note naming Codex as the intended receiver is not an ACK. This file,
the handover PR, and Gas City notes are not an ACK.

## Authority And Revision Pins

- Receiver ACK issue: <https://github.com/sighmoan1/govuk-delegate-starter/issues/158>
- Handover PR: <https://github.com/sighmoan1/govuk-delegate-starter/pull/159>
- Handover branch: `docs/delegate-delivery-handover-20261012`
- Handover document path: `docs/operations/delegate-delivery-handover.md`
- Handover worktree used to prepare this document:
  `/Users/apple/.codex/worktrees/delegate-handover-20261012/govuk-delegate-starter`
- Repository default branch at snapshot:
  `8ca2258e936fdba911c6708823acbbaf5d713b5b`

Revision correction:

- The original handover document commit is
  `00b7cbd0f6f92766fd5b3eacfde49f6feac05bb5`.
- The pre-repair PR #159 head was
  `49ed794ce01c608e15176a538fc8ac840f79e4bf`.
- The earlier issue #158 comment that named
  `00b7cbd9c5c87f5a92d2b70c4e6fe30f3a3b5c55` is wrong and must be ignored.
- The second issue #158 correction used the right `00b7...` document commit but
  mislabeled it as the PR head. It is not the PR head.
- The repaired PR head after this pass is recorded on issue #158 and PR #159.
  Treat that current GitHub head as the authoritative repaired revision.

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
  `codex/155-connected-navigation`, PR #159 and this document are accessible.
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
is created by this handover. Do not close or delete duplicate-looking records
silently; reconcile by comments or explicit maintainer decision.

| Item | State | Owner/action |
| --- | --- | --- |
| #158 handover ACK | Open | Receiver must inspect and ACK before transfer completion. |
| #159 handover PR | Open | Docs-only handover and this repair. Independent acceptance required. |
| #156 connected navigation PR | Open draft, conflicting | Repair/review decision required. No checks reported. |
| #155 connected navigation issue | Open | Tracks #156 implementation and remains the feature issue. |
| #149 AGENTS.md coordination | Open | Separate documentation/coordination issue. |
| #132 native reminder cancellation | Open/parked | Real cancellation remains unverified and parked. |
| #120, #121, #122 Tom-dependent WhenIsBins items | Open/on hold | External discussion required before action. |
| #90 delivery evidence umbrella | Open | Broader research/vendor milestones remain outside this handover. |
| #34 grouped consent and mandate templates | Open | Agent-ready follow-up. Not covered by PR #156. |
| #35 pairwise One Login subjects | Open | Agent-ready follow-up. Not covered by PR #156. |
| #43 HMRC-owned representative authority spike | Open | Agent-ready follow-up. Not covered by PR #156. |
| #47 incremental Delegate benefit experiment | Open | Evidence follow-up. Not covered by PR #156. |
| #48-#59 decision backlog | Open/deferred | National policy, identity, legal and ownership decisions remain deferred. |
| #64 Observatory epic | Open | Research backlog. |
| #68, #69, #71, #73, #74, #75, #77, #78 Observatory issues | Open | Exact open Observatory items. #70, #72 and #76 are closed and must not be implied open. |

Open PRs at snapshot: #156 and #159 only.

## Gas City Bead Mapping

These IDs are recorded only for traceability. The receiver should not need Gas
City access to continue.

| Bead | Status at handover | GitHub mapping / meaning |
| --- | --- | --- |
| `gds-ocp` | Closed pass | Source anchor for connected navigation; maps to issue #155 and PR #156. Close reason verifies commit `2cf1846f4feaffe2b3983265f027e33759d95882` and local workflow summary path. |
| `gds-bsu` | Closed pass | Implementation worker checkpoint; records branch `codex/155-connected-navigation`, commit `2cf1846f4feaffe2b3983265f027e33759d95882`, PR #156 and issue #155. |
| `gds-47z` | Closed fail | Earlier wrapper workflow failed publish/summarize preflight with `gc.build.publish_reason=summary_not_successful`; do not use as merge readiness. |
| `gds-eic` | Closed with conflicting stored facts | Metadata contains `gc.outcome: pass`, but also `gc.failure_class: misrouted_workflow_latch` and `gc.failure_reason: implementation worker received gc.kind=workflow latch; no source work performed`. Close reason says no source work was performed. Do not relabel this as a clean pass; reconciliation remains open under `mc-ai6`. |
| `gds-hz7` | Closed fail/quarantined | Control gate failed because `.gc/scripts/checks/build-artifact-valid.sh` was missing in the repo root. |
| `gds-54w` | Open, `hold:mayor` | Independent review and deployment-block placeholder for PR #156. Resource HOLD under human `mc-wisp-fzdbgi` until usage/task attribution and concurrency-safe existing slot availability are assessed. Do not dispatch/spawn while held. Material safety findings block deployment. This is not superseded by #158 acceptance. |
| `mc-ai6` | Blocked | Native-loop/autonomy evidence task that must investigate `gds-eic` contradictory stored pass/failure and ownership drift without overwriting history. |
| `mc-bze` | Open epic | Shared Bathos design-system and automatic updates ownership stays with Gas City, not this receiver handover. |
| `bt-r5w` | Open Bathos task | Bathos consumer migration depends on `mc-bze.2`; ownership stays with the Bathos/Gas City lane. |

At the snapshot, the Delegate rig was suspended. A bounded native status probe at
2026-10-12T21:59:53Z returned partial status: suspended yes, no agents listed,
and `govuk-delegate-starter/core.control-dispatcher` unknown because the runtime
liveness probe timed out. Therefore absence of active Delegate sessions is
unknown from this probe. Do not retry-loop, resume the rig or spawn workers from
this handover.

## Root Checkout And Local-Only State

The repository root `/Users/apple/govuk-delegate-starter` is not clean and must
be preserved:

- Branch: `main`
- Local HEAD: `c334fecaf6d561965162d86402a97d243a9676f6`
- Relation to `origin/main`: ahead 1, behind 4
- Modified tracked files: `.beads/config.yaml`, `.gitignore`
- Untracked directories: `.agents/`, `.claude/`, `.codex/`, `.gc/`,
  `.gemini/`, `plans/`, `worktrees/`

Do not run `git reset`, `git clean`, blanket pulls/rebases, worktree deletion or
generated-directory cleanup in the root. Do not push `c334fec...` from this
handover. The repository owner must decide whether that local-only commit and
root dirtiness should be preserved, pushed, separated, or retired.

The implementation workflow summary is currently local and untracked at:

`/Users/apple/govuk-delegate-starter/plans/connected-navigation/workflow-summary.md`

Safe evidence copied from that file into this handover, without secret-bearing
command lines or environment values:

- Schema: `gc.build.implementation-summary.v1`
- Workflow: `gds-eic`, formula `do-work`
- Status: `approved`
- Source bead: `gds-ocp`
- Implementation branch/commit: `codex/155-connected-navigation` at
  `2cf1846f4feaffe2b3983265f027e33759d95882`
- PR/issue: #156 / #155
- Coverage rows: REQ-001 through REQ-006 covered, REQ-007 deferred
- Recorded checks: connected-navigation/public-briefing vitest passed,
  WhenIsBins assets passed, WhenIsBins typecheck passed, About/Delegate/HMRC
  builds passed, isolated delegation/HMRC acceptance passed with 32 tests,
  build artifact validation passed via the pack script path.

Preserve the local `plans/` tree and this workflow summary unless the owner
explicitly decides how to version or archive it.

## Worktrees And Branch Ownership

`git worktree list --porcelain` showed 24 unique worktrees at the snapshot.
The "main delta" column is `origin/main...HEAD` as behind/ahead counts. A merged
PR may still show ahead commits because GitHub merged or squashed a different
commit; use the PR/issue owner column before deleting or rewriting anything.

| Worktree | Branch or state | Head | Main delta | Working tree | Owner/status |
| --- | --- | --- | --- | --- | --- |
| `/Users/apple/govuk-delegate-starter` | `main` | `c334fecaf6d561965162d86402a97d243a9676f6` | 4 behind / 1 ahead | dirty, 9 entries | Local-only root state; owner decision required. |
| `/private/tmp/delegate-151` | `codex/151-shared-bathos-foundation` | `4fb9be206b55e3a6b875084c310b3e43e3ef5684` | 3 behind / 2 ahead | clean | Issue #151 closed, PR #153 merged. |
| `/private/tmp/delegate-152` | `codex/152-demo-restoration` | `90c5910eb038f545382153e9f58530c8a8ecf120` | 3 behind / 0 ahead | clean | Issue #152 closed. |
| `/private/tmp/delegate-deploy-153` | detached | `62c31931e93dc21b1f90086612b0bcfcbfeaba8b` | 2 behind / 0 ahead | clean | PR #153 merged checkpoint. |
| `/Users/apple/.codex/worktrees/css-edge-135/govuk-delegate-starter` | `codex/issue-135-css-content-version` | `e871cdf4ea8a649e95036dda509f41b06faf9a84` | 20 behind / 0 ahead | clean | Issue #135 closed, PR #136 merged. |
| `/Users/apple/.codex/worktrees/delegate-cleanup-140` | `codex/issue-140-demo-guide` | `e7f3be8faf8a9ebb498941e65a82fd5cf48e98bf` | 15 behind / 0 ahead | clean | Issue #140 closed, PR #143 merged. |
| `/Users/apple/.codex/worktrees/delegate-cleanup-141` | `codex/issue-141-lean-ci` | `a7214536dd4f3bf0fa52207fe5dfdbe9d985c6e2` | 16 behind / 0 ahead | clean | Issue #141 closed, PR #145 merged. |
| `/Users/apple/.codex/worktrees/delegate-cleanup-142` | `codex/issue-142-runtime-map` | `c8803fee040201d44288e2eb2c20365605600506` | 16 behind / 0 ahead | clean | Issue #142 closed, PR #146 merged. |
| `/Users/apple/.codex/worktrees/delegate-handover-20261012/govuk-delegate-starter` | `docs/delegate-delivery-handover-20261012` | `49ed794ce01c608e15176a538fc8ac840f79e4bf` before this repair | 0 behind / 2 ahead before this repair | clean before this edit | PR #159 handover docs. |
| `/Users/apple/.codex/worktrees/design-130/govuk-delegate-starter` | `codex/issue-130-design-font-face` | `1a32e81c0ef2f92fff5e4886073616e86d6f41d8` | 97 behind / 0 ahead | clean | Issue #130 closed, PR #131 merged. |
| `/Users/apple/.codex/worktrees/docs-128/govuk-delegate-starter` | `codex/issue-128-current-docs` | `8cc6266ef480222c1f0b27c391ff1e50e2e0dc8f` | 99 behind / 0 ahead | clean | Issue #128 closed, PR #129 merged. |
| `/Users/apple/.codex/worktrees/final-delivery-20261010/govuk-delegate-starter` | `codex/issue-90-final-20261010` | `859edcd267fb37ed4e9439f6544d71b39205fa54` | 107 behind / 7 ahead | clean | Issue #90 open delivery evidence lane. |
| `/Users/apple/.codex/worktrees/issue-72-contract/govuk-delegate-starter` | `codex/issue-72-observatory-contract` | `66122c2ef2aa5b7fe1163f1ee244c97db29e302c` | 133 behind / 0 ahead | untracked `ci-artifacts/` | Issue #72 closed, PR #109 merged; preserve until owner checks dirty state. |
| `/Users/apple/.codex/worktrees/issue-76-dashboard/govuk-delegate-starter` | `codex/issue-76-observatory-dashboard` | `94669b502db00693785ae25a800bc6922d8da486` | 135 behind / 0 ahead | untracked `ci-artifacts/` | Issue #76 closed, PR #110 merged; preserve until owner checks dirty state. |
| `/Users/apple/.codex/worktrees/observatory-coordination/govuk-delegate-starter` | `codex/issue-90-observatory-verification` | `23ba7e655eaeccd34839129e60d4efc649d28b67` | 137 behind / 6 ahead | clean | Issue #90 open research/evidence lane. |
| `/Users/apple/.codex/worktrees/pilot-133/govuk-delegate-starter` | `codex/issue-133-pilot-handoff` | `1130c68dee98d3b0634c52a97c9a427d98191d07` | 95 behind / 0 ahead | clean | Issue #133 closed, PR #134 merged. |
| `/Users/apple/.codex/worktrees/public-digital-briefings/govuk-delegate-starter` | `codex/issue-113-public-briefing-deploy` | `78f545167fa9e7e98b1f2d8164b1df2faba1d62a` | 136 behind / 5 ahead | clean | Issue #113 closed, PR #114 merged and deployed briefing. |
| `/Users/apple/.codex/worktrees/whenisbins-115/govuk-delegate-starter` | `codex/issue-115-whenisbins-connector` | `eb63b7b677b4cff71d410371177a8d2e290bbb98` | 129 behind / 0 ahead | clean | Issue #115 closed, PR #126 merged. |
| `/Users/apple/.codex/worktrees/whenisbins-119/govuk-delegate-starter` | `codex/issue-119-whenisbins-demo` | `984fb38d8a5de04f9fe37365c3dde7b80c32a57c` | 25 behind / 0 ahead | clean | Issue #119 closed, PR #127 merged. |
| `/Users/apple/.codex/worktrees/whenisbins-email-116/govuk-delegate-starter` | `codex/issue-116-whenisbins-email` | `2e3146e4adf0c2d349569571a6e4ec72748eb577` | 82 behind / 0 ahead | clean | Issue #116 closed, PR #123 merged. |
| `/Users/apple/.codex/worktrees/whenisbins-observatory/govuk-delegate-starter` | `codex/issue-118-whenisbins-observatory` | `bc62bbe5299157faec2bf13ebdde960f5ff6f13c` | 126 behind / 0 ahead | clean | Issue #118 closed, PR #125 merged. |
| `/Users/apple/.codex/worktrees/whenisbins-runner/govuk-delegate-starter` | `codex/issue-117-whenisbins-runner` | `c4a269391c3d67d2e926cfe8587df8556e4fa7c8` | 121 behind / 0 ahead | clean | Issue #117 closed, PR #124 merged. |
| `/Users/apple/govuk-delegate-docs` | `docs/repo-status-refresh` | `2882efc955403d5b84fc3a97b8a9ce516b629ef9` | 224 behind / 0 ahead | clean | Separate docs/status branch; no open PR found in this inventory. |
| `/Users/apple/govuk-delegate-starter/worktrees/gds-ocp` | `codex/155-connected-navigation` | `2cf1846f4feaffe2b3983265f027e33759d95882` | 4 behind / 2 ahead | clean | Issue #155 / PR #156 open draft, conflicting. |

No worktree should be deleted, reset or cleaned from this handover. Branch
cleanup, pushing, archiving or deployment decisions belong to the repository
owner or the named issue/PR owner.

## Runtime, Deployed URLs And Access Boundaries

No deploy, merge, restart, reset or runtime change was performed by this
handover. GitHub Deployments API returned no deployment records for this repo at
the snapshot.

Documented public/demo URLs from `docs/LOCAL_RUNTIME.md` and live acceptance
docs are:

| Address | Audience and safety note |
| --- | --- |
| `https://about-demo.bathos.org/briefing` | Public project explanation and briefing downloads. Availability depends on presenter Mac, Docker and named tunnel. |
| `https://about-demo.bathos.org/briefing/demo` | Public demo guide. |
| `https://login-demo.bathos.org` | Synthetic One Login; normally reached through a service. |
| `https://delegate-demo.bathos.org/account/delegates` | Citizen consent, authority, activity and removal of access. |
| `https://hmrc-demo.bathos.org` | Mock tax service and claim outcomes. |
| `https://hmrc-demo.bathos.org/act-for-someone` | Browser-agent permission request entry. |
| `https://whenisbins-demo.bathos.org` | Public WhenIsBins connector demonstration. |
| `https://whenisbins-demo.bathos.org/evidence` | Redacted public evidence record. |
| `http://localhost:3304` | Private presenter console, not public. |
| `http://localhost:3304/sams-phone` | Private synthetic sign-in details and mock phone code, not public. |
| `http://localhost:3306` | Read-only briefing instance behind the About tunnel. |
| `http://localhost:3303` | Main Observatory address; docs say not running at the 10 October inventory. |
| `http://localhost:3305` | Independent council proof; docs say not running at the 10 October inventory. |

This repair did not re-verify URL availability. Treat these as documented
runtime references, not fresh uptime proof. Presenter controls, research feeds,
credentials, databases, volumes, private tunnel configuration and raw research
records remain outside this handover.

## Completed

- Bathos foundation adoption was merged earlier in PR #153.
- Delegate-local design-system settings were merged in PR #157.
- Connected navigation implementation checkpoint exists on PR #156 at commit
  `2cf1846f4feaffe2b3983265f027e33759d95882`.
- Implementation report exists on the PR branch at
  `plans/connected-navigation/implementation.md`.
- Workflow summary artifact was observed locally at
  `/Users/apple/govuk-delegate-starter/plans/connected-navigation/workflow-summary.md`
  and its non-secret evidence has been copied into this document.
- GitHub issue #155 records implementation checkpoints from the worker.

## In Progress Or Pending

- PR #156 needs conflict repair against current `main`.
- PR #156 needs independent review after repair.
- Merge and deployment are not authorized by this handover.
- Issue #158 needs explicit receiver ACK.
- Handover PR #159 needs independent acceptance of this repaired revision.
- Any final acceptance must be linked back to #158.

## Blocked Or Known Failures

- PR #156 is currently conflicting.
- PR #156 has no GitHub checks reported.
- `gds-54w` remains a Mayor hold with independent review and deployment-block
  requirements for PR #156.
- `gds-eic` stores contradictory pass/failure facts and no source execution;
  reconcile via `mc-ai6`, not by relabeling history.
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

This handover repair verification is limited to documentation checks and
metadata reads. No implementation tests, builds or live URL probes were rerun.

## Data, Runtime And Secret Safety

- Do not reset the shared public demo stack.
- Do not run `docker compose down -v`, global Docker prune, blanket process
  kills, worktree deletion, database removal, credential rotation, `git reset`
  or `git clean` from this handover.
- Preserve existing root dirtiness, generated directories, worktrees, DBs,
  volumes, credentials, deployed URLs, raw evidence and research records.
- Use isolated worktrees, isolated databases and explicit ports for any repair
  or validation work.
- Do not copy secrets into comments or docs. Existing docs may describe local
  development variable names and commands; keep actual credentials out of
  GitHub text.

Shared Bathos dependencies and any Cultivate/shared infrastructure ownership
remain with their existing Gas City owners, including the `mc-bze` family and
`bt-r5w`, unless a separate explicit handover accepts them.

## Resume Instructions For A Fresh Codex Receiver

1. Open issue #158 and post no ACK until after inspection.
2. Read this file on the handover PR/branch.
3. Inspect PR #156, issue #155 and current `main`.
4. Confirm PR #156 conflict status locally or through GitHub.
5. Review root/worktree safety above before running any local cleanup or pulls.
6. Decide one next action: repair PR #156, request independent review, park it,
   or ask the owner for a merge/deploy decision.
7. Post the explicit ACK or blocker on issue #158.

Useful starting commands:

```sh
gh issue view 158 --repo sighmoan1/govuk-delegate-starter
gh pr view 156 --repo sighmoan1/govuk-delegate-starter
git fetch origin
git worktree add /tmp/delegate-pr156 origin/codex/155-connected-navigation
```

Do not rely on Gas City or Mayor state for delivery decisions after this point.
