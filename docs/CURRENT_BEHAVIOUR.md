# Current synthetic prototype behaviour

This is the implemented-state entry point. `BUILD_SPEC.md` and `PROTOTYPE_CONTENT.md` preserve the original brief; numbered decisions preserve history. `ARCHITECTURE.md` describes the target boundary, including features still awaiting engineering. No real citizen, bank, address or departmental records are used.

## Applications and integration

One Login authenticates people using the official simulator behind lookalike screens. Delegate manages requested and approved permissions, representative identity, scoped subdelegations, expiry and revocation. Mock HMRC owns transactions, domain rules, idempotency, technical throughput and its durable queue. About explains and runs synthetic scenarios.

HMRC's full integration includes authority checks; agent-request creation/polling; agent sessions; browser permission guards; discovery documents; domain and traffic controls; receipts, dispute reconciliation and outcome reporting. `delegated-authority.ts` is the core API wrapper within that wider work. Pages, business handlers and state storage also support the integration.

Eight capabilities are seeded. The browser request form offers seven, omitting `change_address`; the registered-agent API supports address changes. No unsupported action is implied by this difference.

## Service catalogues

A registered service can publish bounded catalogue documents with its own credential. Delegate retains immutable, version-addressable history and exposes safe public discovery. Publication is idempotent for identical content and rejects version conflicts, malformed metadata and weak high-risk declarations. It creates no citizen authority. Catalogue adoption preserves historical permission IDs, names and security settings; equivalent legacy rows receive presentation metadata on first registration.

HMRC definitions are owned by its versioned catalogue and registered through the authenticated publication handler during bootstrap. New requests use the latest publication; pending consent and grants retain their existing capability IDs. Citizen reset preserves all catalogue history; generic consent (#30), immutable consent snapshots (#31), richer enforceable constraints (#32) and a second mock service (#33) remain separate work. See [SERVICE_CATALOGUES.md](SERVICE_CATALOGUES.md).

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

Scheduling belongs to the external agent/platform. The prototype provides polling endpoints; it has no scheduler, push subscription or webhook. Progress supports `since`, a person-bound ETag and conditional `304`, `observed_at`, and a suggested interval. A 304 still costs a poll; all responses are private/no-store. A stale dispute read cannot become a 304. The integration of #63 with #61 reuses the request transaction for progress/status reads, avoiding second-connection pool starvation.

Scenario 4 separately counts legitimate distinct claims, duplicate effects, technical requests/checks, throttles, queue wait and worker time. Seeded simulation is labelled separately. Its bounded workload does not prove universal equality of lanes, provider fairness, national scalability, fraud reduction or economic benefit.

Account detail shows at most ten recent permission checks and twenty service outcomes, without pagination. Receipts and activity are distinct from consent evidence and legal proof.

## Running and walkthroughs

For local development copy `.env.example` files, start database/simulator, install dependencies, then `npm run db:migrate --workspaces --if-present`, `npm run db:reset` and `npm run dev`. Database tests need an isolated database. Stop the queue worker during HMRC tests that control jobs; restart it for the root HTTP/swarm tests.

Local sign-in accepts the prefilled Sam email (other emails create separate synthetic people) and any nonempty password. Public/strict mode accepts Sam's email, validates the configured password and requires the mock phone code. “Continue twice” applies only locally.

Scenarios 1 and 2 have reset controls. Route-choice findings display recorded observations without reset. The swarm runner creates fresh people. Public About links default to localhost and are unreachable remotely; configure `ABOUT_URL` only with a suitable explanatory site and keep local reset/phone tooling private.

Remaining production issues include pairwise identity mapping, catalogue governance, lawful authority, assurance, retention, resilience and proportionate inclusion/access policies. See `DECISION_BACKLOG.md` and the validation/evidence register.
