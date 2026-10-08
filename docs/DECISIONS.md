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

## Decision 22 — Business rules and traffic limits are separate code, separate answers, separate metrics

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
