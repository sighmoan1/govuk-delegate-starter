# Comparison workbench

Open `/workbench`. The evaluator key permits a one-click rules/logistic comparison and four leave-one-signal-out ablations. The generated demonstration has 100 arbitrary rows and no real human or AI-agent execution; its label names are simulated. All experiments are synthetic-only on this hosted endpoint. Genuine participant datasets require the separate consent/withdrawal and provenance process before any hosted ingestion is enabled.

An optional `observatory-corpus/1` JSON file replaces the demonstration. The server validates the strict schema, limits it to 1000 rows / 256 KB, groups linked families, and runs the fixed offline Python program without a shell. Label metadata stays outside the inference vector. A database advisory transaction lock permits one active comparison across app replicas. A timeout/failure creates no successful report; sensitive subprocess output is never returned. Temporary corpus/result files are removed in a finally block. No live provider/service requests are made.

Successful runs append an immutable `ExperimentAnalysis` row with dataset snapshot, corpus/configuration digests and aggregate report. Only evaluator routes can read/write it; collector monitoring cannot read the table. Dataset/configuration/model changes create new records. PostgreSQL rejects UPDATE/DELETE. These immutable records are synthetic-only; do not store real participant data before an administrative study-erasure procedure is approved. External research records/databases are not migrated by this change.

The report compares models on exactly the same grouped split. For each ablation, feature transforms and model fitting use training only; thresholds use calibration only. Holdout results never select a threshold or optimal feature set. Shared-sample experiments are exploratory multiple comparisons, not independent confirmations. The evaluator reports explicit coverage, errors, cohorts, reliability, uncertainty and simulated prevalence shift. Jev/OpenAI remain visibly unavailable until separately configured and actually executed.

Existing aggregate reports may also be opened locally in the browser; this does not upload, authenticate or independently verify them. Clear research discards the page key, report and corpus, including outstanding responses. Export downloads the aggregate report, not protected dataset rows. Offline batch use:

```sh
python3 apps/observatory/research/workbench.py corpus.json comparison.json
```

The Docker image must include Python and the pinned research requirements for server-side computation. Local development can set `OBSERVATORY_PYTHON` to a dedicated virtual-environment interpreter. No Python microservice runs. The public event dashboard remains a distinct view and no source-service decision consumes any model score.
