# Independent synthetic council integration

The tiny council app owns `apps/council/service-catalogue.json`, its service key, its synthetic case records and its business rule: an agent may read only a case owned by the subject returned by Delegate. It is a read-only TypeScript HTTP service, deliberately smaller than HMRC. It imports no HMRC or Delegate application code. Its only integration is the existing authority-check and outcome HTTP API. No real council, HMRC, DWP or DVLA connection exists.

Run `npm run council:register` after Delegate database setup, then `npm run dev`. The registration is one command using the existing configurable catalogue bootstrap. `HMRC_SERVICE_KEY` is the bootstrap's existing environment variable name; the command passes the distinct **council** key through it, never the HMRC key. Override `COUNCIL_SERVICE_KEY` consistently in registration and the council process. Credentials are synthetic development fixtures; no new central department-specific implementation is needed. Docker Compose includes the registration job and council on port 3305.

The agent obtains its token from Delegate, requests `council-casework` / `view_case_status` through the normal authorisation-request API, and directs the person to `consent_url`. The same generic consent UI starts unchecked. With explicit approval the agent calls:

```http
GET http://localhost:3305/api/cases/status?reference=CASE-SAM
Authorization: Bearer <agent-token>
x-principal-id: <approved-principal-id>
```

The council pins its own service, capability and credential, asks Delegate, then independently checks the returned subject against its case records. A foreign or missing case produces the same 404 business refusal. No record is returned if authority or outcome recording is unavailable. Every attempted delegated check is recorded by Delegate; allowed checks additionally receive a council outcome, including business refusals.

`CASE-SAM` belongs to the simulator's seeded Sam subject; `CASE-OTHER` belongs to a different synthetic resident. The fixture is immutable and read-only, so there is no council write transaction, queue, quota, or step-up flow. These are outside this proof's scope. Both central capability scoping and council case ownership are enforced. Constraints are not advertised by this catalogue; #32 remains separate.

## Identity limit

The test uses the shared simulator subject for record matching. It does **not** demonstrate production pairwise-subject correlation between independently relying parties. See [identity-boundary follow-up #35](https://github.com/sighmoan1/govuk-delegate-starter/issues/35). Council has its own service credential, not a production One Login identity integration.

## Verification

- `npm test -w apps/council`: 10 unit tests (identity pinning, missing/revoked/expired authority, inaccessible cases, failure closed, read-only methods).
- `npm run typecheck -w apps/council`: TypeScript check.
- `npx vitest run tests/second-service.test.ts`: HTTP service isolation and revocation in both directions; requires running stack and council registration.
- `npx playwright test e2e/second-service.spec.ts`: real browser consent HMRC-only denial, council explicit approval and own record read, other-record refusal, council revocation with HMRC preserved.
- `git diff <parent> -- apps/delegate/src`: empty. Service definition is entirely in the council artifact and configuration.

Integration and browser results must be recorded from the running stack before declaring acceptance complete. This proof establishes mechanical service independence; it does not establish a national identity model or comparative benefit.
