# Observatory research protocol — v0.1

Status: proposed protocol for synthetic or expressly consented research. No study has been run under this protocol. This document fixes the measurement contract for #65; it does not approve national deployment, operational classification or data collection from real service users.

## Questions and boundaries

1. What declared representative activity can HMRC and Delegate observe directly?
2. How accurately can browser/HTTP signals identify automation in a controlled, labelled setting, including assistive and mixed workflows?
3. What does each additional sensor contribute beyond a simple baseline, at a stated false-positive cost?
4. What does remaining uncertainty mean for measurement coverage and population estimates?

Whether a transaction is lawful, eligible, harmful or fraudulent is a separate question. An automation prediction never answers it. AI-authored text, browser automation, AI-directed operation, identity assurance, authority and service outcomes are separate variables.

Observatory is a read-only research system. Its feeds, predictions and dashboard must not change consent, authority, queue order, throughput or abuse-control decisions in HMRC or Delegate. Unknown activity may include legitimate people, accessibility tools or agents that have not integrated: [Decision 7](../DECISIONS.md#decision-7--unknown-is-not-the-same-as-malicious). Text detection is outside the core authority mechanism: [Decision 8](../DECISIONS.md#decision-8--do-not-make-ai-text-detection-part-of-the-core).

## Units and identifiers

| Unit | Definition | Measurement use |
|---|---|---|
| Citizen intent | One independently labelled desired service outcome, assigned before activity | Legitimate demand and correct handling; multiple distinct intents remain distinct |
| Transaction attempt | One workflow attempting that intent, with a stable research ID | Primary classification/evaluation unit, including aborted attempts |
| Request | One HTTP request, retry or poll, linked to its attempt where known | Technical load and event evidence; never a substitute for citizen demand |
| Session | One interaction period, potentially covering several attempts | Behaviour features and secondary evaluation, reported separately |
| Actor/scenario family | Related operator, agent implementation or scenario template | Split, clustering and uncertainty unit; related retries are not independent samples |

Link retries, sub-agents and hidden sessions to ground-truth intent IDs in the controlled corpus. In observational feeds, preserve uncertainty when a link is unavailable; do not invent intent counts from fingerprints. Store pseudonymous research IDs rather than a cross-government person identifier. Request IDs and service transaction IDs are separate from device visitor IDs.

## Label contract

Every field includes provenance, timestamp, protocol/scenario version and `known`, `unknown` or `not_applicable` status. Do not coerce missing labels to negative classes.

| Dimension | Values | Ground truth or evidence |
|---|---|---|
| Browser execution | manual, automated, mixed, unknown, not applicable | Operator/scenario record and actual execution trace |
| Task direction | human-directed, AI-directed, mixed, unknown | Known runner/model configuration or consented operator record |
| Text assistance | none, AI-assisted, AI-generated, unknown, not applicable | Source preparation record; cannot be inferred reliably from submitted text |
| Route | citizen browser, declared representative browser, declared representative API, unidentified, unknown | Service-side route/event evidence |
| Identity | assurance evidence/version, or unknown | Authentication evidence; says nothing about honesty or automation |
| Authority | allowed, denied, absent, unknown; scoped capability and time | Independent service/Delegate authority records, not classifier output |
| Intent validity | permitted, not permitted, unknown | Predeclared synthetic business rules and fixture owner |
| Outcome | durably received, recorded, refused, abandoned, failed, pending, unknown | Independently inspected service business state and workflow evidence |
| Harm | explicitly defined synthetic adverse effect, none observed, unknown | Independent effect verification; automation is never the harm label |

Declared credentials establish who is claiming to act and with what authority; they do not establish that an AI model controlled the browser. Device recognition similarly does not prove person identity, automation or misconduct. Keep target labels and convenient proxy signals separate.

## Cohorts and ground-truth provenance

Include genuine manual runs by consented human operators, conventional scripted automation, AI-operated browsers, declared agent API clients, undeclared automation, assistive technology and deliberately mixed human/agent handoffs. Cover successful, abandoned, denied, expired and revoked workflows. API-only traffic has no browser sensor and must not be scored as missing-human evidence.

For every attempt retain a minimal manifest: cohort assignment, intent/scenario ID, operator pseudonym, client/model/tool version, browser/device family, seed, start/end, route, expected permission/outcome, consent record reference and independent actual effect. Distinguish intended cohort from verified execution. If the runner fails or a person takes over, retain the run with corrected mixed/unknown labels and a reason.

Human runs require a person actually completing the workflow; a Playwright script labelled "human" is not ground truth. Assisted runs are labelled assisted rather than silently excluded. Synthetic submissions contain no real identity, financial information, prompts or claim content. The controlled corpus target in #71 is a workload plan, not a statistically justified population sample; publish realised cohort counts and coverage.

Ground truth is collected outside the classifier feature pipeline. Sensor assertions never become their own truth label. Have a second reviewer audit a declared subset of manifests/effects and record disagreements; unresolved cases remain unknown. Any later use of vendor reference datasets requires separately verified consent, provenance and compatible targets.

## Split and leakage safeguards

Before inspecting held-out results, freeze the manifest schema, target, feature list, baseline, thresholds, exclusions, split algorithm and evaluation code in Git. Allocate approximately 60% training, 20% calibration and 20% held-out by actor/scenario-family groups; stratify cohort coverage where feasible. If the corpus cannot support all three meaningful sets, use grouped development validation and report the held-out evidence as unavailable. Keep a final family-disjoint evaluation as the generalisation check.

No intent, repeated attempt, operator session or related agent/scenario family may appear across sets. Preserve a device/browser-disjoint stress slice where feasible and report its limited coverage. Fit imputation, normalisation and learned feature selection on training only. Use calibration only for threshold/calibration choice, never for final performance claims. A blinded held-out run is opened once; subsequent changes require a new version and a fresh held-out set.

Check features for route/label leakage: research cohort tags, runner headers, fixture names, synthetic email strings, consent manifests, authority ALLOW/DENY, outcome status and post-submission evidence cannot enter a browser-automation classifier. Route is legitimate for measuring declared activity directly, but trivially knowing a declared route is not evidence of detecting unknown automation. Report a separate declared-route baseline and an unknown-route classifier evaluation. Audit joins for accidental future information and cross-set visitor identifiers. Save explicit sensor ablations with identical splits and workloads.

## Preregistered measurements

| Measure | Required denominator and reporting |
|---|---|
| False-positive rate | Known manual target-negative attempts; separately report assistive and mixed cohorts |
| False-negative rate / sensitivity | Known target-positive attempts under the frozen target definition |
| Precision / predictive value | Predicted positives with known labels; tied to the sampled class balance |
| Specificity | Known target-negative attempts; report counts alongside rates |
| Coverage / abstention | All eligible attempts, including unknown labels, missing sensors, failures and abstained predictions; separate label coverage from prediction coverage |
| Calibration | Brier score and reliability bins for genuine probability predictions, using known held-out labels; not arbitrary vendor score interpretation |
| Operational proxy | Sensor latency, collection failures, bytes/events and vendor calls; record prices separately if measured, never imply savings |
| Prevalence | Direct declared-route share among observed eligible attempts; true AI/automation prevalence remains a separate estimand |

Freeze target-specific thresholds on calibration data. As a development comparison, report sensitivity at a calibration false-positive target of 1%, plus the full held-out confusion matrix including abstention. A small calibration set cannot substantiate that false-positive target; publish sample size and uncertainty rather than claiming it was met. Do not automatically ship a threshold into operational enforcement.

Publish numerators, denominators, class balance, sensor availability and cohort breakdown for every result. Mixed cases are their own cohort unless a binary target definition was fixed beforehand. Show request-level results only as secondary, with their request denominator; never pool them into transaction accuracy.

For independent binomial outcomes use 95% Wilson intervals; where attempts share an operator/agent/scenario, use a preregistered grouped bootstrap with a fixed seed and report group counts. When groups or cells are too few, report descriptive counts/ranges and no precise population inference. For paired sensor ablations bootstrap the paired group-level differences. Explicitly state that intervals do not capture selection bias or unknown-label error. Keep failed, negative and null runs in the report.

## Prevalence and causal claims

A balanced 50/50 human/agent corpus is a controlled comparison, **not a cross-government prevalence estimate**. Precision on that corpus is not real-world positive predictive value. Instrumented mock HMRC can answer whether this sensor distinguished these known runs and whether these exact synthetic transactions had these effects.

For later prevalence research define the service, period, eligible transaction population, sampling frame, inclusion probabilities, sensor/label missingness and target. Use a probability sample with an independently audited validation subset spanning predicted-positive and predicted-negative cases. Any sensitivity/specificity correction must carry their uncertainty and transportability assumptions; present sensitivity analyses and bounds for unresolved labels/coverage. Device counts cannot substitute for transactions or people. Without those prerequisites report only the observed declared share and controlled test performance, leaving prevalence unknown.

Whether authorised routes reduce harm or service effort requires a comparable control, independent outcomes and a causal design. Follow [#47](https://github.com/sighmoan1/govuk-delegate-starter/issues/47) and [VALIDATION.md](../VALIDATION.md) for B versus C. Observatory predictions alone do not establish fraud, illegitimacy, lawful demand, savings or national-scale benefit. [#22](https://github.com/sighmoan1/govuk-delegate-starter/issues/22) distinguishes requests from real synthetic demand; [#52](https://github.com/sighmoan1/govuk-delegate-starter/issues/52) governs evidence claims and [#53](https://github.com/sighmoan1/govuk-delegate-starter/issues/53) keeps unidentified-route policy unresolved.

## Governance and data minimisation

Restrict collection to isolated synthetic fixtures or explicitly consented research sessions. Record withdrawal handling before collecting human data. Pseudonymise research joins; collect only the signal fields required by the frozen feature list. Do not log passwords, tokens, raw IPs, complete submitted records, text/prompt contents, device fingerprint components or model reasoning. Do not expose secrets in git or reports. Treat vendor visitor identifiers as potentially identifying; prefer a project-specific pseudonymous join and prohibit correlation across unrelated services.

For the prototype use a proposed maximum 30-day raw-event retention, then delete it; consented study plans must explicitly approve the retention and access policy before starting. Retain only deidentified aggregate results, protocol versions and synthetic reproducibility artefacts longer term. A study owner controls access and records collection/schema versions, vendor regions, export behaviour and deletions. No production GDPR/legal compliance claim follows from this proposal. External model/vendor adapters receive only expressly approved minimal research features, never authority credentials or citizen content.

## Reproducible evidence and gates

Each run freezes Git SHA, manifest digest, feature/sensor versions, targets, splits, thresholds, random seeds, software/model/tool versions, exact commands, exclusions, consent provenance and environment. Keep redacted event traces, ground-truth/effect audit, split membership and computed confusion/coverage tables together. Reports follow [EVIDENCE.md](../EVIDENCE.md): proposed protocol, exploratory observation, bounded technical test, controlled comparison and field evidence remain distinct.

O06 (#70), O07 (#71) and O11 (#75) must reference the frozen protocol version and document deviations before execution. Human collection needs a named study owner and consent process; this code review is not that approval. Classifier or fusion development can use synthetic fixtures, but has no measured performance until a reproducible run is published. A later amendment records its rationale and invalidates affected comparisons; it never silently rewrites past results.
