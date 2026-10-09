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
No real vendor key/event has been exercised in this implementation. Issue #68's
real event-ID acceptance criterion remains blocked until a configured EU study
produces a real event and the research collection displays its minimised evidence.

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
