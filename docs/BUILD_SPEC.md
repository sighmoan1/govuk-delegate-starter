# Build specification

> Preserved original brief. DWP and Example AI examples are historical, and later numbered decisions supersede these requirements. Use [CURRENT_BEHAVIOUR.md](CURRENT_BEHAVIOUR.md), [ARCHITECTURE.md](ARCHITECTURE.md) and the current code for implementation work.
## 1. Goal

Build a working technical prototype of **GOV.UK Delegate**.

The prototype must demonstrate that a person authenticated through a One Login-compatible flow can:

1. approve an authorisation request from a software agent;
2. grant specific, limited permissions;
3. inspect the resulting relationship;
4. revoke it;
5. have a government service independently check the relationship before allowing a transaction;
6. generate useful activity telemetry.

This is a technical spike, not a production identity or authorisation system.

## 2. Design starting point: copy HMRC, then generalise

Do not invent a delegation protocol from scratch.

Use this lifecycle as the default:

```text
DELEGATE CREATES REQUEST
        ↓
PENDING PRINCIPAL APPROVAL
        ↓
PRINCIPAL AUTHENTICATES
        ↓
PRINCIPAL APPROVES / REJECTS
        ↓
AUTHORISED RELATIONSHIP
        ↓
SERVICE CHECKS RELATIONSHIP
        ↓
TRANSACTION ALLOWED / DENIED
        ↓
RELATIONSHIP REVOKED / EXPIRES
```

The first MVP should use a central relationship lookup/introspection model. Do not prematurely design a portable credential or complex signed-mandate protocol.

## 3. Generalisation

HMRC's pattern is approximately:

`taxpayer ↔ registered tax agent ↔ tax service`

GOV.UK Delegate generalises this to:

`principal ↔ delegate ↔ government service ↔ capability`

A delegate type may be:

```text
PERSON
ORGANISATION
SOFTWARE_AGENT
```

The MVP only needs to implement `SOFTWARE_AGENT`, but the schema must not make AI a special case.

## 4. End-to-end demo journey

### Request

Demo Personal Agent asks for authority to act for the signed-in principal with **DWP Benefits Demo**.

It requests:

- `check_claim_status`
- `submit_evidence`
- `report_change`

It does not request:

- `change_payment_details`
- `withdraw_claim`

### Approval

The principal signs in through the One Login simulator and sees the requested permissions.

They can approve all, remove individual permissions, reject the request, or leave it pending.

### Transaction

The agent authenticates as itself and calls the mock DWP service.

The DWP service checks GOV.UK Delegate before performing the action.

Examples:

```text
check_claim_status → ALLOW
submit_evidence → ALLOW
change_payment_details → DENY: PERMISSION_MISSING
```

### Revocation

The principal revokes the relationship.

The same `check_claim_status` request now produces:

```text
DENY: AUTHORISATION_REVOKED
```

### Observability

Every attempt appears in an activity view.

## 5. Suggested architecture

```text
┌───────────────────────────┐
│ GOV.UK One Login simulator│
└─────────────┬─────────────┘
              │ OIDC
              ▼
┌───────────────────────────┐
│ GOV.UK Delegate           │
│                           │
│ authorisation requests    │
│ relationship registry     │
│ delegate registry         │
│ permission catalogue      │
│ revocation / expiry       │
│ relationship check API    │
│ activity log              │
└──────────────┬────────────┘
               │ relationship check
               ▼
┌───────────────────────────┐       ┌──────────────────────┐
│ Mock DWP service          │◄──────│ Demo Personal Agent  │
│                           │ action│                      │
│ checks identity           │       │ authenticates itself │
│ checks authority          │       │ acts for principal   │
│ checks capability         │       └──────────────────────┘
└──────────────┬────────────┘
               │
               ▼
┌───────────────────────────┐
│ Activity / flood view     │
└───────────────────────────┘
```

## 6. Stack

Recommended:

- TypeScript
- Next.js
- PostgreSQL
- Prisma or Drizzle
- Docker Compose
- GOV.UK One Login simulator
- GOV.UK Frontend semantics where useful, with the supplied `styles/design.css` as the visual layer
- Vitest
- Playwright

Do not introduce Kubernetes, queues, event sourcing or distributed infrastructure.

## 7. Data model

### Principal

```text
principal
---------
id
one_login_subject_id
display_name
created_at
```

### Delegate

```text
delegate
--------
id
name
type
provider
client_id
status
created_at
```

Seed:

```text
name: Demo Personal Agent
type: SOFTWARE_AGENT
provider: Example AI Ltd
status: ACTIVE
```

### Service

```text
service
-------
id
name
slug
```

Seed:

```text
DWP Benefits Demo
dwp-benefits
```

### Capability

```text
capability
----------
id
service_id
code
name
risk_level
requires_step_up
```

Seed:

```text
check_claim_status       LOW
submit_evidence          MEDIUM
report_change            MEDIUM
change_payment_details   HIGH
withdraw_claim           HIGH
```

### Authorisation request

```text
authorisation_request
---------------------
id
principal_hint_or_id
delegate_id
service_id
status
created_at
expires_at
responded_at
```

Statuses:

```text
PENDING
APPROVED
REJECTED
CANCELLED
EXPIRED
```

### Requested permissions

```text
authorisation_request_permission
--------------------------------
authorisation_request_id
capability_id
```

### Authorisation relationship

```text
authorisation
-------------
id
principal_id
delegate_id
service_id
status
valid_from
valid_until
created_at
revoked_at
```

Statuses:

```text
ACTIVE
REVOKED
EXPIRED
```

### Authorised permissions

```text
authorisation_permission
------------------------
authorisation_id
capability_id
```

### Activity event

```text
activity_event
--------------
id
timestamp
principal_id
delegate_id
authorisation_id
service_id
capability
decision
reason
request_id
```

Decision:

```text
ALLOW
DENY
```

Reasons:

```text
VALID_AUTHORISATION
PERMISSION_MISSING
AUTHORISATION_REVOKED
AUTHORISATION_EXPIRED
UNKNOWN_DELEGATE
INVALID_AGENT_AUTHENTICATION
NO_AUTHORISATION
```

## 8. Human authentication

Use the official GOV.UK One Login simulator or integration environment.

The app should perform a real OIDC-style redirect/callback flow rather than rendering a fake One Login login screen.

Store the stable One Login subject identifier against the Principal.

## 9. Delegate authentication

The software agent must have its own identity.

For the MVP, seed one agent client with development credentials.

The agent must never reuse the principal's One Login session or credentials.

Core rule:

```text
PRINCIPAL IDENTITY ≠ DELEGATE IDENTITY
```

## 10. Authorisation API

Prefer HMRC-style relationship operations.

Illustrative endpoints:

```text
POST   /api/authorisation-requests
GET    /api/authorisation-requests/:id
POST   /api/authorisation-requests/:id/approve
POST   /api/authorisation-requests/:id/reject
POST   /api/authorisation-requests/:id/cancel

GET    /api/authorisations
GET    /api/authorisations/:id
POST   /api/authorisations/:id/revoke

POST   /api/authorisations/check
```

The check request should include:

```json
{
  "principal_id": "...",
  "delegate_id": "...",
  "service": "dwp-benefits",
  "capability": "submit_evidence"
}
```

Response:

```json
{
  "authorised": true,
  "authorisation_id": "...",
  "status": "ACTIVE"
}
```

Or:

```json
{
  "authorised": false,
  "status": "REVOKED",
  "reason": "AUTHORISATION_REVOKED"
}
```

## 11. Mock DWP service

Implement:

```text
GET  /api/dwp/claim/status
POST /api/dwp/claim/evidence
POST /api/dwp/claim/change
POST /api/dwp/claim/payment-details
POST /api/dwp/claim/withdraw
```

Each endpoint maps to one capability.

Reusable middleware should:

1. authenticate the delegate;
2. identify the principal it claims to represent;
3. ask GOV.UK Delegate whether the relationship is active;
4. ask whether the required capability is present;
5. write an activity event;
6. allow or reject the action.

Keep delegation logic out of the business endpoint itself.

Example abstraction:

```text
requireDelegatedAuthority("submit_evidence")
```

## 12. Revocation

Revocation must be authoritative server-side.

Do not demonstrate revocation by only hiding UI.

Acceptance:

```text
check_claim_status → 200

principal revokes authorisation

check_claim_status → 403 AUTHORISATION_REVOKED
```

## 13. Trusted lane classification

Represent three categories:

```text
AUTHENTICATED_HUMAN
AUTHORISED_AGENT
UNTRUSTED
```

Do not attempt sophisticated AI or bot detection.

### AUTHENTICATED_HUMAN

Valid One Login session.

### AUTHORISED_AGENT

Valid delegate identity and active relationship covering the requested capability.

### UNTRUSTED

Everything else.

## 14. Demonstrate incentives

The trusted lane must have a visible benefit.

For the prototype:

### Trusted

```text
structured machine API: YES
machine-readable errors: YES
higher simulated throughput: YES
full authority audit trail: YES
```

### Untrusted

```text
structured machine API: NO or LIMITED
lower simulated rate limit: YES
additional verification: POSSIBLE
```

Do not build real CAPTCHA or production abuse infrastructure.

## 15. User-facing screens

Build:

1. Project start page
2. About this project
3. Your delegates
4. Incoming authorisation request
5. Choose / edit permissions
6. Check your answers
7. Authorisation confirmation
8. Authorisation detail
9. Revoke confirmation
10. Demo Personal Agent
11. Agent transaction result
12. Activity / agentic-flooding view

See `PROTOTYPE_CONTENT.md` for content.

## 16. Activity view

Show at minimum:

```text
Agent transactions today
Total
Allowed
Denied
Authenticated delegates
Principals represented
```

Metrics:

```text
transactions / delegate
unique principals / delegate
denial rate / delegate
transactions / principal
requests by capability
```

Show a transaction table:

```text
TIME | PRINCIPAL | DELEGATE | SERVICE | ACTION | DECISION | REASON
```

Do not label a delegate fraudulent merely because a metric is high.

## 17. Accessibility

The project proposition explicitly depends on legitimate actors being able to enter the trusted lane.

The prototype must:

- use semantic HTML and keyboard-operable controls;
- retain strong visible focus styles;
- work with enlarged text and narrow screens;
- explain alternatives for people who cannot complete the digital delegation route unaided;
- avoid equating lack of digital identity with maliciousness.

The supplied stylesheet already includes substantial focus, reflow and responsive treatment. Preserve these behaviours.

## 18. Security rules

Even for the spike:

- never expose private signing material in the browser;
- never let a delegate use the principal's credentials;
- authenticate delegate identity separately;
- validate requested capability server-side;
- make revocation authoritative server-side;
- log ALLOW and DENY decisions;
- use generated opaque IDs;
- use synthetic claimant data only;
- do not claim production security, accreditation or official GOV.UK status.

## 19. Non-goals

Do not implement:

- real Universal Credit integration;
- production One Login;
- AI-text detection;
- production bot detection;
- fraud scoring;
- biometrics;
- agent accreditation;
- payments;
- agent-to-agent delegation;
- full power-of-attorney rules;
- production OAuth authorisation server;
- general-purpose legal liability resolution.

## 20. Build sequence

### Phase 1 — scaffold

Create monorepo, database, design shell and Docker Compose.

### Phase 2 — principal authentication

Integrate the One Login simulator.

Acceptance: a local user signs in and Delegate stores a stable subject identifier.

### Phase 3 — delegate registry and authorisation requests

Seed Demo Personal Agent and implement HMRC-style request / approve / reject / cancel flow.

### Phase 4 — active relationship

On approval, create an active authorisation and scoped permissions.

### Phase 5 — mock DWP enforcement

Implement relationship checking and per-capability ALLOW/DENY.

### Phase 6 — revocation and expiry

Make revoked/expired relationships fail immediately.

### Phase 7 — observability

Record all transaction attempts and build activity view.

### Phase 8 — trusted-lane demonstration

Show different simulated treatment for trusted and untrusted traffic.

### Phase 9 — content and accessibility polish

Add project-information pages and test keyboard/reflow journeys.

## 21. Mandatory automated scenarios

### A — authorised action

```text
principal approves request
agent calls authorised capability
→ 200 ALLOW
```

### B — undelegated action

```text
agent calls capability not approved
→ 403 PERMISSION_MISSING
```

### C — revocation

```text
authorised action → 200
principal revokes
the same action → 403 AUTHORISATION_REVOKED
```

### D — expiry

```text
expired relationship
→ 403 AUTHORISATION_EXPIRED
```

### E — unknown delegate

```text
→ 401 UNKNOWN_DELEGATE
```

### F — no relationship

```text
known delegate + principal + service, but no active authority
→ 403 NO_AUTHORISATION
```

Every attempt must generate an activity event.

## 22. Definition of done

```text
□ One Login simulator genuinely authenticates the principal
□ delegate has a separate identity
□ delegate can create an authorisation request
□ principal can approve/reject it
□ principal can edit requested permissions before approval
□ approved relationship is persisted
□ mock DWP checks relationship independently
□ allowed action succeeds
□ undelegated action fails
□ revocation immediately prevents further transactions
□ expiry prevents transactions
□ all attempts generate telemetry
□ trusted/untrusted distinction is visible
□ project explains its hypothesis and precedents in plain English
□ supplied design CSS is used
□ complete flow runs locally with documented setup
□ automated end-to-end tests pass
```
