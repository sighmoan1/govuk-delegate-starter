# Presenter runbook and feature coverage

## Before the meeting

Use a dedicated synthetic stack. Retain the shared demo database and avoid reset-heavy testing against it. The recorded combined Observatory review used applications on 5300–5305 and PostgreSQL on 55434. Those are an existing isolated review setup, not guaranteed permanent endpoints. Standard Compose uses 3300–3305.

Rehearse the concept walkthrough once with the actual environment and note the source revision, date and outcomes. Check Delegate, mock One Login, HMRC, the About app and queue worker. Council is needed for the optional portability demonstration. The Observatory scene additionally requires PRs #109–110 or their reviewed integration branch. They remain unmerged when this pack was prepared. Do not suggest they are already on main.

For an existing standard installation, use README's reviewed fast-forward/rebuild instructions. For a new isolated installation use its development setup instructions. Do not delete a database volume or copy credentials into presentation material. Fresh stack provisioning and resets belong to the operator, before the meeting. Public mode changes sign-in and disables research feeds. Keep the Observatory and local reset/phone tools off public tunnels.

Open the briefing, account, HMRC and swarm tabs before presenting. Enter the Observatory collection key privately and clear/hide its field before screen sharing. Ground truth requires a different evaluation key and is optional. Never project a token, `.env`, access key or raw research payload containing secret material.

## A. Citizen permission and service enforcement, about three minutes

Use the registered synthetic Personal assistant through HMRC's agent-request route, or the supplied presenter-operated client. If the client is scripted, say so. Start from a fresh request, not a preconfigured grant with missing original consent evidence.

1. Open the request's returned consent URL as Sam. For a fresh claim rehearsal in local mode, enter a new synthetic email such as briefing-20261010@example.com and a nonempty password. The fixtures still display Sam Taylor. Reusing the prefilled Sam account can trigger the existing one-claim-per-tax-year rule; a fresh request alone does not clear previous service work. Strict/public mode needs the configured password and mock phone code.
2. On “Personal assistant wants to act for you”, show that choices start unchecked. Select “View your tax code” and “Claim tax relief for working from home”. Leave “Update your employment details” unchecked. Show duration and any requested restriction.
3. Continue to “Check what you are allowing”, then choose “Allow”. The request status is the agent's source of truth after consent. A configured return URL is not itself proof of approval. The seed callback is a placeholder, so stay on the confirmation/account page rather than follow it blindly.
4. Through the same agent identity, read the tax code and submit a synthetic expense claim. Inspect the actual response/receipt. If asynchronous, show “received” separately from later “recorded”. A presenter can use the supplied client below, or a compatible real agent. Exact schemas are in HMRC's discovery/OpenAPI documents. Real-agent success depends on the tool and handoff support.
5. Attempt the ungranted employment action and show the refusal. Do not deliberately run a malformed business request and mistake its validation failure for an authority refusal.
6. Open `/account/delegates`, choose View and show current scope, original consent and recent service outcomes. Choose Remove access and confirm.
7. Repeat the tax-code request using the same agent identity and show `AUTHORISATION_REVOKED`. Keep the history visible.

Expected observation: granted actions work, the excluded action is refused, revocation blocks the next action, and checks/outcomes remain inspectable. Accepted work can finish after revocation. This does not undo a claim or establish production legal authority.

The earlier isolated manual walkthrough and independent one-claim/zero-employment-update DB checks are recorded in issue #90. That evidence establishes the pinned rehearsal, not a new live run during this presentation.

### Supplied presenter client

From this checkout, with Node 20 or later, use the default local stack:

```sh
node scripts/briefings/demo.mjs prepare
```

For the existing isolated review stack:

```sh
DEMO_DELEGATE_URL=http://localhost:5300 DEMO_HMRC_URL=http://localhost:5302 node scripts/briefings/demo.mjs prepare
```

The command prints a fresh consent URL and a private state-file path. Follow steps 1–3 in the browser. Use the actual printed path in place of `STATE` below:

```sh
node scripts/briefings/demo.mjs status STATE
node scripts/briefings/demo.mjs act STATE
```

`act` reads the tax code, submits one synchronous synthetic claim and verifies the excluded employment action is refused. The same operation key is reused if `act` is repeated. It stops if the citizen selected the wrong scope or a response differs from the expected result. Inspect the account and remove access, then:

```sh
node scripts/briefings/demo.mjs after-revoke STATE
node scripts/briefings/demo.mjs clean STATE
```

The client obtains short-lived credentials without printing or saving them. State is owner-only in a temporary directory; it holds synthetic request references and the operation key. Loopback HTTP addresses are required. Custom synthetic seed credentials use `DEMO_AGENT_ID` and `DEMO_AGENT_SECRET` in the presenter's private environment. `clean` deletes the state file, not the grant or audit history. No global reset is performed.

## B. Repeated traffic and distinct citizen demand, about two minutes

Open About `/swarm`. During rehearsal choose N=10 and “Run all seven”. The runner creates fresh synthetic people, uses actual APIs/queue processing and does not need a global reset. Keep the result open for the meeting. At N=100 the run can take minutes because clients follow retry guidance.

Compare A/B/B-prime with C: repeated wishes for one claim remain one claim, while different people's claims are separate service work. Then show E's retry storm and F's polling load if useful. Read technical requests, authority checks, received/recorded claims and waiting time separately. Inspect failed invariants before claiming a successful result. The bottom scheduling comparison is a seeded simulation with printed assumptions.

Expected observation: duplicate attempts do not multiply claims, technical work is visible, and distinct demand differs from repetitive traffic in the recorded workload. Numerical thresholds are demonstration settings. The page is not a national load test. It does not simulate every hostile or unidentified flood. Delegate checks themselves still need production overload protection.

## C. Observation and uncertainty, about two minutes

Use the reviewed Observatory stack. Run its configured `npm run ingest -w apps/observatory` privately after producing source events. Ingestion explicitly pulls minimised feeds; the dashboard does not continuously poll services. Select monitoring, enter the collection key and choose “Load or refresh events”.

Filter to HMRC, then explore a source event. Show its response class, signature evidence and any recorded Delegate check reference. A feed response event does not prove later queue completion. Sensor events are separate, and an exact session-pseudonym match does not prove a sensor measured a particular request.

Show the missing/not-run/blocked/error states and detector coverage. If configured classification runs exist, inspect the prediction's source/config/version. Otherwise leave “not observed” visible. A signature-observation stub is not an AI detector or evidence of aggregate detection performance.

Optionally switch to research view using its separate evaluation key. The view clears prior rows and keys. Explain that VERIFIED SCRIPTED_AUTOMATION describes an audited execution trace, while the prediction remains a separate field. There are no human participant results. Do not manufacture a vendor event or present a populated fixture as vendor validation.

Expected observation: the workbench exposes evidence provenance and limits. It cannot currently show a validated national AI prevalence estimate.

## D. Independent council integration, optional

Request `council-casework` / `view_case_status` through the existing agent-request API and approve it in generic consent. Read `CASE-SAM` with the approved principal. Attempt `CASE-OTHER` and show the same 404 response used for inaccessible/missing cases. Revoke council authority and verify refusal while HMRC permission remains independent. Use the exact request documented in `docs/SECOND_SERVICE.md` privately. The council is read-only and uses a distinct service credential/catalogue. Shared simulator subjects simplify real-world identity matching.

## Additional design demonstrations

| Feature | Short briefing | Detailed briefing / evidence route |
| --- | --- | --- |
| Separate person and agent identity | A | Identity paths, signature and session regression |
| Request, unchecked consent and expiry | A | Fresh browser request and pinned evidence |
| Permitted / unpermitted action | A | Same credential, service-owned enforcement |
| Whole-grant revocation | A | Next request and retained history |
| Narrow a single permission | Optional | Account detail, then retry the removed capability |
| Service-defined restrictions | Mention | Tax-year selection and incompatible-target API refusal |
| Exact sensitive-action approval | Mention | Refund-account proposal/approval, altered-payload refusal |
| Original consent evidence | A briefly | Original/current/history views and DB immutability checks |
| Sub-agent chains | Mention | Rehearsed API request or recorded chain regression |
| Expired, unknown or missing authority | Mention | Named automated cases, not a fake UI control |
| Receipts and disputed answers | Optional | Prepared HMRC question/answer, account dispute, later reconciliation |
| Idempotency and conflict | B | Same operation key retry, changed-payload conflict |
| Durable queue and accepted work | B | Receipt and independent final claim state |
| Conditional progress polling | Mention | ETag/304 and retry guidance through the existing API |
| Multiple agents / hidden sessions | B | A/B/B-prime workload |
| Many people / provider burst | B | C/D workload and bystander measurement |
| Retry storm / polling flood | Optional B | E/F workload |
| Discovery and real-agent route choice | Optional | `/ask-your-agent` and original `/which-route` observations |
| Second service and scope isolation | Mention | D |
| Observation, immutable inputs/results | C | Reviewed PRs #109–110, SQL immutability/rerun evidence |
| Genuine participants / learned fusion | Outstanding | Pilot proposal, issues #71/#73/#75 |
| Real Fingerprint events | Outstanding | Issue #68's actual configured vendor acceptance |
| Grouped consent / federated issuers | Open design | Issues #34/#43 and DB-07/12 |

## If the live demo fails

Use the editable decks and the pinned evidence records. A screenshot is a view of its stated revision and recorded synthetic state. Explain the failed dependency and continue with that limitation. Do not display expected counts as live results. The deck's Observatory screenshot is a review-branch interface, not a vendor or participant result.

The supplied presenter client supports the full post-revocation API run. It is scripted and must be described that way; a compatible real assistant can also use the existing API. If the intended presenter needs a browser-only action console, record that as a separate engineering issue rather than pretending the current account page sends agent transactions.
