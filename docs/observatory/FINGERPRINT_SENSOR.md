# Optional Fingerprint browser sensor

This research-only sensor is switched off by default. Ordinary HMRC pages and
direct API clients do not run it. A researcher must enable the synthetic study,
configure a public vendor key, confirm the vendor retention policy and provide
a protected-ledger enrolment token. The participant must explicitly consent on
`/research/device-intelligence`; each subsequent sample is a separate button
press. No claim, authority, business rule or throughput decision reads this sensor.

The React integration uses `@fingerprint/react` v3 (v4 JavaScript agent),
`FingerprintProvider` with EU region, and `useVisitorData({ immediate: false })`.
The SDK/provider is mounted only after consent and a successful server enrolment.
IDs use the current snake_case `event_id` and `visitor_id` response fields.

Configuration:

- `FINGERPRINT_RESEARCH_ENABLED=true`: explicitly enable the study.
- `NEXT_PUBLIC_FINGERPRINT_API_KEY`: public key only; safe to expose to the browser.
- `FINGERPRINT_SERVER_API_KEY`: optional secret, server-only EU v4 event lookup.
- `OBSERVATORY_INTERNAL_URL` and `OBSERVATORY_COLLECTION_KEY`: protected research
  ledger/collection access. Never give the evaluation or collection key to browsers.
- `RESEARCH_PSEUDONYM_KEY`: project HMAC salt, at least 32 characters. Keep it
  stable within a comparison period; changing it changes exported identifiers.

The server claims a one-use researcher-issued token from the protected ledger,
sets a signed HttpOnly, SameSite research cookie and returns only an opaque
session ID and CSRF nonce. Run/attempt/session IDs are never chosen in a browser
sample. Each submission checks origin, nonce, cookie expiry and active ledger
binding. IDs from the browser remain unverified client claims unless the optional
Server API confirms event existence, linked session, event time and any visitor
claim. Verification failures or outages never become verified observations.

Each sample appends an immutable `browser_sensor` event to Observatory's protected
collection endpoint. The exported visitor/event IDs are project-salted HMACs;
raw IDs are visible only as labelled client claims on the participant's study page.
No vendor attributes, IP addresses, taxpayer data or ground-truth classes are
included. Missing/inactive research bindings and collection outages refuse only
research collection, never the HMRC journey.

The API wrapper and human claim/query submission logs read the signed research
cookie locally and add only opaque run/session references. Cookie failure adds
no evidence; the business path never calls Observatory or Fingerprint. Service
and sensor feeds use the same source-scoped session HMAC for comparison. A log
reference is observational: the protected ledger still verifies active enrolled
bindings before evaluation, and no truth label is copied into service logs.

Coverage states are `not_run`, `blocked`, `error`, `missing` and `identified`.
Explicit CSP/script-load blockers are `blocked`; generic network errors remain
`error` because their cause is unknown. Missing coverage and direct API access
are never described as human or “no bot”. Repeated visitor IDs can be compared as
browser signals; they do not count physical people. Raw vendor events and device
attributes are not retained locally; observation identifiers are minimised.

Leaving the study page stops new samples. Existing vendor data requires deletion
under the configured workspace policy; seven-day local research retention does
not control vendor retention. Do not enrol participants before confirming both.

## Validation boundary

Default-disabled, missing-key, explicit-consent, forged-cookie, mismatched vendor
event and outage tests use synthetic fixtures. They demonstrate mechanics only.
The supplied public EU key has not produced a real event in a configured study.
The local exact agent-module probe returned HTTP 403; local Chromium and Docker
are unavailable. This does not determine whether the key itself is valid.
Issue #68's real event-ID acceptance criterion remains blocked until a configured EU study
produces a real event and the research collection displays its minimised evidence.

An explicit real-vendor check is available separately from ordinary CI:
`npx playwright test --config research-tests/playwright.config.ts`.
Run it only against an isolated configured stack with
`FINGERPRINT_VENDOR_TEST=true`, `TEST_HMRC_URL`, `TEST_OBSERVATORY_URL`,
`RESEARCH_SOURCE_COMMIT` (the deployed 40-character commit),
`OBSERVATORY_EVALUATION_KEY`, `RESEARCH_PSEUDONYM_KEY`, and `DATABASE_URL`
pointing to that stack's Observatory database. Configure the public key only in
the HMRC build environment, enable the study and research collection at runtime,
and leave the server verification secret unset for this unverified-claim check.
Never commit key values or include them in commands recorded by CI logs.
The check creates an unlabelled monitoring attempt, explicitly opts in, requires
real returned event and visitor IDs, compares persisted HMACs to those IDs,
checks the protected session/attempt join, and registers the sensor observation
without assigning an execution class. It hard-fails on absent configuration or
vendor failure; it has no mocked vendor response. Traces/screenshots/video are
disabled to avoid capturing raw identifiers or enrolment credentials.

CI runs the ordinary default-disabled browser assertion, then switches a one-off
HMRC container to enabled with no vendor key and repeats the assertion for
`missing` coverage. Both assert zero vendor requests and HMRC remains usable;
the original HMRC container is restored before subsequent checks. Public mode
disables the research endpoints and sensor even if the study flag is configured.

Official sources checked 9 October 2026:

- [Fingerprint React README](https://github.com/fingerprintjs/react)
- [JavaScript get options](https://docs.fingerprint.com/reference/js-agent-get-function)
- [Server API, EU region and Bearer authentication](https://docs.fingerprint.com/reference/server-api)
- [v4 event response](https://docs.fingerprint.com/reference/server-api-get-event)


## Manual Actions runner

The `Opt-in EU Fingerprint vendor validation` workflow is manual-only. Configure the Actions secret `FINGERPRINT_PUBLIC_API_KEY` with the public EU key, then dispatch `.github/workflows/fingerprint-vendor.yml` against the reviewed revision. The secret provides automatic log masking even though the browser key is public. No server verification secret is required for this client-claim check.

The isolated synthetic stack requires two real SDK events, persists their event/visitor HMACs and records whether the observed visitor hashes match without equating either result with a physical person. It also records a genuine HMRC request using the enrolled research cookie, imports its authenticated feed event and verifies the protected session/attempt association for all observations. The run remains unlabelled and identifiers remain unverified client claims. Missing configuration or vendor failure fails the run; it never substitutes fixture IDs. The workflow exports a minimal success summary and no raw identifiers, environment dumps, traces, screenshots, video or artifacts.
