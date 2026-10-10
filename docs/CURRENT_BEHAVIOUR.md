# Current synthetic prototype behaviour

This is the implemented-state entry point. `BUILD_SPEC.md` and `PROTOTYPE_CONTENT.md` preserve the original brief; numbered decisions preserve history. `ARCHITECTURE.md` describes the target boundary, including features still awaiting engineering. The core GOV.UK/HMRC/council journeys use synthetic identities and records; optional controlled external WhenIsBins acceptance is described separately below.

## Applications and integration

One Login authenticates people using the official simulator behind lookalike screens. Delegate manages requested and approved permissions, representative identity, scoped subdelegations, expiry and revocation. Mock HMRC owns transactions, domain rules, idempotency, technical throughput and its durable queue. About explains and runs synthetic scenarios. The separate Observatory researches observations and the independent council service demonstrates reuse of the same consent/authority contract. These are the six core apps.

HMRC's full integration includes authority checks; agent-request creation/polling; agent sessions; browser permission guards; discovery documents; domain and traffic controls; receipts, dispute reconciliation and outcome reporting. `delegated-authority.ts` is the core API wrapper within that wider work. Pages, business handlers and state storage also support the integration.

Eight capabilities are seeded. The browser request form offers seven, omitting `change_address`; the registered-agent API supports address changes. No unsupported action is implied by this difference.

## Service catalogues

A registered service can publish bounded catalogue documents with its own credential. Delegate retains immutable, version-addressable history and exposes safe public discovery. Publication is idempotent for identical content and rejects version conflicts, malformed metadata and weak high-risk declarations. It creates no citizen authority. Catalogue adoption preserves historical permission IDs, names and security settings; equivalent legacy rows receive presentation metadata on first registration.

HMRC definitions are owned by its versioned catalogue and registered through the authenticated publication handler during bootstrap. New requests use the latest publication; pending consent and grants retain their existing capability IDs. Citizen reset preserves all catalogue history. Generic consent renders the requested service's pinned definitions, starts unchecked and rejects empty approval. See [SERVICE_CATALOGUES.md](SERVICE_CATALOGUES.md).

Approval atomically stores immutable original consent evidence, including displayed copy, catalogue identity/version/digest, selected permissions, representative and expiry. Later narrowing and revocation append history; old grants receive no invented retrospective evidence. Access audits and prototype erasure rules are documented in [CONSENT_EVIDENCE.md](CONSENT_EVIDENCE.md).

Bounded service-defined enum restrictions retain catalogue provenance. Citizens and subdelegates can narrow values; malformed, unsupported or wider restrictions fail closed. Delegate performs structural checks and live chain intersection. HMRC owns the tax-year meaning and verifies its actual synthetic target before any business effect. Plain historical grants acquire no defaults. See [MANDATE_CONSTRAINTS.md](MANDATE_CONSTRAINTS.md).

The independent synthetic council service on port 3305 owns its catalogue, credential, local case records and ownership rule. It uses the same generic consent and check contract without council-specific Delegate application code. HMRC and council grants/revocations are independent. The simulator's shared subject remains a simplification, not proof of production identity mapping; see [SECOND_SERVICE.md](SECOND_SERVICE.md).

## Approval, answers and revocation

An authorised agent with `respond_to_query` may send an answer without declaring agreement. `confirmed_by_person` is optional and records the agent's assertion; it is not verified evidence of agreement. HMRC returns `person_approval` as `PERSON_SUBMITTED`, `AGENT_ASSERTED` or `NOT_DECLARED`. The person can inspect and dispute the receipt.

Delegate records a dispute and removes that permission. HMRC discovers the dispute on a later receipt-status read and reopens the question then. This is pull-based reconciliation, not an immediate notification. If the check is unavailable, HMRC reports `dispute_check: UNAVAILABLE`; it does not claim nothing was disputed.

Sensitive refund-account and address changes need approval of one canonical proposal binding mandate, person, service, capability, normalised payload, client key and expiry. The default `STEP_UP_MAX_AGE_MINUTES` is 10 from proposal creation; approval does not extend it. The exact deadline is inclusive. A check reads approval without consuming it; HMRC reserves it after admission and reports completion to redeem it. Refusals leave approval available; leases recover abandoned reservations. Different content or a new key needs new approval. Retries return the stored result. These are synthetic mechanics, not an approved legal sign-off policy or real validation of the details (Decision 24; #38).

Removal prevents subsequent authorised requests. Work durably accepted while permission existed still gets processed; revocation is prospective and cannot undo completed work (Decision 25).

## Domain policy, throughput and duplicate handling

Delegate checks spend no citizen service allowance. HMRC's business rules follow the person. Technical controls are separate and may apply to operator, person or service and cost class. `409 BUSINESS_REFUSAL` differs from `429 TECHNICAL_THROTTLE` or `503 UNAVAILABLE`, which carry retry guidance. Demo numerical limits are illustrative; they are not eligibility law or approved policy.

`Idempotency-Key` is honoured for claims, answers, refund-account and address changes. Same person, operation, key and normalised payload returns the original outcome with `Idempotent-Replayed: true`; different content with that key gives 409. Keys are 1–128 visible ASCII characters without spaces. Employment updates do not support transport idempotency. “New evidence” compares fingerprints of trimmed, lowercased strings, not substantive relevance or materiality.

`Prefer: respond-async` on claims requires a key. `202` is sent after the job/receipt and idempotency result commit. `Location` identifies the person's status receipt: QUEUED, PROCESSING, COMPLETED (recorded for review, not approved), or FAILED. A storage failure must not promise receipt; retry with the same key resolves an uncertain commit. Prototype `received_at` is not proof of a statutory filing date.

## Polling and visibility

Scheduling belongs to the external agent/platform. Delegate and HMRC provide polling endpoints; they have no scheduler, push subscription or webhook. The separate agent-owned WhenIsBins runner is described below. Progress supports `since`, a person-bound ETag and conditional `304`, `observed_at`, and a suggested interval. A 304 still costs a poll; all responses are private/no-store. A stale dispute read cannot become a 304. The integration of #63 with #61 reuses the request transaction for progress/status reads, avoiding second-connection pool starvation.

Scenario 4 separately counts legitimate distinct claims, duplicate effects, technical requests/checks, throttles, queue wait and worker time. Seeded simulation is labelled separately. Its bounded workload does not prove universal equality of lanes, provider fairness, national scalability, fraud reduction or economic benefit.

Account detail shows at most ten recent permission checks and twenty service outcomes, without pagination. Receipts and activity are distinct from consent evidence and legal proof.

## Running and walkthroughs

For local development copy `.env.example` files, start database/simulator, install dependencies, then `npm run db:migrate --workspaces --if-present`, `npm run db:reset` and `npm run dev`. Database tests need an isolated database. Stop the queue worker during HMRC tests that control jobs; restart it for the root HTTP/swarm tests.

Local sign-in accepts the prefilled Sam email (other emails create separate synthetic people) and any nonempty password. Public/strict mode accepts Sam's email, validates the configured password and requires the mock phone code. “Continue twice” applies only locally.

Scenarios 1 and 2 have reset controls. Route-choice findings display recorded observations without reset. The swarm runner creates fresh people. Public About links default to localhost and are unreachable remotely; configure `ABOUT_URL` only with a suitable explanatory site and keep local reset/phone tooling private.

Remaining production issues include pairwise identity mapping, catalogue governance, lawful authority, assurance, retention, resilience and proportionate inclusion/access policies. See `DECISION_BACKLOG.md` and the validation/evidence register.

## Observatory research boundary

The independent `apps/observatory` workbench serves a synthetic-research disclaimer and implementation status on port 3303. `GET /api/health` checks its own migrated research-workspace table and returns 200 when ready, otherwise a redacted 503. It uses a separate Prisma client, database and login; explicitly enabled synthetic read-only feeds and an authenticated research-only sensor collection endpoint are available; a protected monitoring/research dashboard and versioned blind classification contract with a deterministic signature-evidence test stub are implemented. HMRC and Delegate decisions do not depend on Observatory. Public tunnel scripts do not expose Observatory. The collection default is disabled. This workbench publishes no study result or automation performance claim. See [setup](observatory/SETUP.md).

Separate evaluator and collection credentials protect research labels. One-use enrollment binds opaque sessions; sensors receive no actor class. Archived scripted runs require original trace/digest checks and independently audited effects. Unlabelled monitoring counts observed requests without inventing execution truth or durable effects. The audited archive reports zero human participant runs; actual participant collection remains #71.

The optional Fingerprint adapter runs only after explicit study opt-in and protected enrollment. It records coverage states and pseudonymised identifiers separately from service events. Missing configuration and vendor/Observatory failures do not alter authority or business decisions. Real vendor execution remains unvalidated in this delivery environment; returned client identifiers require separate server verification before being labelled vendor-verified. A device signal never supplies an execution label. See [FINGERPRINT_SENSOR.md](observatory/FINGERPRINT_SENSOR.md).

The classification adapter currently accepts HMRC/Delegate source evidence only. Its deterministic stub reports recorded signature evidence and abstains where evidence is missing; it does not classify human or AI execution. Frozen observations/configurations and append-only classification runs remain separate from protected evaluator truth. There is no trained statistical detector or validated accuracy result. See [classification contract](observatory/CLASSIFICATION_CONTRACT.md) and [dashboard boundaries](observatory/DASHBOARD.md). The [participant pilot](observatory/PARTICIPANT_PILOT.md) remains a proposed protocol requiring owner approval before recruitment, not a launched study.

## Optional WhenIsBins connector

The separately configured `apps/whenisbins` connector (default port 3310) is additional to the six core apps. Its scoped one-off lookup checks current Delegate authority before upstream work, validates provider results and records the connector outcome. It is our integration around WhenIsBins, not native Delegate recognition by the upstream service. The GOV.UK identity and HMRC/council records remain synthetic; controlled external acceptance is separately recorded in [repository status](REPOSITORY_STATUS.md). See [connector setup](whenisbins/CONNECTOR.md).

The optional `packages/whenisbins-runner` persists explicitly agreed daily/weekly lookup jobs and offers pause/resume/stop controls. Its separately started foreground worker acquires fresh agent credentials and invokes the connector for every occurrence/retry; the connector rechecks current authority. Queued/partial results remain pending and durable replays are counted separately. The runner neither creates authority nor installs an unattended process, and it is not a Delegate or hypothetical Orchestrate scheduler. See [agreement, recovery and worker limits](whenisbins/SCHEDULER.md).

Native signup/activation and the combined presenter delivery distinguish independent mailbox evidence, exact-action authority and durable uncertain outcomes. Following the owner-approved delivery split, real cancellation remains unverified and disabled in [parked follow-up #132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132). The test subscription remains active; revocation does not unsubscribe it. Fixture cancellation remains regression coverage. Source delivery and the separately recorded public runtime must be assessed independently; see [repository status](REPOSITORY_STATUS.md).

The optional connector research feed uses a distinct version-two source and source-scoped pseudonyms; HMRC/Delegate version-one feeds remain compatible. Its protected `/whenisbins` view separates source event/stage counts from distinct request/task/occurrence/outbound/effect identifiers. These describe connector observations, not verified effects, email delivery or upstream visitors. Connector evaluation bindings remain REQUEST_ONLY, and the classifier contract stays scoped to HMRC/Delegate. See [feed and evidence boundaries](whenisbins/OBSERVATORY.md).
