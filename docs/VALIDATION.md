# GOV.UK Delegate — validation and experimental programme

> **Status: experimental protocol, v0.1, 9 October 2026. Not evidence of real-world effectiveness.**
>
> **Question:** Does access for *identified, appropriately authorised representatives*, including AI agents, improve how government services cope with increased automated demand, compared with good service APIs and conventional controls alone?
>
> **Keep this document stable as the test plan.** Add measured outcomes and source links to [EVIDENCE.md](EVIDENCE.md). Use the [demo and claims guide](DEMO_GUIDE.md) when explaining the project. Architecture and policy questions continue separately in [DECISIONS.md](DECISIONS.md) and the [Delegate/Orchestrate architecture proposal in PR #27](https://github.com/sighmoan1/govuk-delegate-starter/pull/27).

## 1. The proposition and what would change our minds

**Product hypothesis:** A route where a legitimate agent identifies itself, obtains a verifiable and revocable mandate, and uses a suitable government interface can make more legitimate citizen work safely manageable at reasonable cost, without excluding people or eroding procedural rights.

**Counter-hypothesis:** A well-designed API, idempotency, capacity management and ordinary service-local representative authorisation may achieve most or all of the benefits; adding Delegate might impose extra handoffs and central failure dependencies without proportional incremental value.

The key causal question is **not** “does an authorised API beat scraping?” It is **“what does Delegate add to a good API and competent service-side controls?”**

Success is not fewer HTTP requests, more denials or higher bot-detection accuracy. A rise in *genuine* claims is a public-service demand outcome, not automatically abuse. We must distinguish five classes using independently labelled ground truth:

1. **Distinct legitimate intents:** each real person has a separate task; preserve access and any lawful submission/review rights even if the ultimate claim is ineligible.
2. **Duplicate transport attempts:** retries, reconnections and repeated tool calls for the *same intended operation*; converge on one result.
3. **Avoidable requests:** frequent status polling or redundant reads; reduce resource demand, not citizen entitlement.
4. **Unauthorised attempts:** no valid authority, revoked permission, attempted privilege widening or misuse of another person's records; refuse.
5. **Potentially invalid/abusive substance:** a submission that fails domain checks or merits fraud review; handle by service-specific policy and evidence, not by assuming “AI = fraud”.

The five classes are **not interchangeable**. Identity, authority, submission validity and technical throughput must be analysed separately.

## 2. Decision framework

### North-star outcome (when costs can really be measured)

**Fully loaded cost per correctly handled *distinct legitimate citizen intent*** = (service infrastructure + Delegate overhead + handling + support + rework + incident cost attributable to the cohort) / (distinct legitimate intents correctly handled).

Count a distinct intent once, even if it produces 100 API calls. A durable receipt is not a substantive entitlement decision. Legitimate intents may culminate in a correct refusal, correction or appeal.

**Until costs are measured:** report *proxy technical work per correctly handled intent*, plus infrastructure time, number of interactions, human interventions, p50/p95 handling time and error rates. **Do not call a proxy a measured financial saving.** State capacity and unit-cost assumptions.

### Guardrails (must not deteriorate)

- **No executed unauthorised high-consequence actions** in specified adversarial tests; independently check database effects, not only HTTP status.
- **No extra business side effects** from equivalent retries/concurrent agents; distinguish genuine amendments.
- **No lost legitimate submission** because of avoidable throttling, queue crash, timeout or silent failure; measure time to durable acceptance separately from time to a decision.
- **No material regression in citizen task completion or access**, including human and assisted-digital routes; retain the same eligibility and procedural rights.
- **Revocation and consent comprehension:** people must know what they grant, how to restrict/revoke, and what has actually happened.
- **Data minimisation, independent user access and traceable source data.** No real tax/benefit records in this prototype.

A “zero failures” result in a synthetic suite is a regression-test outcome, not a demonstrated real-world failure probability of zero.

### Candidate decision thresholds (to pre-agree before study, not retrospectively)

- **E1 adoption:** e.g. ≥80% verified-authorised-route choice among *eligible, tool-capable* participating agents, measured with denominator and confidence interval. This is an illustrative ambition, **not** an observed or statistically justified target.
- **E2 incremental value:** demonstrate a pre-specified, measurable advantage in citizen control/security/cross-service reuse that the service-local/API-only comparator cannot deliver at comparable cost and effort. Cost may increase; the benefit must be explicit and worth it.
- **E3:** zero intentionally lost distinct well-formed authorised test submissions in a bounded stress workload; fairness and time-to-acceptance do not materially worsen relative to comparator.
- **E4:** zero duplicate business side effects and zero unauthorised commits in adversarial regression workloads; log legitimate false refusals.
- **E5:** proposed ≥85% correct understanding of permitted/prohibited actions and revocation in structured questions; must be validated with inclusive user research, not a five-person convenience sample.
- **E6:** zero department-specific changes to Delegate core logic when adding a second mock service (not necessarily zero configuration or integration work).
- **E7:** no false “accepted”, “revoked” or “no authority” claims during outages; correct recoverable statuses.

Before a real pilot, fix acceptable effect sizes/non-inferiority margins, statistical unit (person, task, agent or session), sample sizes, recruitment, stratification, fairness checks and cost methodology with the service owner/research lead. Synthetic workload thresholds are engineering invariants rather than population inference.

## 3. Experiment register

These identifiers are permanent. Changes to treatment, instrumentation or success metrics require a protocol-version increment. Exploratory results can inform protocols but cannot be retroactively presented as confirmatory evidence.

| ID | Question | Treatments / contrast | Main measures | Starting point |
|---|---|---|---|---|
| **E1 Route choice** | Will real agents voluntarily use a legitimate identified route? | Route and documentation usability variants, randomised/counterbalanced across agent tool environments | Verified-route adoption, completion, handoffs, attempts to use human session, time | Exploratory [Scenario 3](../apps/about/src/app/which-route/page.tsx); no controlled rate |
| **E2 Incremental Delegate value** | Does Delegate improve outcomes beyond a good API? | Human-facing baseline; **same-quality service API with service-local delegated auth**; same API + Delegate | Cost/work per intent, completion, consent/revocation effectiveness, authorised actions, latency | **Not yet run; priority experiment** |
| **E3 Legitimate surge** | Can we handle lots of independent requests without equating them to abusive swarms? | Bounded concurrency with 100 distinct people versus retry/poll/sub-agent bursts; identical processing budget | Durable acceptance, p95 acknowledgement, fairness, queue depth, technical load | [Scenario 4](../apps/about/src/app/swarm/page.tsx) demonstrates person-level rules, **not** throughput value |
| **E4 Integrity** | Do identity + mandate + idempotency survive adversarial traffic? | Authorised/revoked/absent/widened grants; duplicate keys, different agents, amendments | Unauthorised commits, duplicates, false refusals, revocation enforcement | [Idempotency tests](../tests/idempotency.test.ts), [swarm tests](../tests/swarm.test.ts) are technical test sources; no results published here |
| **E5 Citizen control** | Can people grant standing discretion without losing understanding/control? | Standing mandate versus per-action consent; different scope explanations | Comprehension, completion, erroneous authorisation, revocation, workload, accessibility | **Not yet run** |
| **E6 Interoperability** | Does a new department integrate without central customisation? | HMRC + independent mock department | Core changes to Delegate, effort, integration defects, permission isolation | Issues [#28](https://github.com/sighmoan1/govuk-delegate-starter/issues/28), [#33](https://github.com/sighmoan1/govuk-delegate-starter/issues/33) |
| **E7 Resilience** | What happens during dependency and queue failures? | Delegate/issuer/worker failure injections, timeout after commit | Durable recovery, false state messages, safe refusals, lost work | Not yet run end-to-end as a comparative study |

File links above are repository-relative source paths, not citations to a published, independently verified trial.

## 4. Experiment protocols

### E1 — Real-agent route choice

- **Population:** multiple agent products/modes with actual browsing or API capabilities; do not pool a text-only assistant that cannot submit forms with a tool-capable agent as if both had equal opportunity.
- **Task:** same safe synthetic tax-relief workflow; valid principal with genuine opportunity to independently grant consent.
- **Variants:** (A) normal browser instructions; (B) an equally accessible well-documented agent route; (C) identified Delegate route with usable consent/discovery; (D) same Delegate route with improved handoff and agent-facing documentation.
- **Design:** randomise order where possible; reset synthetic state; use repeated tasks across models/providers and record provider/version/tools. Control for authentication difficulty, available APIs, hints and cookies. Do not instruct agents to break into someone else's real session.
- **Observe:** route *actually used* from HMRC/Delegate logs, grant created, transaction committed, drop-off reason, successful handoff, retries, human interventions. An agent saying it “intends” to delegate is not adoption.
- **Falsification:** the authorised route remains unused or has higher abandonment even when discoverable; human-session workarounds persist.

**Existing exploratory material:** the About site's route-choice page records individual observations rather than randomised runs. Preserve it, but do not derive adoption percentages from that small non-random series.

### E2 — Incremental value of Delegate (highest priority)

**The API-only comparator must be valid and safe:** service-native representative access or equivalent controlled synthetic permission with *comparable assurance and safeguards*. Do **not** implement a deliberately insecure “no authorisation” route and credit Delegate with beating it.

- **Arm A:** normal supported citizen/human web journey (context baseline, not necessarily a matched delegated-agent treatment).
- **Arm B:** high-quality departmental API using service-local representative identity/consent (same capability scope, safeguards, idempotency, queue/fairness and documentation).
- **Arm C:** **the same API** with GOV.UK Delegate-issued mandate, independent citizen approval, scope/revocation and activity attribution.
- **Optional D:** Arm C with an improved one-step consent/handoff design (isolates Delegate usability from Delegate policy).
- **Keep constant:** eligibility, workflow, data, infrastructure allocation, API features, error handling, rate limits, model and tool environment where technically possible. Count the Delegate overhead and consent time; no free infrastructure.
- **Tasks:** routine read, permitted submission, delegated follow-up, prevented forbidden action, revocation during workflow and provider handoff.
- **Main comparison:** **C versus B**, with outcomes and cost denominated per distinct legitimate intent. **B versus A** measures API/journey improvement, not Delegate's contribution.
- **Success:** Delegate produces a meaningful, observed improvement in independent control, revocation, provenance or integration portability at an acceptable increment of effort/cost. It need not be cheaper on throughput alone.
- **Falsification:** no practical control benefit over service-local delegation, while consent failures, latency or operational cost rise enough to outweigh it.

### E3 — Genuine demand versus duplicate traffic

Use reproducible seeded workloads: (1) 100 separate people, one legitimate intent each; (2) one person, 100 retries of *one* attempt; (3) one person, many sub-agents attempting the *same* operation; (4) one provider, 100 distinct authorised citizens; (5) avoidable high-frequency status polls; (6) known unauthorised requests.

Measure **HTTP attempts**, **unique citizen intents**, **durably admitted operations**, **business completions**, **duplicate side effects**, **false refusal**, **p50/p95 acceptance and completion latency**, **queue fairness** and **cost/resource proxies** separately. A 202 receipt means durable submission, not approval or claim correctness.

Test API-only and API+Delegate under the **same bounded compute budget**. Do not declare “success” merely because one person's allowed action count is capped. Legitimate distinct people should not be prevented from lodging valid requests solely to make a chart look favourable.

### E4 — Independent enforcement and integrity

Adversarial fixtures include no mandate; revoked/expired mandate; unauthorised sensitive operation; sub-agent privilege widening; same key/same payload retry; same key/different payload conflict; equivalent claim under different keys; materially new evidence; retry after committed response lost; concurrent attempts through multiple agents.

**Ground truth** is the independent fixture and final database effect. Count both security escapes and legitimate actions wrongly denied. An HTTP `ALLOW` is not a committed transaction; a denial may reflect insufficient authority or an entirely separate business rule. See already existing test code; run, version and preserve outputs before claiming measured results.

### E5 — Citizen comprehension, burden and redress

Moderated, accessibility-aware tasks: approve a narrow mandate, explain excluded actions, handle a routine answer, recognise a consequential declaration that demands separate approval, inspect the actual service outcome, challenge a disputed answer and revoke future access. Compare standing authority to repeated per-transaction approval with equivalent legal rules.

Measure comprehension *after* consent, errors, completion, user-reported confidence, steps/time, assisted-digital alternatives and differences among user groups. Do not treat synthetic persona responses as real user research.

### E6 — Integration effort and portability

Add a distinct mock service, with its own registered catalogue, business policy and credentials. Log developer setup time, API/permission changes, migration effort and any central code changes. Explicit tests must prove grants do not bleed between departments. Zero central **department-specific** code is the goal; generic registry improvements are permissible and should be identified separately.

### E7 — Availability and failure semantics

Inject Delegate-check outage, service outage, worker crash, lost response after commit, delayed revocation propagation and external-issuer timeout. Verify no silent loss, no false “accepted/completed/revoked” UI, traceable attempts and explicit `UNKNOWN/UNAVAILABLE` when authority state cannot be established. Record whether human and agent-assisted routes differ.

## 5. Measurement and evidence collection contract

Each completed run gets a durable `RUN-ID` and a *record*, linked from [EVIDENCE.md](EVIDENCE.md):

| Field | Why it matters |
|---|---|
| `experiment_id`, `protocol_version`, `run_id`, UTC timestamp | Reproducibility and change history |
| Git commit SHA, deployment topology, database seed, limits/config | Avoid comparison across unlike implementations |
| Agent/model/version/tool permissions, test instructions and randomisation seed | Agent changes and order effects |
| Comparator arms, repetitions, valid denominators, independent ground truth labels | Causal attribution and honest rates |
| Raw request/event counts and distinct intent IDs (pseudonymous) | Prevent mixing requests with outcomes |
| Durable receipt/outcome references, DB state checks and attribution | Verify effects, not just API response codes |
| Measured time, compute, support and cost basis | Distinguish financial cost from estimates |
| Metric calculations including uncertainty intervals where relevant | Avoid false precision |
| Deviations, exclusions, failed runs, limitations, privacy handling | Honest interpretation |
| Raw artefact/log link, reviewer and decision | Independent scrutiny and revisit |

**Evidence levels:**

- **Hypothesis:** an untested expectation or proposed mechanism.
- **Exploratory observation:** a real but uncontrolled event or small sample; useful to design tests.
- **Technical demonstration:** source-controlled tests/runs establish bounded behaviour in a synthetic environment.
- **Comparative experiment:** controlled arms show an attributable difference within the studied environment.
- **Field evidence:** a service owner measures real-world operations, costs, accessibility and outcomes under appropriate governance.

Never label a hypothesis or code assertion as an observed measured benefit. Every public number should have a run ID, numerator/denominator, date, method, source, and limitations. A compelling demo is not a substitute for a comparative experiment.

## 6. Reporting and governance

Before a run: choose protocol version, pass/fail criteria, workload and treatment allocation; record *why* changes are made. After a run: publish all arms including failures and inconclusive findings. Group results by run, not selectively by the best-looking response.

Report **separately**:
- the benefit of a good API vs human-facing navigation;
- the *incremental* contribution of Delegate vs service-local authorisation;
- the contribution of idempotency, queues and fair throughput controls;
- the effect on citizen control and exclusion, not just infrastructure.

The [About-site evidence page](../apps/about/src/app/evidence/page.tsx) is the stakeholder entry point. It points at this protocol and the evidence log. We should **not** build an ungrounded dashboard of success percentages. A later implementation may ingest signed/versioned run manifests to generate charts when real reproducible data exists.

## 7. Immediate execution order and outstanding engineering

1. **E1, exploratory extension:** rerun the route-choice task with multiple tool-capable agents; preserve test instructions, route and logs.
2. **E2, controlled comparison:** design B and C with the same API; service-local authorisation in B is crucial. Instrument complete citizen intent → outcome.
3. **E3/E4:** reuse the current swarm and idempotency harness, but add unique intents, comparable arms and resource accounting. [#22](https://github.com/sighmoan1/govuk-delegate-starter/issues/22) already covers extension of swarm measurement; don't duplicate it.
4. **E5–E7:** expand only when the central incentive and marginal-value hypotheses have credible evidence.

**First go/no-go decision:** Does verified, independently revocable delegation attract agents and add enough trust/control beyond a good departmental API to justify the extra handoff? A negative or mixed answer is still a useful result and should be published.
