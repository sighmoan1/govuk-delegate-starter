# WhenIsBins email journey

The browser adapter demonstrates signing up a confirmed property and a designated mailbox, then separately cancelling the subscription. Default tests run against our synthetic localhost website and controlled mailbox. They do not contact WhenIsBins or send email.

## Implemented contract

`packages/whenisbins-email/src/index.ts` exports `executeEmailWorkflow` and `EmailAction`. An action contains `operation` (`signup` or `cancel`), `property`, `email` and `reminderChoice`. The connector resolves these from its approved property/mailbox bindings, checks current Delegate authority and exact-action approval, and passes an identical `approvedAction`. The adapter refuses changed values before navigation. Hashes are binding identifiers, not anonymisation: keep receipts access-controlled because enumerable values can be guessed.

The caller supplies an isolated Playwright `Page` (fresh browser context and bounded timeouts), a unique `operationId` and a durable `ReceiptStore` with `get` and `put`. **Serialise operations sharing an ID** before invoking the adapter; the store interface alone is not a distributed lock. The synthetic `MemoryReceiptStore` is only for tests. The connector owns durable receipts, authority checks, attempt events and locking. This package has no authority-check bypass route.

A configured origin, signup path and exact selectors describe one supported website form. Arbitrary site execution is not exposed. Localhost is enabled for the fixture. A non-local target requires HTTPS and explicitly designated matching property/email in `allowLive`. These controls are a test gate, not permission to run a live trial. Browser sessions use normal forms and website protections, including CSRF, cookies and origin checks. Human verification is handed back to the user; the adapter does not solve challenges or read real inboxes.

Cancellation receives a legitimately obtained secret `cancellationPath`, constrained to the configured origin. Before submission the form must expose matching property, email and reminder choice fields. If a live stop form does not expose enough information for this check, cancellation is unsupported until a safe binding can be established. Stop links never enter receipts; do not publish browser traces, screenshots, logs or exception text containing them.

## Honest states

| State | Evidence |
|---|---|
| `submitted` | Explicit form receipt; no confirmed subscription claim |
| `confirmation_required` | Inbox confirmation or human challenge needed |
| `confirmed` | Explicit service confirmation, or independently reconciled subscription state |
| `unknown` | Missing acknowledgement, browser error or uncertain service state |
| `refused` | Exact binding/test gate failure or explicit service refusal |

The adapter persists `unknown` before attempting submission. Repeated operations do not resubmit pending/unknown outcomes unless an independent reconciliation establishes absence. Confirmation may then update the same receipt without another signup. A changed payload with an existing operation ID is refused without replacing its original receipt. Confirmation evidence does not prove reminder email delivery.

Revoking authority prevents the connector's future actions. It does not stop an existing subscription at WhenIsBins. Cancellation needs its own capability and exact-action approval. The connector must re-check authority even when polling or reconciling a previous receipt; possession of an operation ID or stop link is not Delegate authority.

## Fixture and browser verification

`src/fixture.ts` exports `startEmailFixture()`. It binds an ephemeral listener to `127.0.0.1`, accepts only `synthetic-property-1`, `sam.test@example.invalid` and `evening_before`, and enforces a one-use CSRF token, session cookie and exact Origin on POSTs. The in-process `mailbox.confirm(action)` represents controlled mailbox confirmation; `mailbox.stopPath(action)` releases a secret only after confirmation. Neither is a public HTTP endpoint. `reconcile(action)` reports independently held fixture state; `counts()` exposes separate signup and cancellation effects.

```sh
npx playwright install chromium
npm run typecheck -w packages/whenisbins-email
npm test -w packages/whenisbins-email
```

Seventeen browser tests pass: real signup/inbox/cancellation, four exact payload replacements, human challenge, submitted-only receipt, service refusal, lost acknowledgement/reconciliation with no duplicate send, operation conflict, live designation/foreign stop refusal, wrong stop recipient, browser uncertainty forged CSRF, invalid runtime operation and cross-origin form/result redirects. Authority refusal, event completeness and revocation-after-signup are connector integration acceptance tests, not claims made by this isolated package.

## Live compatibility remains unvalidated

Read-only inspection on 10 October 2026 confirmed the homepage's postcode lookup and reminder description. It did not reach a real property's email form. The [WhenIsBins guide](https://whenisbins.com/v1/guide) describes reminders as a website feature without a public email signup API. No real signup, confirmation, delivery or cancellation has been exercised. We have not changed Tom's repository.

Before any bounded live smoke: agree a designated test property/mailbox, inspect the resulting ordinary form without submitting, map its exact selectors and confirmation/refusal semantics, establish stop-flow binding, limit sends, and retain private cleanup evidence. A human-only confirmation is pending, not failure. If the site cannot support this safe browser flow, record the specific incompatibility and discuss the held upstream integration issue with Tom.
