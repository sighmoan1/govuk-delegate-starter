# WhenIsBins connector demonstration

This document describes the isolated fixture regression. For the publicly accessible real-service journeys and their actual results, see [live acceptance](LIVE_ACCEPTANCE.md).

These three journeys run against our synthetic connector and provider fixture. WhenIsBins has not installed Delegate or Observatory. No council is contacted, no real email is sent and no live recurring task is created. This proves our integration controls and observable execution path; it does not prove that a real WhenIsBins email subscription or delivery succeeded.

The local demonstration portal asks the citizen to review permissions in the real Delegate browser flow, which redirects through the local GOV.UK One Login simulator. Requested permissions start unchecked. The connector then checks the current relationship and service-owned property restriction. Real government identity assurance is not provided by the simulator.

1. **Read my bin dates once.** Choose the lookup journey, review and allow the permission for Sam's synthetic home, return to the assistant status page and run the request. Show the qualified collection result and recorded outcome. Open the authority in Delegate, remove access and run again: the connector refuses before contacting the provider fixture.
2. **Sign me up for reminder emails.** Allow the separate email capability, attempt the signup and approve that exact proposed action in Delegate. Retry the same operation: a pending confirmation is distinct from a completed subscription. Confirm through the explicitly simulated inbox control. Cancelling uses its own permission and exact-action approval; revoking an agent does not automatically unsubscribe an existing reminder subscription. No live mailbox or email delivery is involved.
3. **Have my assistant check weekly.** Approve collection-date permission and separately agree the bounded schedule. Each simulated tick advances the agent's clock by one week, makes a fresh connector request and records a distinct occurrence. Show pause/resume/stop separately from Delegate authority. Remove access in Delegate and tick again: the next execution is refused and produces no new provider call. Registering a task or seeing one successful tick does not prove indefinite future reliability.

The scheduler is an external agent component. Delegate never plans work or owns the schedule. The portal accelerates a synthetic clock to make multiple executions visible during a short demo; it does not install a background task. See [scheduler operating notes](SCHEDULER.md) for restart, lease, retries, end dates and daylight-saving semantics.

## Isolated verification

Use an explicitly isolated stack, never the existing public or shared demonstration databases. No test below invokes the repository's reset/global setup.

```sh
WHENISBINS_URL=http://127.0.0.1:5710 \
DELEGATE_URL=http://localhost:5700 \
ONELOGIN_URL=http://localhost:5701 \
HMRC_URL=http://localhost:5702 \
npx playwright test --config e2e/whenisbins.config.ts
```

The dedicated browser suite exercises real sign-in, unchecked consent, permission review, authorisation, exact-action approval, synthetic outcomes and real revocation. It also verifies the portal's cross-origin write refusal, keyboard skip link and 320px reflow. It intentionally retains its synthetic grants/receipts in the isolated database as evidence.

The authority verification script creates fresh synthetic test agents, uses real token and consent-request APIs, approves test-only requests through Delegate's existing fixture helper, then calls the running connector. Only this script's test agents and grants are changed; Sam's pre-existing grants are not revoked or reset.

```sh
WHENISBINS_TEST_ISOLATED=true \
DATABASE_URL=postgresql://delegate:delegate@localhost:55435/delegate \
DELEGATE_URL=http://localhost:5700 \
WHENISBINS_URL=http://127.0.0.1:5710 \
npx tsx --tsconfig apps/delegate/tsconfig.json scripts/whenisbins/verify-authority.ts
```

Set the isolated stack's agent-signing and connector-operations keys in the script environment when they differ from local defaults. Keep those values private. Cases cover authorised success, missing credentials, revocation, expiry, unknown delegate, missing relationship and wrong-property refusal. Every attempt must create connector activity, every completed Delegate check must have its activity row, and denied attempts must create zero provider-call events.

## Evidence limits

Keep connector attempts, Delegate checks, provider requests, committed effects, subscription confirmation and scheduled occurrences separate. The fixture labels and accelerated-clock traces are synthetic ground truth. Observatory can inspect our exported events and known execution traces; it cannot see unrelated WhenIsBins visitors or Tom's service logs. Any real trial requires separate explicit configuration and supported interfaces. Work requiring Tom's integration or observations remains held until discussed with him.

## Recorded local verification — 10 October 2026

On the isolated stack (Delegate5700, One Login5701, connector5710, PostgreSQL55435), the dedicated browser suite passed all four tests in 7.8 seconds. It exercised the real unchecked permission/One Login/Delegate consent screens, exact signup and cancellation approvals, synthetic mailbox confirmation, two separately observed scheduled occurrences, pause/resume/stop and actual authority revocation followed by refusal. The suite also passed cross-origin mutation refusal, first-focus skip-link and 320px reflow checks.

The standalone real-transport verification passed all seven authority cases: authorised, undelegated, revoked, expired, unknown delegate, missing relationship and wrong property. Each attempt generated connector activity; refused cases generated zero outbound provider-call events; returned Delegate check IDs resolved to Delegate activity rows. The test fixtures used fresh agents and did not reset or revoke unrelated browser grants.

These are automated synthetic integration results. They establish neither successful live WhenIsBins email signup/delivery nor adoption by real agents/citizens. The fixture clock is accelerated, and the bin provider and email website are synthetic. No Tom repository or production service was touched.

Schedule registration and occurrence observations use IDs obtained from the persisted agent runner. The internal dispatch context supplies the real job ID and occurrence ID; arbitrary HTTP callers cannot set those trusted tags. Registration is recorded after a job is saved, and an occurrence is recorded after its actual execution attempt. Observation-hook failures do not grant authority or block an otherwise valid service action: the retained runner receipts remain independent evidence, and a missing research event must not be interpreted as proof that nothing ran.

The Observatory acceptance verifier checks the real connector feed, collection boundary and private research database after the three journeys have generated evidence:

```sh
TSX_TSCONFIG_PATH=apps/observatory/tsconfig.json \
node --env-file=apps/observatory/.env --import tsx scripts/whenisbins/verify-observatory.ts
```

Use only the isolated Observatory environment file. This verifier performs read-only evidence checks and import-boundary checks, not fixture resets. The research projection uses trusted source correlation and minimised pseudonymous identifiers; it does not export the email address, access token or consent payload.

## Run the complete isolated demonstration

Use a dedicated checkout with Node 22+, Docker and installed dependencies. The launcher uses a separate Docker project/database on 55435, One Login on 5799 and apps on 5700–5703/5710. It refuses occupied application ports and does not reset other stacks.

```sh
npm ci
npx playwright install chromium
npm run whenisbins:demo
# Open http://127.0.0.1:5710
bash scripts/whenisbins/verify.sh
npm run whenisbins:stop
```

Stopping preserves this demonstration's synthetic database, private receipts and schedules. Restart uses them again. Private files and logs are in `.whenisbins-demo/`; do not publish them or expose the fixture portal through a public tunnel. The launcher seeds only its first start. Its optional Observatory is on http://localhost:5703/whenisbins and requires the local collection key to view evidence.

The email website fixture also persists its synthetic subscription and stop-link state across connector restarts. It never sends mail. Live lookup is a separate explicit configuration in CONNECTOR.md; those fixture checks do not establish live website compatibility or real inbox handling. Subsequent actual results are recorded separately in [live acceptance](LIVE_ACCEPTANCE.md).

After the recurring browser journey, verify its trusted source evidence:

```sh
WHENISBINS_URL=http://127.0.0.1:5710 npx tsx scripts/whenisbins/verify-scheduled-evidence.ts
```

The check requires one actual registered job, three distinct occurrence IDs, two completed lookups and the final revoked occurrence's correlated refusal with zero provider-call evidence. The authority verifier also asserts the exact reason for each refusal, including `UNKNOWN_DELEGATE`; a generic authentication failure does not satisfy that case.

The final scheduler-specific rerun passed after trusted IDs were retained on early refusals. The read-only scheduled-evidence verifier passed: one actual registered job, three distinct persisted occurrences, two completed lookups and the third revoked occurrence's correlated refusal with zero provider-call events. The full four-browser suite had also passed again in 7.4 seconds, and the seven authority cases passed with exact refusal-reason assertions.

The simulated inbox confirmation is bound to the portal session's approved principal, original grant, actual registered agent ID and signup operation key. Having a portal cookie or a different approved journey does not identify another session's pending subscription. Before citizen approval, the confirmation callback is not invoked. The portal never sends a raw email address or agent token to the browser; the exact-action approval screen remains responsible for showing the citizen what they are authorising.

The clean-launcher acceptance also exercised the actual CLI entrypoint over HTTP using the ordinary wall clock, with no injected clock or transport. `verify-worker.ts` registered a fresh synthetic agent, approved its own property-scoped grant, created a due job and completed a real connector-fixture lookup. It then revoked only that grant, created a second due job and observed exact `AUTHORISATION_REVOKED` refusal, persisted `authority-refused` job state and zero provider calls for that agent's refused attempt. Its ephemeral client secret and bearer token were absent from both persisted job JSON and connector activity. Private temporary job files were removed; unrelated grants were retained. No daemon or live recurring task was started.

```sh
WHENISBINS_TEST_ISOLATED=true DATABASE_URL=postgresql://delegate:delegate@localhost:55435/delegate \
DELEGATE_URL=http://localhost:5700 WHENISBINS_URL=http://127.0.0.1:5710 \
TSX_TSCONFIG_PATH=apps/delegate/tsconfig.json \
node --env-file=apps/delegate/.env --import tsx scripts/whenisbins/verify-worker.ts
```

`scripts/whenisbins/verify.sh` sequences the authority cases, browser journeys, trusted schedule evidence, actual CLI-worker HTTP acceptance and Observatory verification against the isolated stack. It does not call the repository's destructive global setup.

Final acceptance on the isolated launcher: 7 real HTTP authority cases with exact refusal reasons; 4 browser journeys; trusted schedule correlation; a real-time CLI worker completion and subsequent revocation refusal; actual PostgreSQL ingestion, zero-insert replay, connection restart retention, private monitoring and execution-truth isolation. Component suites passed 57 connector/integration tests, 18 standalone browser-adapter tests and 25 runner tests. HMRC's database/queue regression passed 131 tests; 74 HTTP relationship, step-up, scope and independent-service regression tests passed. The manual lookup consent → outcome → removed authority → refusal journey was also checked through the browser after a clean local launch. These are synthetic test results; they are not a measurement of real AI participation or live email delivery.

## Delivery scope and parked cancellation

The verified lookup, recurring-agent, monitoring and native signup/activation journeys can be delivered independently of [parked native cancellation #132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132), following the owner-approved scope split on 10 October 2026. The fixture still tests cancellation permissions and forms; the live control stays disabled. The test subscription remains active, and Delegate revocation does not unsubscribe it. Reopen the separate cancellation work only when the legitimate owned stop workflow is available, then obtain fresh exact-action approval and independent outcome evidence. See [recorded live acceptance](LIVE_ACCEPTANCE.md).
