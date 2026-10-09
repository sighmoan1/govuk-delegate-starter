# Design briefing

About 25–30 minutes with discussion. Prepared 10 October 2026.

Independent synthetic prototype. Baseline main `6b4f3895f246cfe9e274059c57e4dc1ea7989650`. Observatory PRs #109–110 remain unmerged at preparation.

## 1. GOV.UK Delegate: design review

Implemented safeguards, service boundaries and questions for a government trial.
Synthetic prototype. Production ownership and recognition remain open.

### Speaker notes

This briefing supports a twenty-five to thirty minute discussion after the concept walkthrough. Choose supporting demonstrations according to the audience's questions. The coverage map identifies what the short demonstration leaves out. The source baseline is main 6b4f389, plus explicitly labelled unmerged Observatory work.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 2. System responsibilities


| System | Responsibility |
| --- | --- |
| One Login | Authenticate the person |
| Delegate | Record consent and check current authority |
| HMRC / council | Define and execute service actions |
| Chosen assistant | Plan work and use service interfaces |
| Observatory | Inspect evidence and research predictions |

### Speaker notes

One Login authenticates Sam. Delegate records and checks authority. HMRC and council define operations and decide their domain outcomes. The external assistant plans and executes tasks. Observatory receives minimised research data and cannot alter source-service decisions. A government Orchestrate is a hypothetical separate product.

Sources: [Architecture and ownership](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/ARCHITECTURE.md), [Independent council integration](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/SECOND_SERVICE.md).

## 3. A request becomes a bounded relationship

A registered representative asks for named service capabilities.
The person approves an unchecked selection and duration. Each service checks current authority before acting.

### Speaker notes

Demonstrate the pinned catalogue labels and purpose. The purpose helps Sam recognise the request but grants no extra actions. Credentials identify the representative separately from Sam. Show a granted and an ungranted action with the same token so scope enforcement is observable.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Architecture and ownership](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/ARCHITECTURE.md).

## 4. Service catalogues and standards

Services publish immutable versions of their capabilities and supported restrictions.
Delegate validates the shared contract. Services own the meaning of each operation and restriction.

### Speaker notes

Publication uses the service's own credential. Identical content replays. Conflicting content for a version is refused. Catalogue updates do not enlarge old grants. The prototype adopts a bounded contract without asserting conformance to a national delegation standard. Governance and minimum assurance remain DB-09.

Sources: [Service-defined restrictions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/MANDATE_CONSTRAINTS.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 5. Restrictions stay within the grant

The prototype supports bounded sets of service-defined values, such as permitted tax years.
A person or sub-agent can narrow those values. A service checks the actual operation against the returned bounds.

### Speaker notes

Show requested and selected tax-year values, then an incompatible-year refusal. Delegate validates structure, membership and chain intersections. HMRC checks the actual synthetic target year and its supported catalogue digest. Arbitrary natural-language conditions are not executable policy. Wider or incompatible restrictions fail closed.

Sources: [Service-defined restrictions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/MANDATE_CONSTRAINTS.md).

## 6. Credentials and replay defence

The agent authenticates as itself. Request signatures bind the intended request.
Replay controls and consent CSRF checks protect the supported paths.

### Speaker notes

Identity here can mean registered client, operator or verified signer depending on the route. It is not a universal identity for an AI model or a guarantee of honest behaviour. Browser session binding, request-target binding and fresh signature checks prevent the tested substitution/replay cases. Production compromise response and provider identity taxonomy remain open.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Recorded combined validation and manual walkthrough](https://github.com/sighmoan1/govuk-delegate-starter/issues/90#issuecomment-6090819665), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 7. Sub-agents inherit narrower authority

Live checks inspect the parent chain as well as the current delegation.
Removing a capability, revoking an ancestor or reaching expiry prevents later use.

### Speaker notes

The child cannot add permissions or widen inherited restrictions. Depth is bounded. Demonstrate through existing API tests or a rehearsed subdelegation request, rather than imply the account has a complete sub-agent management UI. Assignment of liability across providers remains DB-10.

Sources: [Service-defined restrictions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/MANDATE_CONSTRAINTS.md), [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 8. Sensitive changes need exact-action approval

Refund-account and address changes require approval of the proposed change.
Approval binds the payload, operation key, person, mandate and expiry.

### Speaker notes

Show a proposed synthetic refund-account change and the dedicated approval page. Checks do not consume approval. HMRC reserves it after admission, redeems it on completion and recovers abandoned leases. A different payload or key requires new approval. The default ten-minute deadline runs from proposal creation. The service must determine the lawful policy trigger for real actions.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 9. Original consent and later changes

Approval stores the wording and catalogue version Sam saw.
Narrowing and revocation append history while preserving that original evidence.

### Speaker notes

Use the account detail to distinguish original selection from current permission. Old fixture grants have no fabricated historical snapshot. Triggers protect records against ordinary application mutation. A privileged database administrator remains outside that guarantee. Retention, administrative erasure and denied-read audit design need production owners.

Sources: [Original consent evidence and history](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CONSENT_EVIDENCE.md).

## 10. Receipts and redress

Service outcomes differ from successful authority checks.
Sam can inspect an agent's answer, dispute it and remove that permission.

### Speaker notes

An agent's confirmed_by_person assertion is its claim, not proof of agreement. A dispute removes the relevant capability. HMRC learns about the dispute on a later receipt-status read and reopens the question. There is no immediate push notification. On failure it exposes unavailable dispute verification. Demonstrate using a prepared question/answer fixture.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md).

## 11. Transport load and service outcomes


| Measure | Meaning |
| --- | --- |
| Requests / authority checks | Technical demand |
| Unique claims / accepted receipts | Service work received |
| 429 / 503 with retry guidance | Temporary technical refusal |
| Business refusal | Service-owned domain decision |
| Queue wait / worker time | Different sources of delay |

### Speaker notes

Run Demo B. Technical throttles identify retryable conditions and leave substantive entitlement unchanged in the prototype response. Authority checks spend no citizen allowance. Person-based service rules prevent multiplying a claim through agents or sessions. The particular claim rules and numeric limits are synthetic policy choices. A central authority check still consumes work even if HMRC later throttles.

Sources: [Swarm scenarios and accounting](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/apps/about/src/app/swarm/page.tsx), [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md).

## 12. Durable acceptance and revocation

HMRC returns an asynchronous receipt after storage commits. The worker records the claim later.
A retry uses the stored operation result. Revocation prevents new authorised work.

### Speaker notes

202 means received, not approved. A receipt timestamp is not a legal filing date. Already accepted jobs continue under the prototype policy even if authority later ends. Queue fairness is by person, not provider. There is no global queue bound or outcome-report dead-letter mechanism. National resilience needs separate workload and outage evidence.

Sources: [Implemented behaviour at the briefing baseline](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/CURRENT_BEHAVIOUR.md), [Swarm scenarios and accounting](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/apps/about/src/app/swarm/page.tsx).

## 13. A second service owns its integration

The council owns its catalogue, credential and case records.
It uses the generic consent and authority contract and checks case ownership itself.

### Speaker notes

Demonstrate independent council permission, read CASE-SAM, reject CASE-OTHER, then revoke council access while retaining HMRC. Council is read-only and has no queue or write approval. No council-specific Delegate application code was required. Shared simulator subjects simplify identity matching. Production pairwise correlation remains issue 35.

Sources: [Independent council integration](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/SECOND_SERVICE.md).

## 14. Observation has different strengths


| Evidence | Limit |
| --- | --- |
| Verified request and grant | Proves supported identity/authority facts |
| HTTP / browser / behaviour signals | Coverage varies by route and device |
| Classifier output | Depends on features, thresholds and validation |
| Protected execution label | Describes the enrolled research run |

### Speaker notes

Demo C: start in monitoring view, inspect a source event and its outcome. Sensor absence is visible. Research labels require separate evaluation access. Frozen evidence/configuration and append-only results support repeatable review in PR 109. The signature-observation stub cannot tell a hidden AI agent from a human browser. Training and signal ablation remain future work.

Sources: [Observatory dashboard, PR 110, unmerged at preparation](https://github.com/sighmoan1/govuk-delegate-starter/pull/110), [Blind classifier contract, PR 109, unmerged at preparation](https://github.com/sighmoan1/govuk-delegate-starter/pull/109), [Protected execution ledger](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/observatory/GROUND_TRUTH.md), [Real vendor validation still outstanding, issue 68](https://github.com/sighmoan1/govuk-delegate-starter/issues/68).

## 15. Contemporaneous observations

Tom's WhenIsBins work observed existing agents using a live service.
Observatory supports repeatable collection and inspection in a controlled synthetic service.

### Speaker notes

Tom describes one tester and a small account sample. We should compare equivalent agents, tools and routes. More regression checks establish software coverage, while agent generalisation requires diverse real runs. Multi-signal improvements remain a testable proposal. Correlated weak clues may add little.

Sources: [Tom Loosemore: How Agents Show Up, 9 October 2026](https://loosemore.com/2026/10/09/how-agents-show-up-what-muse-and-other-agents-reveal-when-they-use-whenisbins/), [Blind classifier contract, PR 109, unmerged at preparation](https://github.com/sighmoan1/govuk-delegate-starter/pull/109), [Existing exploratory route observations](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/apps/about/src/app/which-route/page.tsx).

## 16. Centralisation and standards remain open


| Question | Options for discussion |
| --- | --- |
| Authority records | Central, departmental or hybrid issuers |
| Verification | Online checks, portable proofs or a hybrid |
| Shared standards | Minimum contract with service-owned semantics |
| Existing standards | Consume suitable identity/authority evidence |
| Citizen view | Combine grants with explicit provenance |

### Speaker notes

Distinguish prototype implementation from national commitment. The current lookup offers straightforward revocation semantics but creates an availability dependency. Federated records could preserve existing departmental authority, while requiring issuer trust, outage semantics and identity matching. Shared catalogue syntax does not settle semantic governance. Request service and platform owner input before selecting a production model.

Sources: [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md), [Architecture and ownership](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/ARCHITECTURE.md).

## 17. Conditions for a useful trial

Choose a concrete service task and establish what authority the department can recognise.
Measure citizen effort and access failures, agent adoption, unexplained activity and investigation effort.

### Speaker notes

The hypothesis predicts many well-behaved agents use Delegate and reduce observation burden. Measure adoption and residual work together. Include incompatible tools and authorised misuse. Compare an equally capable service-local delegation route. Establish approval/redress, legal recognition, retention and responsible owners before any real-person consequential action. The pilot proposal is unapproved, and the 500-case corpus does not yet exist.

Sources: [Participant pilot proposal, PR 108, awaiting approval](https://github.com/sighmoan1/govuk-delegate-starter/pull/108), [Recorded E2 comparison and preserved raw records](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/evidence/RUN-20261009-E2-01.md), [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).

## 18. Questions for service and platform owners

Which actions can use standing permission, and which need approval of the precise act?
Which existing authority sources should Delegate recognise?
Which minimum evidence and service contract would make participation worthwhile?

### Speaker notes

Invite specific examples and owners. Capture disagreements as open questions with evidence needed and a trigger for revisiting. Do not turn audience interest into acceptance of the prototype's national legal, security or architecture positions. Pair the discussion with a limited next experiment.

Sources: [Open national decisions](https://github.com/sighmoan1/govuk-delegate-starter/blob/6b4f3895f246cfe9e274059c57e4dc1ea7989650/docs/DECISION_BACKLOG.md).
