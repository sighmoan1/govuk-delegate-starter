# Evidence register — what we know, what we have tested, and what remains unproven

> **Status at 10 October 2026:** This is the **evidence ledger**, not a marketing scorecard. One bounded technical E2 comparison is recorded below; no citizen-effort, financial or real-world benefit has been established. Protocols and possible thresholds live in [VALIDATION.md](VALIDATION.md).
>
> **Rule:** Every result must link to a repeatable run, date, commit SHA, protocol, exact workload, raw artefacts and independent outcome verification. Record negative, null and failed runs.

## Evidence hierarchy

| Label | What it means | May we claim it proves Delegate's overall value? |
|---|---|---|
| **P — Proposed** | A hypothesis, planned experiment or unmeasured metric | **No** |
| **O — Exploratory** | Actual uncontrolled observations; method/sample limited | **No** |
| **T — Technical** | Versioned automated test or synthetic demonstration with independently checked side effects | **Only for the bounded software behaviour tested** |
| **C — Comparative** | Same task/conditions with usable comparator, measured run evidence | **Only within the tested setting** |
| **F — Field** | Governed observation/experiment with service users and operational outcomes | **Supports real-world claims, subject to limitations** |

A repository test that *exists* is not automatically a verified passing test run. Do not claim its results were measured without recording execution evidence.

## Current register

| Evidence ID | Related experiment | Evidence level | Status | Source and what it actually says | Limits |
|---|---|---|---|---|---|
| **OBS-ROUTE-001** | E1 | **O** | Existing exploratory observation | [Scenario 3 route-choice page](../apps/about/src/app/which-route/page.tsx) contains individual agent runs observed from HMRC logs | Non-randomised, changing environment, heterogeneous agent abilities, no adoption rate or cost effect can be estimated |
| **SRC-SWARM-001** | E3/E4 | **Not yet a recorded T run** | Source present | [Synthetic swarm tests](../tests/swarm.test.ts) and [swarm scenario](../apps/about/src/app/swarm/page.tsx) exercise multiple principals, agents and sessions | Demonstrate *intended business limits* and code paths; not an API-only comparison, throughput benefit or measured costs |
| **SRC-IDEMP-001** | E4 | **Not yet a recorded T run** | Source present | [HTTP idempotency tests](../tests/idempotency.test.ts) specify retry and concurrent-agent invariants | Source code, not a linked run log; idempotency is mainly a receiving-service mechanism, not incremental Delegate value |
| **RUN-20261009-E2-01** | E2 | **T** | Narrow technical comparison completed | [Pinned B,C,C,B run with permanent raw records](evidence/RUN-20261009-E2-01.md) | Both paths completed the fixed tasks; no incremental outcome advantage observed. Direct fixture consent, different authority runtimes, no human effort/cost evidence |
| **PLAN-E5-001** | E5 | **P** | Not run | [Citizen-control research protocol](VALIDATION.md#e5--citizen-comprehension-burden-and-redress) | No real participant evidence |
| **PLAN-E6-001** | E6 | **P** | Not run | [Service integration protocol](VALIDATION.md#e6--integration-effort-and-portability) | Independent synthetic council service is implemented ([integration guide](SECOND_SERVICE.md), [merged PR #97](https://github.com/sighmoan1/govuk-delegate-starter/pull/97)); measured integration effort and production portability remain untested |
| **PLAN-E7-001** | E7 | **P** | Not run | [Outage protocol](VALIDATION.md#e7--availability-and-failure-semantics) | No comparative outage run recorded |

### Findings we should and should not report today

**Supportable, with the appropriate limits:** the repository contains a working design for service-to-Delegate authority checks, explicit mandates and revocation; it includes synthetic tests for retry/swarms and a few recorded exploratory agent observations. These are *implementation and feasibility evidence*, and must be checked against an actual pinned run before reporting results or totals.

**Not yet supportable:** verified agents adopt Delegate at an 80% rate; Delegate lowers infrastructure or casework cost; Delegate prevents real-world fraud; Delegate handles national-scale demand; consent is well understood by citizens; Delegate is cheaper or more effective than a good agent API with service-local delegation.

**Specific attribution caveat:** duplicate prevention in mock HMRC arises from HMRC's transaction-integrity features. Even if its tests pass, this is **not** independent proof that Delegate caused duplicate prevention.

## Recorded experimental runs

**[RUN-20261009-E2-01](evidence/RUN-20261009-E2-01.md)** records the first bounded technical B/C comparison: both authorisation paths completed all fixed synthetic legitimate intents and prevented the tested unauthorised effects. This is T evidence; no citizen-effort, financial or field benefit was measured. Permanent raw records and hashes are linked from the run.

When one is ready, add an immutable record at `docs/evidence/RUN-YYYYMMDD-E[1-7]-NN.md` using this template (avoid personal or operational secrets in Git):

```markdown
# RUN-YYYYMMDD-E2-01 — <neutral descriptive title>

**Status:** completed | failed | inconclusive
**Evidence class:** T | C | F
**Experiment:** E2, protocol v0.1
**Executed at (UTC):**
**Run owner / reviewer:**
**Commit SHA / deployment:**
**Workload and synthetic ground truth:**
**Treatments / controls:**
**Models, tool access and environment:**
**Randomisation/seed and exclusions:**
**Pre-agreed decision thresholds:**

## Raw evidence
- logs / redacted artefacts and hashes:
- independent DB effect verification:
- consent and authority event evidence:

## Results
| Measure | Control | Treatment | Difference | Uncertainty/notes |
|---|---:|---:|---:|---|
| Distinct legitimate intents | | | | |
| Durably accepted legitimate intents | | | | |
| Correctly completed intents | | | | |
| Unauthorised commits | | | | |
| Duplicate side effects | | | | |
| Mean/p95 effort or latency | | | | |
| Measured cost or **explicitly labelled proxy** | | | | |
| User exclusions/errors | | | | |

## Interpretation
- What changed / what *did not*:
- Alternative explanations:
- Surprising or negative results:
- Limitations and external validity:
- Decision supported:
- Next action:

```

Then update the register with the run link and its **actual** evidence classification. A failed or null experiment should remain discoverable.

## Roadmap for evaluation, not evidence

- [E1](VALIDATION.md#e1--real-agent-route-choice): observe true route selection with agents that possess appropriate tools.
- [E2](VALIDATION.md#e2--incremental-value-of-delegate-highest-priority): measure Delegate's *incremental* value over a safe, functional service-native agent API.
- [E3](VALIDATION.md#e3--genuine-demand-versus-duplicate-traffic): preserve valid demand under retry, polling and multi-agent load.
- [E4](VALIDATION.md#e4--independent-enforcement-and-integrity): check business effects, not just HTTP responses.
- [E5](VALIDATION.md#e5--citizen-comprehension-burden-and-redress): moderated inclusive user research.
- [E6](VALIDATION.md#e6--integration-effort-and-portability): prove service neutrality.
- [E7](VALIDATION.md#e7--availability-and-failure-semantics): fail safely and recover.

The [demo and claims guide](DEMO_GUIDE.md) explains which claims can be presented to external audiences as established facts, demonstrations or hypotheses.
