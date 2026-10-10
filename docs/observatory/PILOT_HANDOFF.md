# Participant pilot: owner review and operational handoff

**Draft handoff, not approval to recruit or collect. Prepared against source `de4904f` on 10 October 2026.** No participant sessions have been conducted for this handoff. The [proposed pilot](PARTICIPANT_PILOT.md) owns the study design; this file supplies the missing launch record and working sequence. Use the [participant materials](PILOT_PARTICIPANT_MATERIALS.md) as drafts for owner review.

The immediate proposal is the existing 24-intent feasibility pilot, including four consenting operators, manual/AI-assisted operation, scripted runs and independently traced AI operation. Confirm or amend that allocation before recruitment. This is neither the completed [500-case corpus #71](https://github.com/sighmoan1/govuk-delegate-starter/issues/71) nor a genuine-participant B/C comparison under [#47](https://github.com/sighmoan1/govuk-delegate-starter/issues/47). B still lacks a comparable participant consent/revocation UI. Do not recruit into a B/C effort comparison until that separate implementation and protocol amendment are reviewed.

## Private launch record to complete

Copy this table to restricted study storage. Keep names, contact details, participant records, credentials and filled evidence locations out of GitHub. Each approval needs its decision owner, date and private record reference. A merged documentation PR supplies none of these approvals.

| Required field | Value or evidence needed before recruitment |
|---|---|
| Launch ID and status | Unique ID; start as NOT_APPROVED; owner records any later release |
| Study owner, facilitator, independent reviewer | Named people, availability, escalation contact and responsibilities |
| Recruitment and accessibility | Approved eligibility/sampling approach, invitation channel, support and accessible alternatives; no recruitment has been sent |
| Participant materials | Reviewed version/digest of invitation, information and consent; approved contact and withdrawal wording |
| Scope and workload | C feasibility/manual context only; exact desired outcome for each intent, fixture instructions, capability/excluded-action scope, cohort allocation and arm order |
| Limits and checkpoints | Approved session duration, total planned-intent ceiling, first-two-human-session review appointment and stop/restart authority |
| Launch environment | Deployed full Git SHA, protocol digest, seed, separate DB/volume names, ports/network and application/worker configuration; preparation SHA above is not the launch pin |
| Access | Named collector/evaluator/admin access holders, restricted evidence locations and tested credential separation; store secret references rather than values |
| Tools and disclosures | Actual browser/device/model/tool versions; what any external provider receives, region/retention/export arrangements and participant choices |
| Sensor configuration | Explicit OFF/unconfigured/approved enabled states; propose vendor sensors OFF for the first pilot, subject to owner approval, without calling this vendor validation |
| Frozen inference | Feature allowlist, classifier/config digests, evidence schema; existing signature stub is not an AI detector |
| Retention and withdrawal | Approved deadlines, contact, scope/cutoff wording and access/deletion responsibility for every store below; proposed 30-day raw-event maximum is not an approved policy |
| Rehearsal evidence | Private references to access/failure, correlation, independent-effect and full deletion checks on disposable synthetic data; actual results and deviations |
| Release decision | Owner/reviewer decisions and dates; unresolved items, approval conditions and separately recorded restart decisions |

Unfilled fields mean the handoff remains NOT_APPROVED. External models or vendors must not be enabled simply because a configuration key is available. The owner must resolve lawful processing, disclosures and retention with the relevant privacy reviewer; this draft makes no legal compliance determination.

## Preparation and release sequence

1. Owner and reviewer inspect [research protocol](RESEARCH_PROTOCOL.md), [E2/E5 measurement boundaries](../VALIDATION.md) and [ledger semantics](GROUND_TRUTH.md), then complete the private launch record. Revise and freeze the participant materials after deciding the actual arrangements.
2. Environment owner provisions a separate disposable research stack and verifies its explicit database URLs/volume and service ports before any migration, reset or test. A shared demo, public WhenIsBins instance or real tax record is outside this pilot. Record exact setup commands privately; do not run a reset using inherited/default database settings.
3. Before inviting people, rehearse on synthetic data: wrong/missing collection/evaluation keys fail; monitoring omits execution labels; source ingestion and event joins work; Observatory/vendor failure does not alter service decisions; expected allowed, excluded and revoked effects are independently checked. Record commands, SHA, results and failures. Scripts remain SCRIPTED_AUTOMATION, never human evidence.
4. Rehearse withdrawal and scheduled retention deletion across every store listed below. Resolve immutability and privileged purge requirements before collecting people. Verify the result by independent queries/file checks rather than accepting an HTTP success as proof.
5. Owner records a release decision only after these checks and participant/access arrangements are reviewed. The team may then use the approved invitation through its agreed channel. No invitation, session or automated follow-up is created by this handoff.

## Session worksheet and facilitator sequence

Prepare an empty restricted worksheet for each operator. Assign pseudonyms and pre-plan intents before activity. Define each intent as one desired outcome: retries, polls, the excluded-action probe and the post-revocation probe remain linked evidence unless a separate outcome was explicitly planned. Do not turn five workflow steps into five successful transactions afterwards.

| Worksheet field | Record during the session |
|---|---|
| Identity and allocation | Operator pseudonym, planned cohort/condition, run/attempt/intent IDs, scenario and related-family IDs |
| Agreement | Participant-information version, consent record reference/digest and time; separate approved AI/vendor choices |
| Environment | Launch-record reference, actual tool/browser versions and sensor coverage/configuration |
| Outcome | Expected scope/result; actual durable outcome and independent audit reference; pending, refusal, failure, abandonment and unknown kept distinct |
| Effort | Start/end plus scope understanding, consent, handoff, outcome inspection, revocation and recovery time; missing values null with reason |
| Assistance | Help requests, interventions, support time, errors and participant takeover; accessibility support is not suspicious activity |
| Comprehension | Coded answers about who can act, excluded actions and what revocation changes; no private verbatim statements |
| Provenance | Independently observed execution class, minimized trace digest, source-event IDs and effect audit; unresolved mixed/unknown reasons |
| Review | Observer/reviewer pseudonyms, disagreements, corrections, stop/withdrawal request and follow-up state |

At the start, confirm the approved information and consent without treating a Delegate permission approval as consent to research. Explain that the person can skip, pause or stop. Use made-up account details and the approved synthetic instructions. The facilitator must not choose permissions or approve on the person's behalf.

Follow the tasks frozen under [the pilot proposal](PARTICIPANT_PILOT.md#tasks-and-genuine-effort). Observe real operation, including the permitted submission/receipt, excluded action and removal of future access. Ask the three comprehension questions without coaching; record missing observations instead of assuming success. End by confirming any removal request and explaining the agreed contact and follow-up. Do not quietly replace abandoned sessions to reach a success total.

Afterwards, the evaluator independently inspects execution and service effects before using the protected verification/binding routes described in [the pilot](PARTICIPANT_PILOT.md#collection-and-independent-audit). Human attestation requires actual observed operation and a consent digest. Tool assistance with a human operating remains assisted; autonomous AI operation needs its trace. Ambiguous mixed/unknown cases remain PLANNED with a private reason and their run stays OPEN; the current ledger has no verified mixed/unknown class.

Pause immediately for the proposal's stop conditions, including consent/withdrawal failure, label leakage, broken correlation or an unauthorized effect. Stop at the approved time/intent limit. The first two human sessions require the scheduled owner/reviewer checkpoint before expanding; restarting requires a recorded fix and protocol amendment where needed.

## Deletion and evidence handoff

The administrative withdrawal mapping lives separately from inference features and public reports. The owner must decide how to find all records for an operator and how to remove them without retaining an identifying cross-service map longer than approved.

| Store | Required withdrawal/retention rehearsal evidence |
|---|---|
| Contact, consent and private operator-ID mapping | Responsible holder; removal deadline and confirmation; retention exceptions, if any, reviewed before materials are released |
| Ledger attempts, bindings, tokens and sessions | Exact run/attempt mapping; DELETE removes a whole run, so isolate operators or approve a scoped privileged purge; verify cascade and inactive enrollment/session state |
| Ingested source observations | Explicit removal/isolation plan and independent verification; ledger DELETE does not erase this store |
| Frozen classification evidence/config/runs | Approved privileged purge or isolated-study database disposal and verification; UPDATE/DELETE rejection triggers prohibit ordinary row removal |
| HMRC/Delegate synthetic fixtures and logs | Segregated session/arm records and approved cleanup of session/grant/action evidence; avoid deleting another study's records |
| External tool/vendor stores | Approved disclosure, responsible holder and actual deletion/retention arrangements; OFF is a coverage state, not proof of external deletion |
| Restricted traces, worksheets, exports and backups | Enumerated copies, holders, deadlines and verified cleanup; redaction alone is not erasure |
| Deidentified reports | Approved aggregation/anonymisation and withdrawal-cutoff wording before publication; no promise of removal from genuinely anonymous aggregates without an agreed method |

Only after independent review, prepare a deidentified RUN record under [the evidence reporting contract](../EVIDENCE.md). Report planned/attempted/completed/abandoned/unavailable/refused/unknown counts, realized cohorts, sensor/label coverage, effort missingness, independent effects and every deviation. Keep private traces, consent and participant contact details outside Git. This pilot supplies descriptive feasibility findings; no trained accuracy, prevalence, economic saving or causal Delegate advantage is established by its existence.

The concrete next handoff is the completed private launch record, reviewed participant materials and rehearsal evidence to the named owner/reviewer. Issues #71 and #47 remain open after this documentation PR; participant collection, a reviewed B consent UI and broader evaluation are separate work.
