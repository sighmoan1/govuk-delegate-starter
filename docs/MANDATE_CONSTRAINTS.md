# Service-defined mandate restrictions

The synthetic contract supports bounded enum sets, inspired by rich authorisation requests without claiming RFC 9396 conformance. No expressions, prompts, arbitrary JSON schemas or executable policies are accepted.

A catalogue capability may publish `supported_constraints`: each field has `type: "enum"`, 1–32 permitted string values and an optional citizen-facing `label`. Constraints are keyed by requested capability then field:

```json
{"service":"hmrc-personal-tax","capabilities":["claim_job_expenses"],"constraints":{"claim_job_expenses":{"tax_year":["2026 to 2027"]}}}
```

Requests pin immutable capability/catalogue rows. The citizen sees requested restrictions, can remove values during consent, and cannot add values, remove an inherited field or approve an empty set. Approval evidence records the actual selected values and catalogue identity with the original wording. Citizens can narrow current restrictions on their authority details page; append-only history preserves the original approval.

Sub-agents inherit restrictions unless they supply narrower sets. Every live check intersects the current mandate, current delegation and all ancestors. Scope removal removes that scope's stored restrictions; revocation/expiry terminates the whole authority chain. Existing plain grants remain unrestricted within their original capabilities: catalogue publication adds no default restriction and no new authority to them.

The check response returns `constraints` and `constraint_provenance` (mandate, delegation and pinned catalogue). Services must send their compatible `catalogue_version` for restricted grants. Missing or different versions fail closed; version changes require fresh compatible consent rather than automatic reinterpretation. Unknown fields, malformed values, unsupported declarations, disjoint ancestor sets and tampered publications fail closed.

Delegate validates serialisation, catalogue membership, set narrowing, expiry and chain integrity. It never decides what a tax year or case reference means. HMRC catalogue version 2 defines `tax_year` for `view_tax_code` and `claim_job_expenses`; its own adapter enforces both the actual synthetic operation's fixed year (2026 to 2027) and any caller-supplied year before business effects. A request for a previous year does not cause the current-year operation to silently act for that year. Other capabilities remain plain; case-reference support is not advertised until a service implements its semantics.

Purpose text remains descriptive. It cannot grant additional actions. Limits are prototype mechanics, not a decision about legal delegation or production policy.

## Verification

`tests/constraints.test.ts` covers malicious serialisation, enum membership, subset/intersection and citizen form selection. `tests/constraints-integration.test.ts` covers immutable approval, compatible-version refusal, sub-agent narrowing, live ancestor effects, citizen isolation, HMRC cross-year refusal and revocation. The Playwright Delegate suite verifies citizen restriction selection and original evidence display. Full-stack CI is required before acceptance.
