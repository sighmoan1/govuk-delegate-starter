# Frozen evaluation and prevalence

Run the offline evaluator against the original corpus and model bundle:

```sh
python3 apps/observatory/research/evaluation.py corpus.json model-bundle.json report.json
```

The corpus digest and split membership are checked before scoring. Only holdout groups enter evaluation, including excluded/unknown cohort members linked to those groups. No parameters, transform, threshold or calibration are fitted by this command. Store reports as immutable versioned evidence and preregister evaluation before opening a real study holdout; a rerun is not fresh independent evidence.

Reports compare the signature-observation rule and logistic model on the same holdout. They include the confusion matrix with unknown labels and positive/negative abstentions, label/prediction coverage, selective sensitivity/specificity/FPR, end-to-end sensitivity over all labelled positives, precision, balanced accuracy, AUROC, Brier score and ten reliability bins. Rule scores are not probabilities. Denominators remain explicit; absent denominators return null rather than zero. Cohort tables keep manual, assisted, browser/API agents and conventional automation distinct.

Fixed-seed group bootstrap reports 95% percentile intervals for precision, end-to-end sensitivity, false positives over all negatives and prediction coverage. Fewer than ten groups produces descriptive-only results. Valid bootstrap resample counts are retained, including missing-denominator resamples. Small groups/cells, selection bias and label error remain limitations. Wilson intervals are available for truly independent binomial sampling; they are not used to pretend clustered attempts are independent.

The prevalence-shift series reweights fixed held-out conditional error rates over assumed prevalence from 0 to 100%; it is visibly labelled simulation. It is conditional on classified attempts and ignores transportability/coverage changes. Neither this series nor a balanced corpus estimates UK government traffic.

The standalone `validated_prevalence` calculation requires externally audited probability sampling, validated sensitivity/specificity transfer and complete coverage. It reports an error-corrected conditional point estimate and sampling-only bounds, explicitly excluding uncertainty in the validation rates. Non-identifiable/incompatible error rates yield unavailable results. Full validation-rate uncertainty and unresolved-label bounds remain a study design requirement; the default evaluation report leaves population prevalence unavailable.

Automation, AI-directed execution, AI-written text, legitimate citizen demand, service acceptance, harm, request load and business effects remain different estimands. These model reports never derive claims received, unique operations, replays, refusals or processing cost from predictions.
