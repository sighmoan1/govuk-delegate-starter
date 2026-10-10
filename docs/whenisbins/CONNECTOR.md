# WhenIsBins connector
Independent adapter; WhenIsBins has installed nothing. Delegate is checked centrally before every operation and replay. Service-owned, bounded synthetic property IDs are presented in consent and enforced against the returned subject, restrictions and catalogue provenance. Purpose text grants no scope. This does not establish ownership of a real property.

Register this service without resetting citizens:
```sh
SERVICE_CATALOGUE_FILE=../whenisbins/service-catalogue.json DEMO_SERVICE_NAME="WhenIsBins connector" HMRC_SERVICE_KEY=dev-whenisbins-service-key npm run catalogue:register -w apps/delegate
npm start -w apps/whenisbins
```
Run against an isolated stack. Default API is POST http://localhost:3310/api/collections, Bearer registered agent token, x-principal-id, stable Idempotency-Key, JSON {"property_id":"home-sam"}. Request read_collection_dates with constraints {"read_collection_dates":{"property_id":["home-sam"]}} and approve in the citizen browser. A plain unrestricted grant is refused for this experiment.

The connector returns queued/partial/done/failed explicitly. 202 is pending, not completed. Subsequent identical keys continue the saved job; completed keys replay the saved result only after a fresh authority check. An uncertain submission uses its original provider key. An outcome-reporting failure does not turn a completed provider lookup into a failure or repeat it.

Local state is private and durable. A process crash leaving the lock directory stops writes; remove a lock only after verifying no process owns it. This deliberately conservative local single-store design is not a national queue. Research/ops events contain no address, email or bearer token. Ops inspection requires x-ops-key and is disabled in public mode.

## Live mode
Disabled by default. WHENISBINS_MODE=live, WHENISBINS_LIVE_ENABLED=true and an explicit private WHENISBINS_PROPERTIES_FILE and WHENISBINS_CATALOGUE_FILE are all required. The live catalogue must have a new version and only read_collection_dates, with fresh opaque bounded property IDs; do not rebind home-sam/home-other or reuse synthetic grants. Register it before seeking fresh consent. The connector privately seals each catalogue version to its property configuration and refuses changes under the same version. Display the exact property alongside its opaque ID in the connector before the citizen approves the matching ID in Delegate. Provide the trial's confirmed exact provider address/property binding privately; do not commit household data. Official origin is fixed and redirects refused. Optional WHENISBINS_API_TOKEN stays server-side. The adapter preserves qualifications and sends X-Agent: Delegate-WhenIsBins-connector. It cannot claim the upstream verified this declaration or grant.
The initial adapter supports the documented property/address discovery flow; councils requiring other fields need an explicit adapter and fail instead of guessing. No live lookup, subscriber, inbox or agent study is implied by fixture tests. Regular/commercial use and volumes require the operator arrangements in the published guide.
https://whenisbins.com/v1/guide
