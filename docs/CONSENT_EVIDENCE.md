# Consent evidence (synthetic prototype assumptions)

Each successful approval now writes one immutable evidence record in the same database transaction as the mandate and its root delegation. The request's single-use compare-and-set and a unique approval index prevent concurrent approvals from creating multiple original records. The record uses #30's pinned catalogue presentation rather than the latest publication.

It records only the principal's internal pseudonymous reference, registered representative identity/provider and assurance, registered service identity, catalogue ID/version/digest, approved capability definitions and exact risk/identity/fresh-approval explanations, common purpose/condition terms, selected scope, duration, approval timestamp/method and expiry. There are no enforceable condition values in the current contract: restrictions are explicitly empty until #32. No prompts, reasoning, claim bodies, credentials, sign-in subject, email, IP address or raw identity documents are copied. The pseudonymous reference remains personal data; this is not an anonymisation claim.

The signed-in citizen form is labelled `CITIZEN_BROWSER`; the existing synthetic demo approval API/helpers are labelled `SYNTHETIC_DEMO_API`. That label describes the route through which approval was recorded, not legal validity or independent proof of human intent. Existing preconfigured/legacy grants are not backfilled with invented evidence: their detail page explains that no original wording was recorded.

Scope removal and revocation append separate history entries rather than changing the approval. Replacement by a newly approved request records revocation of the old grant. Natural expiry is established by the original fixed expiry and current mandate status, not a new claim of citizen action. Receipts, statements and service-reported outcomes remain separate; a consent snapshot does not prove the citizen approved each later statement or transaction.

The citizen detail page checks the current principal before reading evidence. No agent/service evidence API exists. Successful history reads append a minimal audit record (mandate reference, principal reference, timestamp); it contains no IP/browser fingerprint. Unauthenticated/other-principal requests receive the existing login/not-found response and do not receive evidence. Denied attempts are not yet persisted in this read-audit table. Production monitoring of denied access, audit-reader roles and audit retention need security/privacy design.

Database triggers reject updates and direct deletion of evidence and its read audit while the parent mandate exists. The application has no snapshot-edit route. Catalogue publication, scope narrowing, revocation and receipt disputes leave original evidence intact. This protects against application mutations; a database administrator can still alter schema/permissions and is outside the prototype's trust boundary.

## Retention, erasure and migration

These are prototype assumptions, not approved UK GDPR/legal retention rules:

- Keep evidence, change history and successful-read audit for the lifetime of the synthetic mandate, including after revocation/expiry.
- No automatic retention deadline or redaction workflow is implemented. A real service owner/DPO must decide purpose, lawful basis, retention periods, access/rectification/erasure handling, dispute holds and security roles before real data.
- An explicit parent-mandate deletion cascades evidence/audit deletion. This preserves the existing synthetic demo reset and provides an administrative erasure mechanism, not a citizen self-service promise. The trigger permits this cascade only after the parent no longer exists. Ordinary revocation is not erasure.
- Migration adds new tables; existing grants remain valid without retrospectively fabricated consent evidence. New approvals require the pinned catalogue validated by #30.

## Verification

Offline: `npx vitest run tests/consent-presentation.test.ts tests/consent-evidence.test.ts`, Delegate typecheck/build, Prisma schema validation.

Against an isolated migrated and seeded Delegate/PostgreSQL stack: `npx vitest run tests/consent-evidence-integration.test.ts tests/catalogue-adoption.test.ts tests/consent-csrf.test.ts`. These exercise mutation/deletion rejection, concurrent approval, original wording after publication changes, narrowing/revocation, principal isolation and explicit synthetic erasure. Browser acceptance also requires the full sign-in/consent/lifecycle journey and review of the original/current/history sections on mobile and keyboard.
