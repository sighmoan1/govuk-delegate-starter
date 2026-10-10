# WhenIsBins email journey

Native signup, independently received verification email and explicit activation were verified on 10 October 2026 for one privately designated property and inbox. The test subscription remains active. The owner approved shipping this verified scope and parking real cancellation in [#132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132). Its control remains disabled; no unsubscribe or future reminder delivery is claimed.

Default tests use our synthetic localhost website and controlled mailbox, including separately authorised synthetic cancellation. They do not contact WhenIsBins or send email.

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

`src/fixture.ts` exports `startEmailFixture(stateFile?)`. An optional private state file preserves synthetic subscriptions and counters across connector restarts; a fresh signup after synthetic cancellation creates a new confirmation/stop binding and active retries remain deduplicated. It binds an ephemeral listener to `127.0.0.1`, accepts only `synthetic-property-1`, `sam.test@example.invalid` and `evening_before`, and enforces a one-use CSRF token, session cookie and exact Origin on POSTs. The in-process `mailbox.confirm(action)` represents controlled mailbox confirmation; `mailbox.stopPath(action)` releases a secret only after confirmation. Neither is a public HTTP endpoint. `reconcile(action)` reports independently held fixture state; `counts()` exposes separate signup and cancellation effects.

```sh
npx playwright install chromium
npm run typecheck -w packages/whenisbins-email
npm test -w packages/whenisbins-email
```

Eighteen synthetic fixture browser tests pass: CSRF-protected signup/inbox/cancellation, four exact payload replacements, human challenge, submitted-only receipt, service refusal, lost acknowledgement/reconciliation with no duplicate send, operation conflict, live designation/foreign stop refusal, wrong stop recipient, browser uncertainty forged CSRF, invalid runtime operation and cross-origin form/result redirects. Authority refusal, event completeness and revocation-after-signup are connector integration acceptance tests, not claims made by this isolated package.

## Verified native signup and activation

The unchanged live website was inspected on 10 October 2026. A result at `/lookup/{lookup_id}` can reuse an existing API lookup. Its ordinary signup form posts to `/remind` with the site's CSRF token, native property ID and an email field. The reminder policy is fixed to the evening before collection; there is no reminder-choice field. The [WhenIsBins guide](https://whenisbins.com/v1/guide) provides no public email signup API.

A separately approved signup for a privately designated property and inbox returned “Check your email”. The designated inbox independently received the verification email. This proves submission and delivery of the verification request. A separately checked verification GET showed a CSRF-protected “Turn on reminders” form and explicitly said nothing had been activated. The subsequent checked POST returned “Your reminders are on”, establishing active subscription. Real cancellation is parked separately in #132; it does not block this verified signup/activation delivery. The initial email supplies `/verify/{secret}` and no stop link. We have not changed Tom's repository.

`executeWhenIsBinsEmailWorkflow` implements the native form mapping. The caller supplies the exact approved action, private designation, receipt store, and optional website lookup ID. An optional owned `confirmationPath` continues the same pending signup after the caller freshly checks central authority. The adapter persists uncertainty before following it, permits only the native same-origin verification path, and never repeats an uncertain activation automatically. Verification email delivery alone does not produce a confirmed receipt. The observed same-origin successful activation heading produces `confirmed` with `NATIVE_CONFIRMATION_OBSERVED`. Unknown activation HTML remains submitted pending independently established evidence.

Fourteen additional hermetic native browser tests exercise the real form mapping, designation and property checks, pending receipts, owned confirmation continuation, uncertainty, HTTP refusal and foreign-link refusal. These tests intercept every network request and do not claim live acceptance. All 32 package tests and the package TypeScript check pass. The activation success response has no stop link; it states every reminder will contain one. Cancellation requires a legitimate stop link from a subsequent owned message before its form can be mapped and the separately authorised cancellation journey verified. Keep all property, inbox and token evidence private.

The official guide and MCP quickstart expose collection lookup and schedule tools, with no email-reminder management API. The privacy page documents stopping through a reminder's stop link followed by confirmation; its other deletion route is contacting the operator. The owned verification email has no stop link or List-Unsubscribe header, and the activation page has none. No documented self-service cancellation path before the first reminder was found. Public repository discovery found an independent API client, not the service source. We have not guessed stop routes, submitted cancellation, or contacted the operator. The live cancellation acceptance step remains open in #132 until a legitimate owned link is available; the prototype shows this limitation and disables real cancellation. The native adapter never submits an unmapped stop form: an owned link yields STOP_FORM_MAPPING_REQUIRED, and a missing link is refused. Parking this work does not stop the active test subscription. There is no scheduled mailbox polling or automatic cleanup.

[Recorded live signup/activation evidence](https://github.com/sighmoan1/govuk-delegate-starter/issues/116#issuecomment-6096356042) is distinct from these hermetic tests. Government identity and sign-in remain simulated. A completed activation does not establish delivery of a future reminder, and Delegate revocation prevents further agent action without unsubscribing the already active service subscription.
