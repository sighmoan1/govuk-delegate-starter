# Offline statistical models

The verified-signature rule remains an identity-observation baseline. The optional logistic model predicts the experimental target `ai-directed-execution/1`: AI-agent browser/API execution versus human-operated/manual-or-assisted execution. Conventional scripts and unknown execution are excluded from this binary target, with their IDs retained in the split report. Neither output proves authority, eligibility or abuse.

The offline Python trainer uses scikit-learn; no Python server or model vendor is required. Install `apps/observatory/research/requirements.txt` in an isolated environment, then run:

```sh
python3 apps/observatory/research/models.py corpus.json model-bundle.json --seed 73
python3 -m unittest discover -s apps/observatory/research -p 'test_*.py'
```

Input is a strict `observatory-corpus/1` JSON envelope with `mode`, `protocol_version`, `source_commit` and `rows`. Each row has a unique `id`, `execution_class`, grouping identifiers (`intent`, `session`, `actor_family`, `scenario_family`), and the four normalized #72 `signals`. Grouping and truth remain evaluator-only metadata. The inference vector receives only allowlisted signal values and explicit missingness. It receives no IDs, cohort tags, outcomes, provenance strings or prompts.

All shared grouping identifiers form transitive components before exclusions; related unknown records can therefore still prevent split leakage. Five stratified group folds provide approximately 60% training, 20% calibration, 20% held-out. At least ten independent groups and both classes in each partition are required. Imputation uses fixed zero plus missingness indicators; numeric latency is log-transformed. Mean/scales and logistic coefficients are fitted on training only. Threshold selection uses calibration only, targeting a descriptive 1% false-positive rate. This small-sample target is explicitly unsubstantiated, and raw logistic probabilities are not claimed to be calibrated. Holdout evaluation belongs in a separate frozen report.

The bundle contains a versioned JSON coefficient artifact, exact split membership, exclusions, dataset SHA-256, software version, coefficients and limitations. It uses no executable pickle. Keep the bundle in the study's protected evidence store; it may contain pseudonymous grouping IDs. Export only its `artifact` object to a server-local JSON file and set `OBSERVATORY_MODEL_FILE` to that absolute file path. `POST /api/research/classifications` accepts `classifier: "logistic"`; its default threshold comes from that artifact. Existing immutable snapshots/configuration/result storage is reused. Every coefficient/configuration change changes the adapter version; old frozen configurations refuse a mismatched rerun. Missing or invalid model configuration returns 503 without exposing paths or data.

No model is installed by default. A synthetic fixture tests train/save/reload/scoring, transitive group isolation, holdout-feature changes, missingness and feature injection. It is not a 500-transaction participant study or a real detector benchmark. Signature verification, browser presence, device recognition and latency are weak proxies for AI direction and can fail completely outside a controlled sample. Public service authorisation never consumes this prediction.
