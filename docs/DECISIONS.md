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
