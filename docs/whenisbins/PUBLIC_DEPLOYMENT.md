# Delivering the live WhenIsBins connector publicly

The designated public deployment was exercised against the actual unchanged service on 10 October 2026. See [live acceptance and remaining work](LIVE_ACCEPTANCE.md); real cancellation remains pending. These operating instructions alone are not evidence of a completed journey.

This optional deployment extends the existing named tunnel. It does not make the fixture portal a live WhenIsBins journey. Actual address-specific provider results, email subscription/delivery/confirmation/cancellation and ordinary-clock scheduled execution must be verified against the unchanged external service before claiming those journeys work.

The GOV.UK identity and Delegate authority remain explicitly synthetic. The real WhenIsBins adapter checks that synthetic authority and acts through our connector; WhenIsBins does not itself recognise or enforce Delegate. Tom has made no integration change. Native service integration remains on hold in #120–#122.

## Private inputs and credentials

The root deployment owner verifies the designated address and mailbox before enabling live mode, registers the independent service catalogue and assistant, and adds new strong credentials to the retained `.env.public`. Existing values, databases and grants stay intact. Use the non-resetting update for this upgrade. Fresh `npm run public` reseeds fixtures. Once a WhenIsBins host or private-input directory is configured, `public:stop` stops the worker/services and preserves credentials, private configuration, government data and external state; restart with update. Legacy deployments without live inputs retain their existing development-restoration behaviour.

Required private environment:

- `WHENISBINS_MODE=live`, `WHENISBINS_LIVE_ENABLED=true`, and existing `PUBLIC_MODE=true`.
- `WHENISBINS_PRIVATE_CONFIG_DIR` containing `properties.json`, `catalogue.json` and `mailboxes.json`. Keep this directory under ignored `.public/whenisbins` or outside the checkout. The files are mounted read-only at `/run/whenisbins`; never commit addresses, inbox details or service tokens.
- Registered `WHENISBINS_AGENT_CLIENT_ID`; distinct strong `WHENISBINS_AGENT_CLIENT_SECRET` and `WHENISBINS_SERVICE_KEY`; `WHENISBINS_PRESENTER_CODE_HASH` containing the SHA-256 hash of a strong private presenter code. Hash format alone does not establish code entropy.
- `WHENISBINS_RESEARCH_FEED_ENABLED=true` and distinct strong `WHENISBINS_RESEARCH_FEED_KEY` / `WHENISBINS_RESEARCH_PSEUDONYM_KEY`. These are dedicated to the private connector feed. They are not the existing source-service credentials or presenter code.
- `WHENISBINS_VERIFIED_EVIDENCE_PUBLISHED=true` explicitly publishes the reviewed static `/evidence` record shipped with this revision. Leave it false until that record applies to this deployment. It reads no private runtime inputs or feed data. The code repository is private; public visitors should use this page, not GitHub links.
- Optional `WHENISBINS_EVIDENCE_STATUS` and HTTPS `WHENISBINS_EVIDENCE_URL` describe independently verified deployment results and their remaining gaps. Keep default verification-in-progress copy until actual acceptance has run.
- Optional upstream `WHENISBINS_API_TOKEN` if operating under a token allowance. Do not silently substitute fixtures when credentials or the provider fail.
- `WHENISBINS_WORKER_ENABLED` defaults to false. The owner enables it only for the verified consented scheduled journey; registered jobs remain bounded by fresh authority checks.

Runtime connector state and verified mailbox evidence are private in the persistent `whenisbins-public-state` volume. `WHENISBINS_MAILBOX_EVIDENCE_FILE=/state/mailbox-evidence.json` is populated by the owner's actual mailbox verification, not by synthetic delivery claims. The image includes official Playwright Chromium for the real website adapter and contains no retained `.env.public`, private input directory or evidence files.

## Publish after readiness

Add `hosts.whenisbins` to the ignored named-tunnel configuration and create its DNS route through the existing tunnel. The intended address is `https://whenisbins-demo.bathos.org`; this document alone does not mean it is deployed or verified.

Run the non-resetting update from the reviewed checkout:

```sh
node scripts/public.mjs update
```

Before changing the environment, containers or ingress, the updater validates explicit live mode, private input files and credential separation. It preserves all existing credentials and changes only public address settings. It enables the optional `whenisbins-public` Compose profile, builds the service, checks `/health` locally, then switches the named ingress and checks public readiness. A healthy process is not proof a real journey succeeded.

Public ingress reaches host-loopback port 3310 only. The separate private feed listener is mapped to host-loopback 3311. The public handler always refuses `/ops/*` and `/api/research/*`, including requests holding a valid feed credential. The private listener uses only the strict read-side export and its separate credential; it does not expose operational or presenter APIs. Authenticated presenter controls also provide the simulated test sign-in and phone without exposing that information on anonymous routes. Cancellation controls default to unavailable until the native stop journey has been verified.

The private feed may be collected by an explicitly configured local Observatory. This update starts no Observatory service and publishes neither its UI nor protected evaluator data.

## Verify the delivered result

Use non-resetting browser checks on the actual HTTPS address. Confirm the presenter access boundary, synthetic-government identity notice, real provider provenance/outcome, separate email pending/confirmed/delivery states, cancellation and ordinary-clock scheduled executions. Exercise removal of authority and verify a later occurrence is refused with no upstream call. Confirm `/health` reveals no personal data and public research/ops routes are refused. Inspect correlated evidence through the private Observatory; publish only reviewed minimised results if a public evidence view is added separately.

Record the deployed revision, actual external outcomes, test commands/results and public URL on #119. Component fixtures, successful image builds, local readiness and unmerged PRs do not establish public live delivery. The named tunnel still depends on the presenter Mac and Docker remaining available.
