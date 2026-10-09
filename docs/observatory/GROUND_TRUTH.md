# Protected research ground truth

This ledger records evaluator-attested execution provenance separately from source observations. It does not classify users, authorize transactions or prove human execution from a browser signal. No human participant runs or detector accuracy results have been collected by this implementation.

## Access and isolation

Configure distinct, random `OBSERVATORY_EVALUATION_KEY` and `OBSERVATORY_COLLECTION_KEY` values of at least 32 characters in the Observatory deployment. Keys are server secrets. Evaluation routes require `x-evaluation-key`; collection routes require `x-collection-key`. Missing/short keys disable their routes (503), incorrect credentials return 401, equal keys disable both, and `PUBLIC_MODE=true` disables both. All responses use private no-store caching. Keep Observatory on an isolated research network; key possession grants the respective research role.

Evaluator routes under `/api/evaluation` create runs, plan attempts, attest provenance, bind original ingested source events, enroll participants, complete runs and delete runs. Collector routes expose only opaque enrollment/session bindings and unlabelled monitoring counts. A sensor or model cannot write an execution class. Feed snapshots reject execution labels and contain no protected provenance. Declaration lane and signature verification remain source observations; neither means HUMAN_OPERATED or AI_AGENT.

## Recorded provenance

Each run has a random UUID, protocol/source revision, seed, study owner pseudonym, mode and optional unique trace digest. Each intended task has a random attempt and intent UUID. Monitoring attempts remain UNLABELLED permanently. Controlled attempts start PLANNED. VERIFIED means an authenticated evaluator submitted a trace-backed attestation, not that a POST automatically proves reality.

| Execution class | Required independent provenance |
| --- | --- |
| HUMAN_OPERATED / HUMAN_AI_ASSISTED | Research observer, manual-operation attestation, observer pseudonym, consent reference digest and trace digest; runner provenance forbidden |
| SCRIPTED_AUTOMATION | Controlled runner identity, source revision and trace digest |
| AI_AGENT_BROWSER / AI_AGENT_API | Agent execution trace, model/tool version, source revision and trace digest |

Store the actual trace and consent record in the study's restricted evidence store; the database holds hashes and pseudonyms, not names or consent documents. The evaluator must inspect human execution and distinguish assistance from automation. Neither enrollment, Playwright, user-agent, a signature nor Fingerprint is human ground truth.

## Enrollment contract

An evaluator plans an attempt then POSTs `{attempt_id}` to `/api/evaluation/enrolments`. The response contains a one-time 15-minute `enrollment_token` and ISO `expires_at`. Its hash alone is stored. After explicit participant opt-in and sensor configuration, the HMRC backend POSTs `{enrollment_token}` to `/api/research/enrolments/claim` with its collection key. Successful response is exactly `{session_id,run_id,attempt_id,expires_at}` with opaque UUIDs and a one-hour expiry. The HMRC server binds these in its signed HttpOnly cookie; the browser cannot choose a cohort or class. GET `/api/research/sessions/{session_id}` checks that binding is active. Token errors: malformed 400, unknown 404, expired 410, already claimed 409. Expired/deleted sessions return 404. Tokens do not establish human execution; observer attestation follows actual operation.

## Scripted deterministic scenarios

Fresh service execution uses the existing `scripts/e2/ci-run.sh` B/C workflow, with reset/reseed and fixed read, claim, idempotent retry, receipt-backed follow-up, forbidden operation and revoked-grant scenarios. `scripts/observatory/import-e2.mjs` deterministically replays the archived **observations** into a separate Observatory database; it never resubmits service transactions. The importer reads original JSON (or lossless gzip), checks its supplied SHA-256, successful runner assertions and independent durable claim/transaction/query state before attesting SCRIPTED_AUTOMATION. It preserves original HMRC/Delegate source IDs while suppressing historic human-readable tags and source subjects. The evaluator-only source-replay endpoint trusts the evaluator's audit of the archive; it is not a source signature verification protocol.

```
OBSERVATORY_URL=http://127.0.0.1:3303 RESEARCH_STUDY_OWNER=study-pseudonym \
  node scripts/observatory/import-e2.mjs path/to/run.json.gz ORIGINAL_JSON_SHA256
```

The endpoint binds only existing ingested source events and validates refusal/replay/write classes against their observations. UNIQUE_OPERATION/REPLAY require the attested independent-effect trace digest. Multiple source requests can belong to one intent and operation; exact source-event dedup prevents polling from creating requests. These request counts are recorded HMRC service-request attempts, not all HTTP traffic: source request IDs are not available. Delegate checks and browser-sensor observations are excluded. Sensor event IDs may be explicitly bound only when present in the ingested feed; they remain REQUEST_ONLY observations. Session correlation uses the same source-scoped HMAC in service and sensor feeds. A privileged evaluator can derive it from an enrollment UUID with the feed pseudonym key; no label enters that join. Monitoring-mode bindings record every ingested service request as REQUEST_ONLY, including writes and retries, so absence of truth never drops request coverage. Their original outcome/replay/refusal observations remain in the immutable feed snapshot. They make no audited durable-effect assertion; those separate ledger counters remain zero until independent evidence exists in a controlled run. The collection projection shows recorded requests and distinct intents plus audited operation/replay/refusal counts without execution labels.

Reimporting a completed digest returns its existing run. A partial import requires explicit evaluator DELETE `/api/evaluation/runs/{id}` then retry; original unlabelled source observations deduplicate. Deletion cascades attempts, bindings, tokens and sessions but does not erase the separate feed store or external trace/consent evidence. Study withdrawal must also remove those records under the protocol's retention policy. No automatic retention is implied. A completed run requires the declared attempt denominator and all planned provenance/bindings. This supports research tooling; human and agent studies still require actual enrollment and execution.
