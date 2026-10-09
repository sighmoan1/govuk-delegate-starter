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
