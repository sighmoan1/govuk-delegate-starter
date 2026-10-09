# GOV.UK Delegate — decision backlog

> **Status:** Working decision register, 9 October 2026. **OPEN** items below are not approved product, policy or legal decisions. This is where to resume the *unresolved questions*. Decisions already taken (including historical or superseded ones) are recorded in [DECISIONS.md](DECISIONS.md); code issues implement *approved* directions. Hypotheses and measured evidence belong in the [validation programme (PR #46)](https://github.com/sighmoan1/govuk-delegate-starter/pull/46).
>
> **How to resume:** Start with the [triage table](#1-triage-table), open the linked decision issue, discuss the trade-offs, gather the stated evidence, agree the narrowest decision appropriate for the participating service, record a dated ADR, then close the decision issue. This file is the index; the GitHub issue is the discussion thread.

## 1. Triage table

**Priority** is the order in which uncertainty threatens a credible external demonstration or real-service pilot, **not** a statement that someone has authority to make a legal/policy decision.

| ID | Priority | Question to decide | Status | Decision owner (role) | Decision trigger | GitHub |
|---|---|---|---|---|---|---|
| **DB-01** | **P0** | What can legally be delegated to an AI representative, and how is it recognised? | **OPEN** | Departmental legal/policy + service owner | Before real-person consequential transactions | [#48](https://github.com/sighmoan1/govuk-delegate-starter/issues/48) |
| **DB-02** | **P0** | When does standing authority suffice, and when must a person approve the exact act? | **OPEN** | Service product/policy/legal + user research | Before autonomous consequential actions | [#49](https://github.com/sighmoan1/govuk-delegate-starter/issues/49) |
| **DB-03** | **P0** | What identity does a provider signature, application registration or execution session establish? | **OPEN** | Identity/security + service integrator | Before treating an agent as high-assurance | [#50](https://github.com/sighmoan1/govuk-delegate-starter/issues/50) |
| **DB-04** | **P0** | What can government throttle or limit without restricting valid access/claims? | **OPEN (policy)** | Service policy + operations + legal/accessibility | Before production-like capacity limits and queue policy | [#51](https://github.com/sighmoan1/govuk-delegate-starter/issues/51) |
| **DB-05** | **P0** | What evidence justifies claiming Delegate improves agentic-demand handling? | **OPEN (experimental)** | Product + evaluation/service owner | Before benefits claims, business case, field pilot | [#52](https://github.com/sighmoan1/govuk-delegate-starter/issues/52) |
| **DB-06** | **P1** | What happens to unidentified automation when a verified route exists? | **OPEN** | Service/security + accessibility/policy | Before additional friction or mandatory use | [#53](https://github.com/sighmoan1/govuk-delegate-starter/issues/53) |
| **DB-07** | **P1** | Is authority centrally owned, federated, or a hybrid of issuers? | **OPEN** | Cross-government architecture + authority issuers | Before importing existing departmental relationships | [#54](https://github.com/sighmoan1/govuk-delegate-starter/issues/54) |
| **DB-08** | **P1** | Online checks, portable proofs, or hybrid authorisation verification? | **OPEN** | Platform/security + consuming services | Before changing prototype's check design | [#55](https://github.com/sighmoan1/govuk-delegate-starter/issues/55) |
| **DB-09** | **P1** | Who governs service capability definitions, versioning and minimum assurance? | **OPEN (governance)** | Service owners + platform standards/security | Before versioned catalogue changes | [#56](https://github.com/sighmoan1/govuk-delegate-starter/issues/56) |
| **DB-10** | **P1** | Who is accountable across agent/sub-agent chains and disputes? | **OPEN** | Service legal/policy + security/incident response | Before broad standing write grants/subdelegation | [#57](https://github.com/sighmoan1/govuk-delegate-starter/issues/57) |
| **DB-11** | **P1** | What consent, authority and activity data should the platform retain? | **OPEN** | Privacy/DPO + service/platform leads | Before real personal data or multi-service aggregation | [#58](https://github.com/sighmoan1/govuk-delegate-starter/issues/58) |
| **DB-12** | **P2** | How should one citizen task group separate cross-service grants? | **OPEN** | Citizen-facing product + participating services | After proving a second service integrates | [#59](https://github.com/sighmoan1/govuk-delegate-starter/issues/59) |

**Owner names are intentionally not assigned.** The roles are the people who would need to decide in a real programme. This independent prototype cannot settle departmental legal or policy positions on their behalf.

## 2. Five questions from our discussion — where we actually are

### Capacity — what are we limiting? → DB-04

- **Agreed implementation principle:** identity and authority checks are distinct from domain policy and request throughput. HMRC's technical throttles are not itself a decision that someone loses an underlying right; the service owns business constraints and integrity. [Decision 23](DECISIONS.md#decision-23--business-rules-and-traffic-limits-are-separate-code-separate-answers-separate-metrics).
- **Present in code:** synthetic per-operator, principal and service technical limits, cost classes, domain outcomes, idempotency and separate event classes.
- **Not yet decided:** which illustrative limits are permissible/justified, fairness and durable acceptance under overload, legally significant submission dates and how to prevent operational controls masquerading as substantive refusals.
- **Decision sought:** classification of resources and policy limits with service-side ownership, admission/queue promises and redress; not a single arbitrary “per-citizen capacity” number. See [DB-04 issue #51](https://github.com/sighmoan1/govuk-delegate-starter/issues/51), queue [#21](https://github.com/sighmoan1/govuk-delegate-starter/issues/21) and swarm metrics [#22](https://github.com/sighmoan1/govuk-delegate-starter/issues/22).

### Approval — when does a citizen have to confirm? → DB-02 + DB-01

- **Agreed mechanical direction:** standing mandates for permitted work; extra step-up only where required. A proposal for a sensitive change should be bound to the particular transaction, not a free-floating approval of a permission name.
- **Present in code:** [Decision 24](DECISIONS.md#decision-24--a-step-up-approval-is-for-one-proposed-change-and-checking-never-spends-it) describes a transaction-specific step-up implementation; current approval expiry remains a policy parameter, not a fully justified cross-service rule.
- **Not yet decided:** what acts must be approved, which may be done autonomously, where the citizen must confirm a declaration's *substance*, and whether different departments have a lawful basis to recognise an AI-initiated attestation.
- **Decision sought:** service-specific approval matrix: read, prepare, submit, legally consequential declaration, change bank details, amend/withdraw, disputes and appeals. See [DB-02 #49](https://github.com/sighmoan1/govuk-delegate-starter/issues/49), [DB-01 #48](https://github.com/sighmoan1/govuk-delegate-starter/issues/48).

### Agent identity — who is being identified? → DB-03

- **Agreed mechanical direction:** independently verified provider/client identity plus valid, principal-approved authority. A recognised signature is not itself a delegation or a guarantee of truthful behaviour.
- **Present in code:** registered agent credentials, Web Bot Auth and declared-agent paths; an authorisation and bounded sub-delegation chain are checked separately.
- **Not yet decided:** operator vs agent product vs running instance vs responsible legal entity; trust, assurance, revocation on compromise and provider-to-provider delegation/transfer rules.
- **Decision sought:** threat-modelled identity taxonomy and assurance minimums by action. See [DB-03 #50](https://github.com/sighmoan1/govuk-delegate-starter/issues/50).

### Legal basis — what authorises what? → DB-01 + DB-10 + DB-11

#### Parking-lot: delegated discretion versus citizen-directed execution (UNDECIDED)

**We have intentionally not decided this.** There are at least three plausible product ambitions:

1. **Assisted execution:** an agent prepares or carries out specifically approved citizen decisions; citizen retains each substantive choice.
2. **Bounded discretion:** citizen authorises a representative to make specified decisions independently within a scope (e.g. respond to routine correspondence, choose between lawful filing options with explicit constraints, escalate higher-impact choices).
3. **Broad autonomous representation:** citizen appoints an agent to manage an entire domain (e.g. “handle my taxes this year”) with substantial ongoing discretion.

The key distinction is **authority to take an action** versus **authority to decide *which* action to take or which assertions to make**. A human might lawfully grant discretionary authority for some services; that does not establish that an AI system or its operator can automatically be recognised on equivalent terms.

**Questions to revisit:** Who legally holds and exercises the delegated discretion—software, its provider, a recognised human/professional representative, or a combination? What scope, financial limits, non-delegable duties, declaration requirements and material-action alerts would make bounded autonomy comprehensible? How could consent, revocation, monitoring, redress and liability work when the agent's specific future decisions are unknown at authorisation? What can receiving services recognise under existing law versus what would need policy/legislative change?

**Concrete test case:** The citizen grants “manage my taxes this year.” The assistant prepares a factually accurate return and wishes to submit without the citizen inspecting the final declaration. Does the citizen have to approve the exact content; may a formally recognised representative exercise discretion; or is the act simply non-delegable in that service?

**Provisional design discipline, not a decision:** Do not make a broad natural-language goal a machine-enforceable mandate. Continue to implement narrowly scoped permissions with service-owned conditions while keeping the future ability to express *bounded discretion* open. Resolve this question in DB-01 together with [DB-02](https://github.com/sighmoan1/govuk-delegate-starter/issues/49) if a real service/use case forces it. Avoid turning prototype mechanics into a claim of UK legal validity.



- **Agreed principle:** a citizen's generic click in Delegate cannot create a legal power the citizen is not able to grant; a receiving department still determines if an operation is legally effective.
- **Not yet decided:** legal validity of particular software-agent acts, origin of appointed authority, responsibility for incorrect submissions, required electronic signatures/attestations, who may rescind an appointment, and lawful data processing by each organisation.
- **Decision sought:** an action-by-action legal and administrative matrix, verified by qualified departmental lawyers/owners for any non-synthetic trial. Distinguish authority to act, recognition of acts and a separate **lawful basis for processing personal data**. See [#48](https://github.com/sighmoan1/govuk-delegate-starter/issues/48), [#57](https://github.com/sighmoan1/govuk-delegate-starter/issues/57), [#58](https://github.com/sighmoan1/govuk-delegate-starter/issues/58).

### Trusted route — does it actually improve agentic-demand handling? → DB-05 + DB-06

- **Agreed as hypothesis only:** identify and authorise legitimate automation rather than assuming all extra demand is abuse or relying on infallible AI detection.
- **Existing demonstration:** exploratory individual agent route observations, synthetic swarm tests and transaction-integrity implementation. These do not prove adoption, cost savings, lower fraud or national-scale results.
- **Not yet decided:** whether agents voluntarily prefer identified access; whether Delegate adds real benefit beyond an excellent API and service-local representative authorisation; acceptable friction for unidentified traffic.
- **Evidence path:** [PR #46](https://github.com/sighmoan1/govuk-delegate-starter/pull/46) contains the separate protocol and evidence register. Run [E2 / #47](https://github.com/sighmoan1/govuk-delegate-starter/issues/47) to measure **incremental value of Delegate**, not just API quality. Log failures and counterevidence. See [#52](https://github.com/sighmoan1/govuk-delegate-starter/issues/52) and [#53](https://github.com/sighmoan1/govuk-delegate-starter/issues/53).

## 3. Already decided, proposed, and merely implemented

**Do not reopen by accident:**

| Subject | Current position | Where recorded | Qualification |
|---|---|---|---|
| Identity vs authority | One Login authenticates a person; Delegate manages representation authority | [Decision 2](DECISIONS.md#decision-2--one-login-authenticates-the-principal-delegate-manages-authority) | Mock sign-in is not production identity assurance |
| Services own business decisions | Each service determines supported operations and domain rules | [Decision 4](DECISIONS.md#decision-4--service-defined-capabilities) and Decision 23 | Live generic catalogue publication is still engineering backlog [#28](https://github.com/sighmoan1/govuk-delegate-starter/issues/28) |
| Lookup for prototype | Service checks a live Delegate mandate | [Decision 5](DECISIONS.md#decision-5--relationship-lookup-before-portable-credentials) | Not a production commitment; [DB-08](#1-triage-table) remains open |
| No AI-content detection as security control | Detection is uncertain; identify/verifiably authorise the agent where possible | [Decisions 6–8](DECISIONS.md) | No proof all agents will choose the authorised route |
| Idempotent claim/answer handling | One retry must not create extra business effects | [Decision 21](DECISIONS.md#decision-21--one-client-operation-at-most-one-committed-business-transaction) | Receiving service's feature; not proof of Delegate's marginal value |
| Transaction-specific step-up | Consequential change proposal is bound to approval | [Decision 24](DECISIONS.md#decision-24--a-step-up-approval-is-for-one-proposed-change-and-checking-never-spends-it) | Mechanics implemented, legal/policy trigger still open |
| Delegate is not Orchestrate | Authority platform rather than provider task manager | [Architecture PR #27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27) | Documented on a **still-open PR**, not merged policy |
| Federated vs central authority origin | Hybrid is a hypothesis, not an approved architecture | [Federation options in PR #27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27) | Requires experiment [#43](https://github.com/sighmoan1/govuk-delegate-starter/issues/43) and decision DB-07 |

**Important:** an architectural decision made for *a synthetic prototype* is not automatically an approved national-government legal or policy decision. Preserve exact scope and date in any eventual ADR.

## 4. Discussion and decision order

A suggested sequence to avoid going in circles:

1. **First discussion: DB-01 + DB-02 (legal powers and human sign-off).** Pick concrete actions (routine read, ordinary claim, tax declaration, refund account change) and define whether a standing mandate is sufficient. You needn't resolve every regime to decide what the *next synthetic experiment* assumes.
2. **Then DB-03 + DB-10 (identity, subagents and responsibility).** Clarify what the signer proves and the minimum attribution needed for each class of action.
3. **Then DB-04 + DB-06 (capacity and the unverified lane).** Challenge business limits separately from throughput and policy friction. These choices affect whether E3 is a fair experiment.
4. **In parallel: DB-05 (experimental evidence).** Prespecify what success/failure would mean, then run E1/E2/E3. A product value decision should follow evidence.
5. **After the first cross-service demonstration: DB-07, DB-08, DB-09 and DB-11.** Federation, proof format, service catalogue governance and privacy controls become easier to decide with a second service and an issuer prototype.
6. **Lastly DB-12.** Grouped cross-service consent is valuable, but should not pre-empt valid independent grants.

This is an order for **discussion and demonstration**, not permission to bypass legal, security or privacy reviews for real citizens.

## 5. Decision process — use this instead of another speculative build ticket

Every decision issue should retain:

- **Question and status:** OPEN → EVIDENCE GATHERING → DECIDED, DEFERRED or SUPERSEDED.
- **Options including no change**, with the strongest argument and risks for each.
- **Owner by role**, and actual participant names only once voluntarily assigned.
- **Evidence:** experiments, service owner input, legal advice, research, threat model and source references, distinguishing facts from assumptions.
- **Decision trigger and reversibility:** which downstream issue is blocked; what would cause a revisit.
- **Outcome:** dated ADR in [DECISIONS.md](DECISIONS.md) with scope, rationale, consequences and dissent; then update this table and close/supersede issue.
- **Implementation:** a *separate engineering issue* only if the chosen direction is not already implemented. Don't use a code PR to quietly settle policy.

**ADR numbering:** check the current final number on `main` at decision time. The still-open [PR #27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27) includes an ADR numbered “21” on its historical branch while main has advanced beyond Decision 24; reconcile numbering when merging. Do not rewrite historical decisions without a supersession note.

## 6. Where the artefacts belong

| Artefact | Role |
|---|---|
| **This `docs/DECISION_BACKLOG.md`** | Canonical open-question index, priorities, evidence gaps, pointers to GitHub discussion |
| **[DECISIONS.md](DECISIONS.md)** | Durable accepted decisions and supersessions, not proposed policy |
| **Individual GitHub [decision] issues** | Debate, options, links, owner, evidence and actual resolution |
| **Technical issues/PRs** | Implement only the agreed approach; may reveal new decision blockers |
| **Validation & evidence docs in [PR #46](https://github.com/sighmoan1/govuk-delegate-starter/pull/46)** | Falsifiable hypotheses, methods, observed results, and stakeholder claims |
| **Delegate / Orchestrate / federation docs in [PR #27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27)** | Architecture context and unresolved architecture alternatives |
| **About site** | Explain established decisions and experiment status to visitors; do not publish an unresolved policy option as fact |

**The immediate next decision conversation is DB-01 / DB-02:** what a person may lawfully delegate to an AI, and when the government service should demand approval of the *exact* consequential transaction.
