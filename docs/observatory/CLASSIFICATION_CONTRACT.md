# Blind sensor and classifier contract — version 1

Issue #72 adds a research-only contract and deterministic integration stub. It does not implement the trained statistical comparator in #73. No human study or paid vendor result is represented by the stub.

`src/lib/classification.ts` defines `SensorAdapter`, `ClassifierAdapter`, normalized `EvidenceRecord`, immutable `ExperimentConfig` and versioned `ClassificationResult`. Source observations are parsed with the strict shared feed schema. The mock source sensor maps signature verification, source latency and browser/vendor availability to allowlisted signals. Each signal carries explicit observed/not observed/not configured/error missingness, provenance and unknown confidence. Evidence includes source/method/clock, sensor config/version, source session/transaction pseudonyms and synthetic sensitivity. No browser absence is a human classification.

The adapter receives only its selected signal values and a trusted classifier configuration. Source IDs, session/transaction references, observed lanes, source outcomes, caller run tags, protected labels, evaluator provenance and generation prompts are excluded. The current configured classification question describes observed signature verification. Its classifier prompt is null. A future language model classifier must supply its own versioned classification prompt; experiment-generation prompts must never enter inference. Classified `VERIFIED_SIGNATURE` means exactly a source-recorded verified signature. It does not establish human or AI execution, agent legitimacy, eligibility or authority.

## Storage and reruns

An evidence snapshot freezes the first normalized source record for each source/event/schema combination. Canonical JSON SHA-256 digests identify exact evidence and classifier configs. All three inference tables have PostgreSQL UPDATE/DELETE rejection triggers and no join to the protected ledger. Every request appends a new classification run, preserving earlier results and configuration. If mapping semantics change, increment the evidence schema version. A changed adapter version cannot silently rerun an old frozen config: it returns an explicit adapter mismatch error. Wall-clock latency is recorded separately and can differ on deterministic reruns.

Raw detector responses are not collected by these stub adapters; `raw_result_ref` is null. Future detectors must reference restricted external records rather than store secret/vendor payloads inline. Unknown estimated paid cost remains null. Errors are redacted to a stable reason and retained as error/abstention, never converted into negative predictions.

These synthetic evidence tables intentionally reject deletion through the application/database role. Do not enroll real participants until a separately approved retention/withdrawal process can purge a complete study through privileged administrative tooling. Reset disposable synthetic databases rather than deleting individual immutable rows.

## Research API

Collection/evaluation access follows the existing distinct minimum-length keys, public-mode disablement and private/no-store responses in `GROUND_TRUTH.md`.

- `POST /api/research/classifications` with `x-collection-key`: `{source_service,source_event_id,classifier?,threshold?}` freezes a source observation already ingested. Classifier is `stub-rule` (default) or `unavailable-paid`; threshold is finite 0–1 (default 0.5). Unknown fields, injected labels, unknown adapters and invalid thresholds are rejected.
- The same POST with `{snapshot_id,config_id}` appends a run against the exact frozen input/config. No source reread or truth lookup occurs.
- `GET /api/monitoring/classifications` with `x-collection-key`, or `GET /api/evaluation/classifications` with `x-evaluation-key`, returns the latest 100 runs including normalized snapshot/config. This is research data; protected ledger truth is not included.

The unavailable paid adapter abstains with `DETECTOR_NOT_CONFIGURED`; it never calls a vendor. Fingerprint real acceptance remains #68. A device match is not execution truth. The deterministic stub classifies only recorded true signature evidence and abstains on missing/false evidence. Its score 1 is a rule output, not calibrated accuracy. Threshold tuning, train/calibration/holdout partitions and logistic fusion remain #73.

## Validation

`npm test -w apps/observatory` tests the typed end-to-end adapters, API-only absence, blocked/error browser sensors, unavailable paid adapters, inconsistent signals, redacted thrown/invalid adapter results, feature selection, label/tag leakage and deterministic frozen input preservation. `npm run typecheck -w apps/observatory` verifies the generated database client and routes. `npm run verify:classifications -w apps/observatory` runs a synthetic fixture against an isolated migrated PostgreSQL database: persisted rerun, frozen-row reuse, SQL immutability, abstention and injection rejection. It makes no source-service requests or domain-effect claims.
