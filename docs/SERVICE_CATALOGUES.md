# Service catalogue publication (synthetic protocol v1)

A platform administrator registers a service identity and secret first. Catalogue publication cannot create identities. Agents and citizen credentials cannot publish. Each department chooses stable, service-scoped codes and owns their business meanings.

POST `/api/services/{slug}/catalogues` with that service's `x-service-key`, JSON content type, and a document like:

```json
{"schema_version":1,"service":"hmrc-personal-tax","version":1,"capabilities":[{"code":"view_case","name":"View your case","description":"Read the status of your synthetic case.","risk":"LOW","requires_step_up":false,"minimum_assurance":"REGISTERED","operation":{"method":"GET","path":"/api/cases"}}]}
```

Bodies are limited to 64 KiB and 64 capabilities; names/descriptions are plain text. Unknown fields, duplicate codes, HTML/control characters, unsupported schema/constraint types and weak HIGH-risk declarations fail closed. Optional constraints support only bounded enumerated value sets. This deliberately narrow schema does not claim RFC 9396 conformance. References describe operations; publication grants nobody authority.

Versions are positive integers and increase per service. Republishing identical content is idempotent (200); first publication is 201. Changed content under an existing version and non-increasing new versions return 409. A per-service transaction lock serialises concurrent publications; a database trigger prevents mutation/deletion of a saved publication. Digests use SHA-256 over sorted object keys, preserving array order. They detect content changes, not legal validity.

Authenticated GET of the same URL returns the latest authoritative record; `?version=1` returns historical content. `/api/catalogues/{slug}` provides public read-only discovery of the latest safe document and digest. It carries no credentials, citizen data or grants.

Existing HMRC seed capability rows and active grants remain unchanged by publication. Migration to catalogue-backed requests/consent is delivered in #29–31. Until then publication is an immutable registration/discovery foundation, not a replacement consent flow. Removing a code from a new catalogue does not alter previous evidence or silently grant a new code. Changed meanings require fresh consent; no implicit migration or grandfathering to broader scope is permitted. Emergency withdrawal remains a platform/service governance question (#56).

Minimum prototype floors require HIGH-risk operations to declare step-up and at least REGISTERED assurance. A receiving service may enforce stronger requirements. These are synthetic integrity controls; cross-government catalogue governance and legal assurance floors require the owners/evidence identified in #56.

Run `npx vitest run tests/catalogues.test.ts` against an isolated Delegate database after deploying migrations. It verifies credential isolation, concurrent idempotence, immutable history, version conflicts, unchanged existing capability rows and malicious metadata rejection.

## HMRC bootstrap and updates (#29)

HMRC owns `apps/hmrc/service-catalogue.json`, including the eight stable capability codes, operation references, security declarations and bounded approval presentation fields. Delegate has no HMRC capability map or transaction-field map. HMRC continues to own domain validation and normalisation before sending a proposed action.

`npm run db:setup` registers this artifact through the authenticated catalogue POST handler before creating citizen fixtures. The in-process local bootstrap uses the same Request, service credential, validation and publication transaction as HTTP registration, so no running web server is needed. Docker copies the HMRC-owned artifact as local bootstrap configuration. Repeated startup with the identical version replays the publication. Bootstrap authenticates an existing service rather than resetting its credentials.

To publish an update, edit the HMRC artifact, increase `version`, and run `npm run catalogue:register -w apps/delegate`. This only registers the catalogue; it does not delete citizens or grants. A department can also send the artifact over HTTP to `POST /api/services/{slug}/catalogues` with its own `x-service-key`. An alternate local artifact can be supplied with `SERVICE_CATALOGUE_FILE`; service identity provisioning and key distribution remain local synthetic setup, not an open onboarding API.

Keep a capability code stable only while its meaning remains stable. Add a new code for a different action. Remove a capability from a new version to stop requesting new authority for it; existing grants retain their original capability rows and still support explicit revocation. Every publication gets distinct capability IDs. New requests use the latest publication; pending requests and grants retain their original rows. Version decreases and changed content at the same version are refused. To roll back service text or available capabilities, publish the prior content under a higher version; do not delete catalogue history or rewrite grants. A service that withdraws support for an action must refuse it at its domain boundary even if historical authority remains.

On first publication (or bootstrap replay of that first version after an upgrade), an equivalent legacy capability (same code, name, risk and step-up requirement) receives registered presentation metadata while retaining its ID and security settings. Incompatible legacy permissions remain untouched and fail closed if no approval presentation exists. The migration preserves legacy rows, and materialises all already-published versions without changing their documents/digests.

The citizen demo reset recreates synthetic people, delegates and history from the current registered capabilities. It preserves service identities, catalogue publications and all capability versions. It never registers a stale embedded capability list. CLI reset registers the current HMRC artifact idempotently first, and fails before resetting fixtures if registration fails. Browser reset uses the stored latest publication.

Approval field metadata supports only bounded text/digit transformations, fixed or bounded character-class patterns and explicit last-character masking. Delegate renders plain escaped text and hashes the same normalised fields it displays. It executes no supplied script, HTML or arbitrary regular expression. HIGH risk still requires transaction approval and at least REGISTERED assurance; stronger registered minimum assurance is enforced on each check.
