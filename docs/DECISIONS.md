# Technical and product decisions

## Decision 1 — Copy HMRC's authorisation lifecycle first

**Decision:** model the MVP around an authorisation request and persistent relationship, not around a novel AI-agent credential.

Why:

- HMRC already uses an agent-request / client-approval pattern in production;
- the relationship can be queried and removed;
- it separates the agent's identity from the client's identity;
- this makes the prototype easier to defend as an extension of an existing government pattern.

## Decision 2 — One Login authenticates the principal; Delegate manages authority

One Login answers:

> Who is this user?

Delegate answers:

> Who may act for this user, for which service, and to do what?

Do not overload the prototype by pretending One Login itself currently provides the delegation relationship.

## Decision 3 — Model a generic delegate

Do not create an AI-specific core entity.

Use:

```text
PERSON
ORGANISATION
SOFTWARE_AGENT
```

AI is the forcing use case, not the domain model.

## Decision 4 — Service-defined capabilities

A government service remains responsible for defining the actions it supports.

Delegate records which of those capabilities the principal grants.

Example:

```text
DWP Benefits Demo
├── check_claim_status
├── submit_evidence
├── report_change
├── change_payment_details
└── withdraw_claim
```

This prevents Delegate becoming a central business-rules engine.

## Decision 5 — Relationship lookup before portable credentials

For the MVP, the receiving service asks Delegate whether the relationship is active and covers the requested capability.

This makes revocation obvious and keeps the proof aligned with HMRC's relationship-based model.

A later iteration can investigate signed delegation credentials, OAuth token exchange, capability tokens or caching if scale requires them.

## Decision 6 — Trusted lane is an incentive structure, not a moral label

"Trusted" means identity and authority have been established to the required level.

It does not mean the actor is good, truthful or incapable of fraud.

Authorised agents remain subject to service rules, fraud controls, transaction limits and monitoring.

## Decision 7 — Unknown is not the same as malicious

Traffic outside the trusted lane may include:

- humans who have not authenticated;
- people facing accessibility or identity barriers;
- assistive technology;
- legitimate agents that have not integrated yet;
- hostile automation.

Controls should therefore be proportionate and provide routes for legitimate actors to become trusted.

## Decision 8 — Do not make AI-text detection part of the core

AI-content detection is too uncertain to be the authorisation mechanism.

Canaries, behavioural analysis and classifiers may be useful for aggregate research into activity outside the declared channel, but they are separate from the core delegation service.

## Decision 9 — Keep DWP mocked

Do not depend on access to Universal Credit or other real DWP systems.

The mock DWP service exists to prove that a receiving service can make an independent ALLOW/DENY decision from Delegate's relationship state.

## Decision 10 — Preserve the supplied design system

Use `styles/design.css` as supplied for the prototype's visual language.

The file contains project-specific classes from its source context as well as useful shared typography, colour, focus, form, table, responsive and accessibility rules.

For this prototype:

- reuse the core tokens and primitives directly;
- add new Delegate-specific classes only where necessary;
- do not delete existing accessibility behaviour;
- avoid unnecessary redesign before the end-to-end flow works.

## Decision 11 — Demo as a real agent, HMRC, and Delegate as a platform

**Decision:** change three things in the prototype from the original brief (`BUILD_SPEC.md` and `PROTOTYPE_CONTENT.md` are kept unchanged as the brief).

1. **The visitor plays only the person.** The agent is a separate app (`/example-ai`) that acts by itself. With `ANTHROPIC_API_KEY` set it runs on Claude, using tool use. Without a key it runs a scripted agent that uses the same tools. In the first version the visitor had to operate the agent by hand, which made the journey confusing.
2. **Delegate is presented like One Login, not as a destination.** People meet it in two places. The first is a GOV.UK consent screen reached by redirect from the agent, with registered return URLs as for an OAuth client. The second is account settings: "Who can act for you". The relationship check is unchanged: HMRC asks Delegate on every request.
3. **HMRC, not DWP.** Claiming tax relief for working from home is a familiar, simple task, and HMRC agent authorisation is the pattern we copy. The service-defined capabilities are `view_tax_code`, `claim_job_expenses`, `update_employment`, `change_refund_account` and `change_address`.

The model is never trusted to enforce authority. It can try any tool, and HMRC refuses anything Delegate does not cover. On return from consent, the agent checks the outcome with Delegate and does not trust the callback URL.

Approving a new request replaces the active relationship for that person, agent and service. When an agent asks for an extra permission, it therefore asks for what it already holds plus the new one.

## Decision 12 — Four separate systems; the incentive contrast at the centre

**Decision:** run the prototype as four services that talk only over HTTP. This supersedes the single-app structure in Decision 11; its other points (HMRC as the use case, Delegate met in context and managed in account settings) stand.

| System | Port | Database |
|---|---|---|
| GOV.UK One Login simulator (official image) | 3301 | — |
| GOV.UK Delegate | 3300 | `delegate` |
| Mock HMRC: Claim tax relief for working from home | 3302 | `hmrc` |
| Example AI (agent) | 3303 | `agent` |

Why: in one app the boundaries were invisible, so the claim "a service needs to add very little" could not be seen. Now HMRC's whole integration is one file (`apps/hmrc/src/lib/delegated-authority.ts`) and one registration, and its operations page shows that file.

**The check API is the one call a service makes.** `POST /api/authorisations/check` with the service's own key, the agent's token, the principal id and the capability. Delegate verifies the agent itself, so services never handle agent credentials beyond passing them on. Delegate logs every check. It returns the person's One Login subject only when the answer is yes.

**The join key is the One Login subject.** HMRC knows its customer by the subject it saw at sign-in, and Delegate returns the same subject. Real One Login issues pairwise subjects per relying party (or sector), so production would need Delegate and the service in a shared sector, or a mapping held by Delegate. Not built.

**The simulator supports one client**, so Delegate and HMRC share its client id and key here. In production they would be separate relying parties.

**Three lanes at the service.** These are a signed-in person, an authorised agent and not identified. The friction on the last lane is a stand-in, labelled as such: 5 requests a minute, a 1.5 second delay, plain-text refusals that point to Delegate, and a checkbox challenge page on the website. It demonstrates the incentive. It is not abuse infrastructure, and "not identified" is not treated as malicious.

**The agent is a scripted task runner, not a chat.** The LLM had become the focus. The demo is about delegation and the service's response, and a step log with the HTTP behind each step shows that more honestly.

## Decision 13 — The services are mock-ups; the explanation lives on an about site

**Decision:** the four systems look like the real things and say nothing about the demo. Each has only a "Prototype · About this prototype" line, as a real GOV.UK prototype would. A fifth app, the about site (:3304), holds the case, the systems, the demo script, how it works (including HMRC's integration code), the precedents and a demo console.

Why: explanatory copy inside the journeys made them look like a demo of a demo, and hid what the services themselves would be like.

Consequences:
- GOV.UK Delegate has no front page. Its root goes to "Who can act for you" in the GOV.UK account, and consent goes straight to One Login sign-in.
- HMRC's operations page and Delegate's are plain internal dashboards.
- Example AI is a consumer assistant: a conversation and a "Connected services" page. The flood and unregistered-bot runs move to the about site's console. The console asks Example AI, through a small internal endpoint, to send its burst as itself.
- Seeded data uses realistic names (Sam Taylor, Northwind Analytics Ltd). "Synthetic" is stated on the about site.

## Decision 14 — One Login sign-in screens in front of the official simulator

**Decision:** people see a GOV.UK One Login-style sign-in, "Enter your email address" then "Enter your password", served by `apps/onelogin` on :3301. The official simulator runs behind it (internal, :3399) in non-interactive mode and still does all the OpenID Connect work. When someone signs in, the sign-in app sets the simulator's response for that email through its config API, then lets the simulator complete the authorisation-code redirect. Discovery, keys, token and userinfo are proxied unchanged, and the issuer is still the simulator's.

Why: the simulator's interactive form, which shows subject IDs, identity JSON and a "Continue" button, is a developer tool, and it dominated the journey.

Consequences: any password works. `sam.taylor@example.com` (pre-filled) is the seeded person, and any other email is a stable, different person. Sign-ins are serialised through the simulator's single response configuration, which is fine for a one-person demo. The simulator's `/config` is not exposed publicly.

## Decision 15 — Three scenarios, each with its own reset

**Decision:** the about site presents three independent scenarios instead of one linear script:
1. Sam asks her assistant to claim tax relief.
2. Sam manages who can act for her.
3. Government prioritises people and authorised agents.

Each scenario page resets all three services from the UI, to either "clean" or "Example AI already connected". The services expose `POST /api/demo/reset`, protected by the demo key, which runs the same seed function as `npm run db:reset`. The flood console is part of scenario 3.

Also: Delegate's check API now remembers service keys that have already verified, keyed on their SHA-256. Running scrypt on every request serialised 40 concurrent checks into about 1.5 seconds, which made the authorised agent look slower than the throttled bot.

## Decision 16 — Identify the agent. Authorise the mandate. Limit the principal.

**Decision:** three questions are kept apart, in the code and in the story.

| | Question | Decided by | Can it be faked or hidden? |
|---|---|---|---|
| Identity | Who or what is making the request? | A Web Bot Auth signature, registered credentials, or self-declaration | Yes: an agent in the person's own browser looks like the person |
| Authority | What has the person allowed it to do? | A GOV.UK Delegate mandate, checked per request | No |
| Business limits | How much may everyone using this person's authority do, together? | The service that performs the action (HMRC), keyed to the person | No: keyed to the person |

- **Detection is evidence, not the security boundary.** Identity decides what an agent may do and whether it is shown the proper route (a known agent with no permission is redirected to "Act for someone", not blocked). It never confers extra allowance. The service's business limits work when detection fails.
- **Root principal → mandate → delegation chain → transaction.** Every check and every HMRC transaction records the person, mandate, delegation, parent, depth and agent. Sub-delegation can't widen capabilities and is limited in depth.
- **Business limits follow the person; Delegate's check is not one of them.** HMRC keys its rules by One Login subject: one working-from-home claim per tax year (more only with materially new evidence), open cases, refund-account changes. They are counted when HMRC performs or admits a transaction, never when someone merely asks whether an agent may act. Delegate's check proves identity, a live mandate, the capability and (for sensitive actions) assurance, and spends nothing. Delegate keeps no per-person action counter, and check responses carry no "capacity used" figure. A person with 100 agents, or 100 hidden sessions, gets what a person with one agent gets. Scenario 5 shows it, and `tests/swarm.test.ts` proves it.
- **Technical demand management is separate from business constraints.** Protecting the check endpoint from overload (per-service throttling, back-pressure, 429/503 with `retry-after`) is about availability and is not a statement about what a person may do. It must be keyed to the calling service or network, never decremented from a person's allowance, and a throttled check is a retryable failure, not a refusal of authority. This prototype does not yet implement it for the check API (follow-up). Every check, allowed or denied, is still logged. The earlier per-person `agent_actions_per_hour` counter in Delegate was removed because it charged people for retries and for requests HMRC later refused on business grounds, and mixed rights, identity and throughput.
- **Assurance limits actions, not volume.** Sensitive actions need a verified or registered agent, plus the person's fresh approval each time. Declared (self-asserted) agents can't make them.
- **Access policy by surface.** Public information and agent discovery stay open to everyone. Transactions need a person or an authorised agent. An honest, signed agent is never worse off than a disguised one: it gets a structured API and clear errors, where a disguised one gets none of that and no attribution.
- **Agents can't approve themselves.** The device-code approval is refused for requests that carry an agent signature.

Why: the first live runs (Scenario 4) showed an agent that sends no identity looks exactly like a person, so a design that depends on detecting agents can't hold. What does hold is who the business limits belong to.

Consequences: limits are illustrative, chosen to make the demo legible, not policy. Page text alone didn't steer an unidentified agent to the proper route in the runs so far; verifiable identity (a signature) is the stronger lever, which is why the route is offered to every agent but only signed ones can be held to it.

## Decision 17 — Example AI removed

**Decision:** the scripted Example AI app (`apps/agent`, :3303) is gone. Real agents (ChatGPT, TinyFish and others) now drive the demo through HMRC's and Delegate's public routes, so the stand-in is no longer needed. Earlier decisions that describe it stand as history.

- Scenario 1 (Sam asks her assistant) and the Example AI burst in the traffic scenario are removed. Scenarios are renumbered 1–4.
- Delegate still seeds one registered agent, now called "Personal assistant", because the swarm runner, the tests and the "Who can act for you" starting point need a registered client. Its registered return URL is a placeholder (`https://assistant.example/callback`); no app listens there.

## Decision 18 — Four things to ask an agent

**Decision:** the demo is driven by a real agent the visitor already uses. The visitor plays Sam and asks it to do one of four things at HMRC: read where a claim is, submit a claim, answer a question HMRC has asked, or keep checking progress.

- New capabilities: `view_claim_status`, `respond_to_query`, `check_claim_progress` (endpoints `/api/claims`, `/api/claims/respond`, `/api/claims/progress`). HMRC raises one question when the first working-from-home claim is submitted.
- **Answers are confirmed in the agent's chat, not on GOV.UK.** The agent sends `confirmed_by_person: true` only after showing the person the wording; HMRC refuses (428 `CONFIRMATION_REQUIRED`) without it and records it. This is weaker evidence than a Delegate step-up, and cheaper for the person. Step-up stays for the high-risk capabilities.
- **Scheduled checks are polled, not pushed**, so they work with chat platforms that cannot receive webhooks. The mandate's end date bounds the schedule, and HMRC allows 4 checks a day per person (`claim_progress_checks_per_day`), keyed to the person like every other business limit. Removing access stops the next check. The cap lives at HMRC, not in Delegate's grant, to keep Delegate's schema unchanged.

## Decision 19 — The person can see what an agent said they agreed to, and undo it

**Decision:** the confirmation in Decision 18 is the agent's word, so the person gets a way to check it.

- **Receipts.** When an agent answers HMRC's question, HMRC tells Delegate (`POST /api/receipts`, service key) the exact words and whether the agent said the person agreed. The agent's page in "Who can act for you" lists them under "What it said you agreed to", and the account page shows a notice until they are seen.
- **"I didn't agree to this."** Delegate marks the receipt disputed and removes that capability from the authority. HMRC asks Delegate (`POST /api/receipts/status`) when the claim is read, and if the receipt is disputed it reopens the question and flags the earlier answer as withdrawn. Delegate never calls HMRC, so the services still only ask Delegate.
- **"Stop this".** The person can take away one permission without removing the rest. Existing delegations to sub-agents lose it too.
- **The nudge.** HMRC's responses to an authorised agent carry `tell_the_person`, and `llms.txt` and the OpenAPI text say the same. It is a prompt, not a control. The control is that the record is shown to the person whether or not the agent mentions it.

Not built: real email or SMS. The "notice" is an in-account banner, which depends on the person opening their account.

## Decision 20 — Agreement is a recorded declaration, not a gate

**Decision:** Decision 18's `confirmed_by_person` is no longer required. HMRC accepts an answer from an approved agent with the permission, records whether the agent said the person agreed, and Delegate's receipt shows the person which it was ("told HMRC you agreed" or "sent this and did not say whether you had agreed"). The browser form's checkbox is gone.

Why: HMRC can't see the chat, so the flag was the agent's own word and stopped nothing, while it refused honest, authorised, identified agents on a technicality. Friction belongs on traffic that won't identify itself. The controls that do work are the permission the person grants, the Delegate check, per-person limits, the log, and the receipt with its dispute button. This supersedes the "428 CONFIRMATION_REQUIRED" behaviour in Decision 18.

## Decision 21 — One client operation, at most one committed business transaction

**Decision:** HMRC's mutating submissions are idempotent and atomic. This is HMRC's own behaviour: nothing is added to GOV.UK Delegate.

- **Same attempt.** `POST /api/job-expenses` and `POST /api/claims/respond` honour an `Idempotency-Key` header. HMRC keeps an `idempotency_record` row, unique by person (One Login subject) + capability + key, with a digest of the normalised payload, the first response and its reference. The same key with the same payload returns the original result, flagged `idempotent_replay` (header `Idempotent-Replayed: true`), and runs nothing. The same key with a different payload is 409 `IDEMPOTENCY_KEY_REUSED`; nothing is overwritten. Keys are per person, not per agent, so two agents using one key share one outcome.
- **Equivalent claim, different key.** Not a retry. It meets the business rules in `domain-policy.ts` as before (one claim per tax year, new evidence for an amendment, one answer per question). Legal eligibility, amendment rights and claim statuses are unchanged; a queued claim is never marked approved.
- **Atomic.** The idempotency lookup, the capacity rules, the business handler and the record are one database transaction, under the person's advisory lock, with the unique index as the backstop. Handlers receive that transaction's client; they no longer write through the global client.
- **Crashes and timeouts.** There is no PENDING status. An attempt that dies before commit rolls back completely (no claim, no record, no tax code change), and its retry is a first try. An attempt that commits has its record. So there is no success without a durable record and no record stuck in progress. Refusals are not recorded: a retry re-evaluates.
- **Website forms.** The claim and answer forms carry a hidden `submission_id`, created when the page is rendered and used as the key (`form:<id>`). Pressing the button twice or resending the form is one submission. A form without one still works and is covered by the business rules.

Not done: other mutating routes ignore the header; the claim-status read path still reopens disputed answers with the global client; records are kept indefinitely (a retention window would be added with a real store).

## Decision 22 — Step-up approval is time-limited and covers the next use, not a transaction

**Superseded by Decision 24.** Kept as history. Issue #38 limited an approval to `STEP_UP_MAX_AGE_MINUTES` (default 10) after `approvedAt`, with an inclusive boundary, and said plainly that it was not bound to a transaction. Issue #37 made its consumption at the check a compare-and-set. Decision 24 binds the approval to one proposed change and spends it only when the service reports the change made. The window value and its name carry over unchanged; the inclusive boundary is kept.

## Decision 23 — Business rules and traffic limits are separate code, separate answers, separate metrics

**Decision:** `capacity.ts` is split. What HMRC will accept and how fast it will take requests are different questions, answered in different files, with different HTTP statuses, different response `kind`s and different log classes.

| | File | Question | Answer | Retry? |
|---|---|---|---|---|
| Domain policy | `domain-policy.ts` | Is this transaction permissible for this person? | 409 `DUPLICATE_SUBMISSION`, `NEW_EVIDENCE_REQUIRED`, `CAPACITY_EXCEEDED`; 404 `QUERY_NOT_FOUND`; 400 `INVALID_REQUEST` (`kind` `BUSINESS_REFUSAL` or `REQUEST_ERROR`) | No: waiting does not change it |
| Throughput | `throughput.ts` | Can HMRC take this request right now? | 429 `RATE_LIMITED` (`TECHNICAL_THROTTLE`) or 503 `SERVICE_UNAVAILABLE` (`UNAVAILABLE`), both with `Retry-After` | Yes: the same request, unchanged |
| Identity and permission | Delegate check, `delegated-authority.ts` | Who is asking, and may they? | 401/403 (`AUTHORITY_REFUSAL`) | Not without changing the permission |

`operation.ts` only sequences them (admit the request, take the person's lock, check domain rules, run the handler, record the idempotency key). It holds no rule.

- **`CAPACITY_EXCEEDED` means a business refusal and only that.** It is now 409, not 429. It is returned for `max_open_cases` and `refund_account_changes_per_30_days`. Tax-code lookups and progress checks, which used to return it, are throughput limits and return `RATE_LIMITED`.
- **Throttle bodies are machine-readable:** `reason`, `kind`, `scope` (`operator`, `principal` or `service`), `cost_class`, `operation`, `rule`, `limit`, `window_seconds`, `retry_after_seconds`, `resets_at`, `retryable: true` and `entitlement_affected: false`, with `Retry-After` and `X-RateLimit-*` headers. A throttled request changes nothing and spends none of the person's business allowance.
- **Limits are explicit, by cost class and scope** (`throughput.ts`, per minute, illustrative). Cost classes: `read` (claim status), `status_poll` (scheduled progress check), `write` (claim, answer, employment, refund account, address) and `expensive_query` (tax code lookup, standing in for a costly back-end query). Scopes: *operator* (the agent provider, by Delegate agent id, or a person's own session; one provider acting for many people shares one budget), *principal* (the person, whoever or however many act for them) and *service* (all of HMRC). The earlier per-lane totals (600 a minute for a session, 5,000 for an agent) remain as the operator ceiling.
- **A known agent gets no more legal capacity than a person.** Person-level limits, traffic and business, are keyed to the One Login subject and are identical for a person, one agent, a hundred sub-agents and an agent HMRC cannot see. Only the operator scope differs by kind, because an agent legitimately serves many people. Detection is still evidence, not the boundary.
- **The entitlement is never rate-limited.** Writes have protective ceilings far above anything a person does (60 a minute per person), claims are never capped, delayed or dropped because the caller is an AI, and one person and one underlying claim stay one claim across any number of sub-agents (`one_claim_per_tax_year`, `one_answer_per_query`, the evidence fingerprint). If a throttle fires on a claim, nothing is recorded, and the same request later is a first try.
- **Idempotent replays are cheap and not new operations.** A request whose `Idempotency-Key` already has a stored outcome, or was admitted in the last minute and is still in flight, is admitted as a `read`, not a `write`, so a client retrying after a lost response or an impatient burst is not throttled as if it were submitting again. It is logged as `REPLAY`, not as a unique operation. Its cost is bounded by the read limits. A retry whose first attempt was refused or rolled back is also counted as a read, which is a small leniency, not a hole: fresh keys are writes.
- **Provisional policy, not decided here.** `max_open_cases` (3) and `refund_account_changes_per_30_days` (1) exist so the prototype can show a business limit that follows the person and is not a traffic limit. Their numbers are illustrative demo policy, not eligibility or legal constraints, and are marked as such in `domain-policy.ts`. Changing, removing or justifying them is a product and legal decision for separate discussion. The same applies to `tax_code_views_per_hour` (60) and `claim_progress_checks_per_day` (4): their numbers are unchanged, but they are now technical limits on lookups and polling, not rules about a claim. This supersedes the wording in Decision 18 that called the progress limit a business limit.
- **Temporary unavailability is 503.** HMRC returns it for GOV.UK Delegate being unable to answer (`DELEGATE_UNAVAILABLE`, as before) and while load shedding is on (`HMRC_SHED_LOAD=1`, `SERVICE_UNAVAILABLE`). Neither is a throttle or a refusal.
- **Metrics tell the five things apart.** `service_event` gains `outcome_class` (`UNIQUE_OPERATION`, `REPLAY`, `BUSINESS_REFUSAL`, `INVALID_REQUEST`, `TECHNICAL_THROTTLE`, `UNAVAILABLE`, `AUTHORITY_REFUSAL`), `cost_class`, `throttle_scope`, `retry_after_seconds` and `authorised_check` (Delegate's check said yes). The operations page shows HTTP requests, authorised checks, unique operations, replays, business refusals and technical throttles side by side, and the per-person table separates "refused by business rules" from "held back for traffic". A throttle is outcome `THROTTLED`; a business refusal is `REFUSED`.

Not done: counters are in memory and per process (a gateway or shared store would replace them); the check API still has no throttling of its own (Decision 16); the About site's swarm chart still labels a refusal by `reason` and has not been told about `RATE_LIMITED` (issue #36); `HMRC_SHED_LOAD` is a manual switch, not automatic back-pressure.

## Decision 24 — A step-up approval is for one proposed change, and checking never spends it

**Decision:** for the two actions that already need the person's approval (`change_refund_account`, `change_address`; the list is unchanged), the approval is the person's yes to **one proposed change**, not to "the next use of the capability". It is read by the authority check, reserved when HMRC admits the change, and spent when HMRC reports the change made. This supersedes Decision 22 (approval covers the next positive check, consumed at the check by compare-and-set) and the "fresh approval each time" wording in Decision 16. The age limit from Decision 22 is kept as the one validity window; there is no second value.

**The guarantee, in terms a visitor can check.**
- *What the person approves.* A screen showing the change in words and values (name on account, sort code, account number ending 9911; or the address), the service, the agent and the deadline. The details are made-up demo data. Nothing is checked against a bank or an address register, HMRC does not store them, and Delegate keeps a digest plus the masked display, not the account number.
- *What it covers.* A proposal reference (SHA-256) over mandate, principal, service, capability, a digest of the normalised content, the client's `Idempotency-Key` and the expiry. Different content, a different key, a different capability or a different person is a different proposal and needs its own approval. Content that differs only in formatting (`200000` and `20-00-00`) is the same proposal.
- *What uses it up.* Only a successful reservation followed by HMRC reporting the change made. Asking (`/api/authorisations/check`) reports the state and changes nothing, however often it is repeated. A change HMRC turns down on its own rules (the refund-account limit, open cases, invalid content) is decided before any reservation, so the approval is untouched.
- *Retries.* The same key and content, after the change was made, returns HMRC's stored result (Decision 21) and spends nothing more. The same key with different content is 409 `IDEMPOTENCY_KEY_REUSED`.
- *Time.* One deadline per proposal, `STEP_UP_MAX_AGE_MINUTES` (default 10, in `apps/delegate/src/lib/config.ts`), starting when the proposal is made (Decision 22 measured from the approval; this is the same single value, now bounding the whole proposal). Approving does not extend it. The boundary is inclusive, as in Decision 22: a change exactly at the deadline still counts. After it, a check reports `EXPIRED` and opens a fresh request. A change already reserved may finish after the deadline; nothing new may start.
- *Revocation and expiry of the mandate.* Checked again inside the reserving statement itself. A revoked or expired mandate cannot start a new change even with an unspent approval. A change already reserved is not undone (see below).
- *Decline.* Sticky for that key and content until the window closes; the agent has to use a new key. Previously a decline deleted the request and the agent could ask again at once.

**The protocol.** Delegate and HMRC have separate databases, so there is no atomic "make the change and spend the approval". The protocol is built so that every failure leaves a safe, recoverable state, and does not pretend otherwise.

| Step | Who | What | If it fails |
|---|---|---|---|
| Check | HMRC to Delegate | Sends key and content with the normal check. Reply: `authorised: true` with `step_up.state` `APPROVED`, `IN_PROGRESS` or `REDEEMED`; or `authorised: false` with `AWAITING_APPROVAL`, `EXPIRED`, `DECLINED`, `PROPOSAL_REQUIRED`, `PROPOSAL_INVALID` or `KEY_USED_FOR_OTHER_TRANSACTION` | A read. Nothing to undo |
| Reserve | HMRC to Delegate, inside HMRC's change transaction, after its own rules admit it | Re-runs the whole check, then one conditional update `APPROVED` to `RESERVED` that also requires the proposal unexpired and the mandate live. HMRC supplies a reservation id per attempt | Of N racing callers one wins; the rest get 409 `STEP_UP_IN_USE` with a retry time. Delegate unreachable: HMRC's transaction rolls back, 503, nothing made. A lost reply is recognised by the reservation id |
| Change | HMRC | Makes the change and writes its idempotency record in one transaction | A crash or error rolls back both. HMRC hands the approval back (`release`); if that call is lost the lease lapses |
| Complete | HMRC to Delegate, after its commit | `RESERVED` to `USED`, with HMRC's reference. Idempotent. Accepted even after the lease or window lapsed, because it records something that happened | If lost, the caller still gets the change that was made. The next same-key retry is answered from HMRC's record and repeats the report |

- **Where it sits in HMRC's sequence (Decision 23).** `runOperation` admits the request first (throughput: a write-class operation, a technical 429 if over), answers a retry of a committed change from the idempotency record as a cheap read, then applies the domain rules, and only then calls the handler. The reserve call is made inside that handler step, so a throttled request, a business refusal (such as the refund-account limit) and every replay never reserve. The step-up answers (`STEP_UP_IN_USE`, `STEP_UP_ALREADY_USED`, `STEP_UP_NOT_APPROVED`) are authority refusals (`kind: AUTHORITY_REFUSAL`), not throttles and not business refusals: they are logged as REFUSED with cost class `write`, never THROTTLED, and `STEP_UP_IN_USE` carries Retry-After. The reserve, complete and release calls are calls to Delegate, not load on HMRC, so they use no throughput budget.
- **The reservation is a lease** (`STEP_UP_RESERVATION_LEASE_SECONDS`, 60, longer than HMRC's 20 second transaction timeout). It is a technical timeout for presuming the holder crashed, not a policy. After it lapses the same proposal can be reserved again.
- **Why a lapsed lease cannot become a second change.** The approval is bound to one key and one content digest, and HMRC's idempotency record for that key is written in the same transaction as the change. Whatever Delegate believes, a second attempt under that key meets HMRC's record and is answered with the stored result. A distributed transaction is not needed for "at most one change per approval"; it is needed for "Delegate's `USED` is always up to date", which this design does not claim.
- **Duplicate callbacks** (`complete` twice, `release` twice, `reserve` re-delivered) are harmless by construction. `release` only works for the reservation that holds the approval, so a late call from a crashed attempt cannot disturb a newer one.

**What the demo guarantees:** within one Delegate database and one HMRC database, each acting correctly, one approval admits at most one committed change (HMRC's unique idempotency record is the backstop); an approval is never spent by being asked about or by a refusal; a stale, expired, revoked, mismatched or already-spent approval does not admit a change.

**What it does not guarantee, and what production would need.**
- *Revocation racing an in-flight change.* A change reserved a moment before the person removes access can still complete. Closing that needs the service to re-check authority at its commit, or a revoke that waits for reservations.
- *Sub-agent revocation between the check and the reserve* is a gap of milliseconds, because only the mandate (not each delegation) is in the reserving statement.
- *Delegate's `USED` can lag.* Between HMRC's commit and a successful `complete`, Delegate shows the approval as reserved, then (after the lease) unspent. It cannot admit a second change, for the reason above, but monitoring of "approvals spent" would under-count until a retry or a reconciliation job repairs it. Production would add that reconciliation.
- *HMRC is trusted to describe what it is about to do.* Delegate computes the digest and the display from the same content HMRC sends, so the person sees exactly what is bound. It cannot know HMRC then performs that content. Production would need the service's signed commitment to the proposal, or the person's approval carried as a signed object the service verifies.
- *The proposal reference is a hash, not a signature or MAC.* It is reproducible by anyone holding the fields. It identifies and binds; it does not prove who made it.
- *The person's lock is held across a network call.* Reserving happens inside HMRC's per-person transaction. Fine for a demo; production would split it.
- *Existing step-up rows were deleted by the migration.* They had no proposal to bind to.

**Open policy question for the owner:** the 10 minute window (the value Decision 22 chose, now applied from when the change is proposed, so it also has to cover the person reaching GOV.UK, signing in and reading the details) is a starting point. It is a product and risk decision, not an engineering one, and it should be confirmed (or replaced by, for example, a shorter window for bank details than for an address). It is one named value; changing it changes nothing else.

**Issue map.** This implements #19. Main already had #37 (compare-and-set consumption at the check) and #38 (age limit, documented scope); this replaces consume-at-check, because it spent the approval before HMRC knew whether the change would commit. What #37 asked for still holds, at the reservation: of any number of concurrent reservations exactly one wins, so one approval admits at most one change. A check uses nothing, so many concurrent checks may all return authorised. On #38: its window, now bounding the proposal, plus content binding, mismatch refused with a structured state, and mocked data kept explicit. The about-site and README copy that still describes "fresh approval each time" is left for the documentation pass (#36).

## Decision 25 — HMRC can receive a claim now and record it later

**Decision:** for one operation, `claim_job_expenses`, HMRC offers a second way to ask: receive the claim now, record it a little later. The caller opts in with `Prefer: respond-async` (RFC 7240) and must send an `Idempotency-Key`. Everyone else keeps the synchronous behaviour of Decision 21. This is HMRC's own behaviour; nothing is added to GOV.UK Delegate, which only learns the outcome (Decision 12's outcome log: `ACCEPTED` at receipt, `COMPLETED` or `FAILED` when the worker finishes). It exists to show that a busy service can still take valid work and finish it later, rather than refusing it.

- **The receipt is the job.** A `transaction` row is both what the client is told and what the worker claims. It is written in the same database transaction, under the person's lock, as the domain checks and the idempotency record (Decision 21's order is unchanged). `202 Accepted` is sent only after that commits; if the store fails, nothing is kept and the answer is 503 with `Retry-After: 30`, `accepted: false` and "send the same request again". We cannot tell a caller whose connection died whether it committed; that is what the key is for: the retry returns the original receipt, with its current status, and never a second job.
- **What 202 says.** An opaque id (`tx_` plus 128 random bits), `status`, `Location: /api/transactions/{id}`, and a note. It never says approved or eligible. `COMPLETED` means the claim is recorded and HMRC will review it. Until then there is no claim, no tax code change and no HMRC question; the claim reference is reserved at receipt (unique) and shown only once it exists.
- **Rules still apply at receipt.** `domain-policy.ts` counts claims waiting in the queue as the person's open cases and as claims for the year, so a duplicate, a missing-evidence resubmission, or a fourth open case is refused with the same 409 as before, immediately, and a burst of identical claims queues one. Throughput (`throughput.ts`) is unchanged: receipt is a write; the status read is a cheap read and does not touch the progress-check allowance.
- **The worker** (`npm run worker -w apps/hmrc`, the `hmrc-worker` compose service) claims work with one `UPDATE ... FOR UPDATE SKIP LOCKED` statement, so any number of workers share one table. Each takes a lease (`HMRC_QUEUE_LEASE_SECONDS`, default 60); if the worker dies, the lease runs out and another takes it, counted as an attempt. It works in a transaction that first re-reads the row `FOR UPDATE` and checks its lease token, so a worker whose lease was taken over, or whose item is finished, changes nothing. The business change and the move to `COMPLETED` commit together, so an attempt that fails after writing leaves nothing and the retry makes the claim once. Failure retries with doubling backoff (5s, capped at 300s) up to `HMRC_QUEUE_MAX_ATTEMPTS` (5), then `FAILED`: kept, shown to the client as "could not be recorded", shown to operators with the error on `/ops`, and never retried by itself. A worker that dies on every allowed attempt also ends `FAILED`, so nothing loops. One process handles `HMRC_QUEUE_CONCURRENCY` (4) items at once. Stopping lets items in hand finish; the rest stay queued.
- **Fairness (demo policy, not a legal priority rule).** Scheduling is by person (One Login subject), never by agent, provider or lane. A person's items run one at a time, in the order received; among people with something due, whoever was served least recently goes next (never served first). So one person with a hundred queued claims, however they arrived, gets one turn per round and cannot hold up anyone else. Nothing here gives any caller priority in law; it is a way to show that bulk traffic need not starve other people.
- **Who can look.** `GET /api/transactions/{id}` (and the page `/transactions/{id}`) is behind the same wrapper and permission as claim status (`view_claim_status`). The domain rule is that a receipt is visible only to the person it is for: someone else's id, from a person or an agent, gets exactly the 404 an unknown id gets, with no hint it exists.
- **Revocation after acceptance (chosen mock behaviour).** Revoking stops new submissions and status reads by that agent at once (the check fails). Claims already durably received are **not** cancelled: they are recorded, with the agent, mandate and delegation that sent them kept on the claim, and the outcome is reported against the original check. The person sees them on their page. The reasoning: HMRC accepted them while the agent had authority, the history should say what happened, and silently dropping accepted work is the thing this change exists to avoid. Whether a real service would cancel, hold for the person's confirmation or process is a policy question this prototype does not answer. The person can already dispute what an agent said for them (Decision 19).
- **Receipt time is not a filing date.** `received_at` is when this mock service committed the submission. It is not evidence of when anything was legally made. Legally effective submission timestamps, and what a delay between receipt and recording means for them, are policy and legal questions; the API and the page both say so.

Not done: only the API path is asynchronous (the website form still records the claim at once); `GET /api/claims` and the progress check do not list received claims yet (the status endpoint and the person's page do); `Retry-After` on 503 is a fixed 30 seconds, not derived from queue depth; no limit on how many claims may wait overall (the per-person open-case limit bounds one person, not the queue); the queue is one table in HMRC's database, not a separate broker; outcome reports to Delegate retry on a sweep but there is no dead-letter handling if Delegate never accepts one.

## Decision 26 — Claim progress is polled efficiently: ETag, 304, private no-store

**Decision:** `GET /api/claims/progress` (issue #23) gives an agent an application-level validator so it can poll cheaply without missing a change. Scope is progress/status only; there is still no push, webhook or subscription, and no response claims there is.

- **ETag.** A weak ETag (`W/"<32 hex>"`, also `result.version`) is a keyed hash (HMAC with the server secret) over the person's id and everything in their claim state a reader could see change: each claim's reference, kind, status, summary and received time, and each question's status, asked, answered and state-changed times, answer version, withdrawn flag and confirmation. A reply, a dispute that reopens a question (#42's `stateChangedAt`), a new claim or correction, and an unavailable dispute check each change it; polling again with nothing new does not. It does not depend on `?since`.
- **Conditional requests.** `If-None-Match` is compared per RFC 9110 (weak comparison, lists, `*`) against the version of the person the request is already authorised for. A match is `304 Not Modified` with no body. The value is never looked up, so another person's ETag simply fails to match and the caller gets their own full status; the keyed, person-bound hash also reveals nothing about records. A 304 is only sent when the dispute check ran, so a possibly stale status is never called unchanged.
- **Freshness.** The body carries `observed_at` (`checked_at` kept as an alias) and `polling`: `delivery: polling_only`, `push_or_webhooks: false`, `suggested_next_poll_seconds` (the daily window divided by its limit, from the same `PRINCIPAL_WINDOWS` constant that enforces the limit, so they cannot drift), the limit and how to back off. The interval is also the `X-Suggested-Poll-Interval` header, repeated on 304.
- **Caching.** Every response from the route, including refusals and 304, is `Cache-Control: private, no-store` with `Vary: Authorization, Cookie, X-Principal-Id`. The ETag is only for the caller's own conditional requests; nothing is meant to be stored or served from a shared cache.
- **A 304 is still a check.** It is admitted, counted against the person's 4 a day and logged like any poll, because the work of authorising and reading state is done either way. The saving is the body, not the allowance. Over the allowance (or the per-minute `status_poll` limit) the answer is the existing `429 RATE_LIMITED` with `Retry-After` (#20), `entitlement_affected: false`, and no ETag, so it is never read as "not modified" or as a problem with the claim. After waiting, the agent's old ETag gets any change made meanwhile.
- **Extension point.** `registerProgressVersionInput` in `apps/hmrc/src/lib/progress-version.ts` lets another status source (for example the durable queue's transaction status, #21) add a string to the version when it should make cached progress stale. Nothing is registered; this change does not touch the queue.

**Not decided here.** Whether a 304 should cost less than a full poll (for example a separate, larger allowance for conditional requests) is a policy question; today it costs the same. The 4 a day limit and the resulting 6 hour suggested interval are the existing illustrative numbers from Decision 23.
## Decision 27 — The swarm experiment counts claims and traffic apart, and says what is measured, what depends on a demo limit and what is simulated

**Decision:** the About site's Scenario 4 and `tests/swarm.test.ts` no longer ask "how many requests were allowed?". That number cannot tell one person's claim sent a hundred times from a hundred people's claims, and treating the second as the first, or fewer allowed requests as less harm, is the mistake the earlier quota-based scenario invited. They measure, separately:

- **Technical load** (what it cost HMRC): HTTP requests (retries included), GOV.UK Delegate authority checks, 429 and 503 answers, the back-end work that passed admission by cost class, request time. From HMRC's own log (`outcome_class`, `cost_class`, `authorised_check`).
- **Service outcomes** (what happened to the claims): claims received (`202`), queued, recorded, failed, duplicates absorbed, the wait for a worker and the worker's time per claim, the time until the queue is empty. From HMRC's queue table and claim table.

An authorised check is not a claim, a request that ran is not a claim, and a 429 is not a lost claim. HMRC's log class `UNIQUE_OPERATION` counts any admitted request that ran first time, reads included, so the experiment never reports it as claims; claims come from the queue.

- **Seven scenarios, all through the real services.** The four earlier arms (A one person and one agent, B one person and N sub-agents, B′ N hidden sessions, C N people and one agent) now use the asynchronous claim path, with a fresh `Idempotency-Key` per attempt: A, B and B′ are N attempts at one wish and make one claim; C is N wishes and makes N. Added: **D** a burst of N people through one operator, all at once, every claim sent twice, with a signed-in bystander arriving mid-burst; **E** a retry storm of N, then N more, against one accepted claim; **F** a status-poll flood (4N status checks and up to 40 progress checks) on one claim, with a bystander checking their own claim and the flooder trying the bystander's id.
- **A request that stands for a wish waits as told.** Claims in C, D, E and F wait for `Retry-After` after a 429 or 503 and send the same request again, up to six tries, as a well-behaved client would. A duplicate, a retry storm and a poll flood do not. So "100 valid submissions from 100 people are preserved, even if completed gradually" is a result about a client that behaves, and any 429 or 503 on the way is counted as technical load, not as a lost claim.
- **Every scenario carries checks**, listed with the result, shown on the page and asserted in the tests: claims never exceed what people wanted; one claim per person; every wanted claim received and recorded; HMRC's log matches the client's count; authorised checks are reported as checks; every 429 and 503 carries `Retry-After` and says the entitlement is untouched; receipts point at exactly the claims HMRC holds.
- **Provenance is on the page.** *Measured: real integration run* (counted from the run just made; varies a little with the machine). *Depends on a demo-only limit* (shaped by `one_claim_per_tax_year`, the hourly tax-code allowance, the per-minute read allowance or the daily progress allowance, named under each scenario's checks; illustrative and provisional, Decision 23). *Simulated, not measured* (below).
- **No test asserts a quota.** The old assertions that exactly 60 lookups an hour pass, and that exactly N-1 claims are refused with a given reason, are gone. Tests ask what a throttle did to a claim and to a bystander, never how many requests trip it. Where they compare (assurance buys no extra capacity), they compare two people's answers to the same traffic with each other.
- **A seeded simulation compares protections** (`apps/about/src/lib/swarm-sim.ts`): none, an agent-level throttle at 60 and at 600 a minute, a person-level technical throttle at HMRC's defaults, fair scheduling by person, fair scheduling by agent provider (not built), and HMRC as built. Four workloads: retry storm, 100 people through one agent, status-poll flood, and one person with many items (hypothetical: the claim route caps a person at three open claims). Every draw is a hash of the seed and a label, so the same seed gives the same tables, and the tests assert that. Held constant, because it is HMRC's behaviour and not a policy under test: a repeat of a key HMRC holds is answered from the stored outcome, a second claim for something already held creates nothing, authority is checked before any limit, a person's items are recorded one at a time. Its assumptions (two workers, 300 to 700 ms a claim, six retries, one-minute windows) are printed on the page and exported from the file, and it is labelled simulated wherever it appears.
- **What the model says, and what it does not** (the tests pin these so the page's sentences cannot drift from the tables): an agent-level throttle protects the service by slowing the agent's other users, and every request it turns away has already cost an authority check; a person-level throttle leaves 100 distinct people alone and slows a flood on one person; fair scheduling by person helps when one person has many items and does nothing for a bystander in a crowd of different people sent by one provider (scheduling fairly between providers would, and HMRC has not built it); no protection changes how many claims are made, because idempotency and the one-claim rule are held constant. It does not say any of these numbers is right, and it does not choose a policy.
- **What the real runs found.** (1) HMRC's status read (`GET /api/transactions/{id}`) asked the database pool for a second connection while the request held one and the person's lock, so a few dozen concurrent checks on one claim took every connection and answered 500 to everyone, bystanders included. Fixed with this change: it reads through the request's own transaction (a regression test sends 40 at once). (2) HMRC's progress check (`GET /api/claims/progress`) still does the same: more than one at a time can starve the pool. Fixed during integration with the newer polling implementation: status and progress reads use the request transaction, with a concurrent progress-poll regression. The experiment still bounds its progress traffic to one at a time. (3) Under a burst of 200 simultaneous requests the development servers sometimes answered 503 `DELEGATE_UNAVAILABLE` to some of them; the clients retried and nothing was lost, and the count is shown as technical load. (4) The queue took seconds to empty 100 claims although the worker spends milliseconds recording each. The time is spent somewhere other than the recording step (claiming in fair order, or reporting outcomes to GOV.UK Delegate one at a time are the candidates); this change measures it and does not investigate it.

Not done: the experiment's lookups (tax code) are technical load only and are never claims; the progress and status polls do not use `ETag`/`304` (that work is separate, issue #23, so the flood is written against current behaviour); results are held in the About site's memory (the last eight runs), not stored; nothing here tests an abuse control for traffic with no identity, which is still a different problem (Decision 7); the simulation has no 503 or load-shedding model; and HMRC's `/ops` page does not show the new instrumentation, which is available at `POST /api/demo/run-stats` (demo-gated, not reachable through the public tunnel) for the About site and the tests.
