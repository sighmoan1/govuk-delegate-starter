# Synthetic research feeds — schema version 1

## Inventory and boundary

HMRC already records `ServiceEvent` and exposes `/ops/events` for local demo/test tooling; that existing endpoint returns up to 500 raw events, is time-filtered and is unsuitable as a minimised research feed. Delegate already records `ActivityEvent` and renders citizen/internal summaries, with no restricted cursor export. New `GET /api/research/events` endpoints export selected observed evidence over HTTP. Observatory never connects to either source database. Existing service business logic, logging and authorisation are unchanged.

Each source feed is off by default. Enable only an isolated synthetic corpus with `RESEARCH_FEED_ENABLED=true`, `RESEARCH_FEED_KEY` and a project-specific `RESEARCH_PSEUDONYM_KEY`. It is unconditionally disabled in `PUBLIC_MODE=true`. Requests require `Authorization: Bearer <research read key>`; incorrect/unconfigured access gets a redacted 403. Only GET is implemented, with private/no-store responses; database/schema failure gets redacted 503. The key is separate from service, citizen and agent credentials and grants no transaction mutation.

## Versioned event meaning

Canonical validator: `packages/research-feed/src/index.ts`. Unknown fields, including credentials and ground-truth labels, are rejected rather than retained. Sources select only permitted fields from their own logs; names, principal/customer/subject IDs, authorisation IDs, request paths, submitted content, raw user agents, free-text reason/signature errors and browser fingerprint components are omitted.

| Field | Meaning |
|---|---|
| `schema_version` | Contract version 1 |
| `source_service`, `source_event_id` | Source and original opaque source record ID; unique ingestion key and traceability, not person identity |
| `event_kind` | Service request, authority check or distinct browser-sensor observation |
| `occurred_at` | Required source-recorded clock time; missing clocks are rejected, never coerced to an epoch; no clock synchronisation claim |
| `run_id` | UUID client tag remains an unverified caller claim; other free-text tags become source-scoped HMACs |
| `correlation.request_id` | Delegate's recorded opaque request ID; HMRC does not currently record one |
| `correlation.delegate_check_id` | Opaque Delegate check/source event ID, allowing a recorded HMRC check reference to join its source check |
| `correlation.session_id` | Source-scoped HMAC of an observed HMRC session identifier; not a person or visitor count |
| `correlation.transaction_id` | Missing in the existing source event logs; not invented from URL or timing |
| `observed` | Recorded lane, signature verification evidence and latency where the source has them; these do not establish AI operation |
| `outcome` | Recorded source decision plus distinct operation/replay/business refusal/technical throttle/etc. and cost class; missing on Delegate where unrecorded |
| `browser_sensor` | Missing for normal requests in this issue. Reserved distinct not_run/blocked/error/missing/identified states; later sensor events must carry provenance and pseudonymised 64-hex event/visitor identifiers |

Each nullable evidence field has `value`, `status` and `provenance`. **known** means a directly recorded source value, not independently verified cohort truth; **inferred** marks derived pseudonyms or caller claims; **missing** retains null when not recorded. Missing never means manual, harmless or unauthorised. Browser/AI/text assistance, business legitimacy and authority are separate variables. UUID run tags cannot identify a cohort without a separately protected, independently verified manifest (#70).

Browser sensor events use their own source event IDs, `event_kind=browser_sensor`, decision `OBSERVED` and lane `UNKNOWN`; they never impersonate service authorisation decisions. Vendor IDs must be HMAC-pseudonymised at the source research boundary. Client claims remain `unverified_client_claim` until independently checked. A device match is not human/AI ground truth. Identified sensor states require a nonmissing event pseudonym; missing/not_run states cannot carry vendor identifiers. Vendor_verified requires an identified event, but the schema is not itself an independent vendor verifier. No real vendor event is collected by #67.

## Pagination, recovery and append-only snapshots

Source keyset pages use ascending opaque source record IDs (`limit` 1–200) and a versioned source-scoped cursor. Pagination deliberately does not rely on source clock order, random UUID arrival order or a maximum timestamp. Within a scan, Observatory persists the cursor and appended snapshots in one transaction. A generation compare-and-swap prevents competing pullers rewinding a cursor. Unique `(source_service, source_event_id)` plus skip-duplicates retains the first minimised snapshot without rewriting history. A sensor arriving later must be a distinct event, not an edit of an existing snapshot. HMRC's request logger writes its final HTTP response class after handling; this is not a later business/queue outcome. Delegate records the individual authority-check decision. The feed does not assert that these source tables can never be altered by resets or manual tooling: if a source record changes under the same ID, Observatory deliberately retains its first snapshot. Later business transitions or corrected evidence need a separate immutable event/version ID; otherwise they are not represented by this feed. Do not infer queue completion from a request admission event.

At the end of each complete scan, the cursor resets to the beginning. Repeated scans deduplicate existing records and find late commits or records inserted before the previous cursor, even with older clocks. This intentionally rereads the small retained synthetic corpus, trading efficiency for transparent recovery. It is not a national-scale streaming design. The CLI caps each invocation at 50 pages per source and resumes a partial scan from its durable cursor next time. Transport failure, malformed page, source mismatch or database failure leaves that failed page's cursor unchanged. One unavailable source does not prevent the other source being attempted. Records deleted at the source before a complete rescan cannot be recovered.

Enable `RESEARCH_INGEST_ENABLED=true` in Observatory's isolated `.env`, configure both feed URLs/keys, migrate its database, then run `npm run ingest -w apps/observatory`. The CLI reads `.env`, processes each source separately and reports only counts/redacted failures. Full-cycle replay is safe. Key rotation changes future pseudonyms; original snapshots remain immutable, so use a new study/version when changing the project pseudonym key.

## Sensor collection extension

`POST /api/research/observations` on Observatory requires its separate `OBSERVATORY_COLLECTION_KEY` bearer credential and explicit ingestion opt-in. It accepts only schema-valid `hmrc` browser-sensor envelopes with decision OBSERVED; it never accepts ground-truth labels or raw vendor identifiers. Identical source event IDs are idempotent (201 inserted, 200 already retained). No source service invokes this path as part of a consent, authority or transaction decision. Later sensor integration (#68) must use a separate research-only path and cannot block public service use when collection fails.

## Recorded acceptance

CI creates a genuine HMRC HTTP request tagged with an opaque UUID, pulls the restricted feed into Observatory, verifies its source ID exists once, repeats a full scan and verifies one retained snapshot. It also checks missing-key refusal, POST-not-supported and minimised snapshot fields. Core HMRC/Delegate API/browser regression runs while Observatory is stopped. Unit tests cover credential gating/public disablement, bounded source-scoped cursors, replay deduplication, clock-skew/late events, failed-page recovery, stale cursor ownership and rejecting labels/credentials. Passing source code or tests is not a research accuracy result.
