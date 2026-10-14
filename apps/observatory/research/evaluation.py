"""Frozen holdout evaluation; never fit or tune a model here."""
import argparse
import json
import math
from pathlib import Path
import numpy as np
from sklearn.metrics import roc_auc_score
from models import FEATURES, digest, groups, score, target, validate_dataset


def ratio(n, d):
    return n / d if d else None


def wilson(n, d):
    if not d:
        return None
    z = 1.959963984540054
    p = n / d
    centre = (p + z * z / (2 * d)) / (1 + z * z / d)
    radius = z * math.sqrt(p * (1 - p) / d + z * z / (4 * d * d)) / (1 + z * z / d)
    return [max(0, centre - radius), min(1, centre + radius)]


def metrics(records):
    known = [r for r in records if r["truth"] is not None]
    classified = [r for r in known if r["prediction"] is not None]
    tp = sum(r["truth"] == 1 and r["prediction"] == 1 for r in classified)
    fp = sum(r["truth"] == 0 and r["prediction"] == 1 for r in classified)
    tn = sum(r["truth"] == 0 and r["prediction"] == 0 for r in classified)
    fn = sum(r["truth"] == 1 and r["prediction"] == 0 for r in classified)
    pos, neg = sum(r["truth"] == 1 for r in known), sum(r["truth"] == 0 for r in known)
    sensitivity, specificity = ratio(tp, tp + fn), ratio(tn, tn + fp)
    probabilities = [r for r in known if r["probability"] is not None]
    labels = [r["truth"] for r in probabilities]
    probs = [r["probability"] for r in probabilities]
    reliability = []
    for i in range(10):
        members = [r for r in probabilities if i / 10 <= r["probability"] and (r["probability"] < (i + 1) / 10 or i == 9)]
        reliability.append({"lower": i / 10, "upper": (i + 1) / 10, "n": len(members), "mean_probability": ratio(sum(r["probability"] for r in members), len(members)), "positive_fraction": ratio(sum(r["truth"] for r in members), len(members))})
    return {"n": len(records), "known_labels": len(known), "label_coverage": ratio(len(known), len(records)),
            "classified": sum(r["prediction"] is not None for r in records), "abstained": sum(r["prediction"] is None for r in records),
            "prediction_coverage": ratio(sum(r["prediction"] is not None for r in records), len(records)),
            "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "positive_abstentions": pos - tp - fn, "negative_abstentions": neg - tn - fp, "unknown_labels": len(records) - len(known)},
            "precision": ratio(tp, tp + fp), "selective_sensitivity": sensitivity, "selective_specificity": specificity,
            "selective_false_positive_rate": ratio(fp, fp + tn), "end_to_end_sensitivity": ratio(tp, pos), "false_positives_over_all_negatives": ratio(fp, neg),
            "balanced_accuracy": (sensitivity + specificity) / 2 if sensitivity is not None and specificity is not None else None,
            "auroc": float(roc_auc_score(labels, probs)) if len(set(labels)) == 2 else None,
            "brier": ratio(sum((p - y) ** 2 for p, y in zip(probs, labels)), len(probs)), "probability_n": len(probs), "reliability": reliability}


def uncertainty(records, seed=75, repeats=1000):
    by_group = {}
    for r in records:
        by_group.setdefault(r["group"], []).append(r)
    if len(by_group) < 10:
        return {"method": "descriptive_only", "groups": len(by_group), "intervals": None, "reason": "TOO_FEW_INDEPENDENT_GROUPS"}
    keys = list(by_group)
    rng = np.random.default_rng(seed)
    measures = ("precision", "end_to_end_sensitivity", "false_positives_over_all_negatives", "prediction_coverage")
    samples = {k: [] for k in measures}
    for _ in range(repeats):
        selected = rng.choice(keys, len(keys), replace=True)
        m = metrics([r for k in selected for r in by_group[k]])
        for k in measures:
            if m[k] is not None:
                samples[k].append(m[k])
    return {"method": "group_bootstrap", "groups": len(keys), "seed": seed, "repeats": repeats,
            "intervals": {k: {"bounds": np.quantile(v, [.025, .975]).tolist() if v else None, "valid_resamples": len(v)} for k, v in samples.items()},
            "limitations": ["Conditional on sampled groups; does not cover selection bias or label error", "Small groups/cells can give degenerate or wide intervals"]}


def prevalence_shift(sensitivity, specificity):
    if sensitivity is None or specificity is None:
        return []
    return [{"assumed_prevalence": p / 20, "flagged_fraction": sensitivity * p / 20 + (1 - specificity) * (1 - p / 20),
             "positive_predictive_value": ratio(sensitivity * p / 20, sensitivity * p / 20 + (1 - specificity) * (1 - p / 20)), "mode": "simulation_fixed_error_rates"} for p in range(21)]


def validated_prevalence(flagged, total, sensitivity, specificity, *, probability_sample=False, transport_validated=False, unresolved_fraction=0):
    if not isinstance(total, int) or isinstance(total, bool) or not isinstance(flagged, int) or isinstance(flagged, bool) or not 0 <= flagged <= total or not 0 <= unresolved_fraction <= 1:
        raise ValueError("Invalid sampling counts")
    raw = ratio(flagged, total)
    if not probability_sample or not transport_validated or unresolved_fraction:
        return {"raw_flagged_fraction": raw, "adjusted_estimate": None, "status": "UNAVAILABLE", "reason": "PROBABILITY_SAMPLE_AUDITED_TRANSFER_AND_COMPLETE_COVERAGE_REQUIRED"}
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v) or not 0 <= v <= 1 for v in (sensitivity, specificity)):
        raise ValueError("Valid error rates required")
    denominator = sensitivity + specificity - 1
    if raw is None or denominator <= 0:
        return {"raw_flagged_fraction": raw, "adjusted_estimate": None, "status": "UNAVAILABLE", "reason": "UNIDENTIFIABLE_ERROR_CORRECTION"}
    corrected = (raw + specificity - 1) / denominator
    if not 0 <= corrected <= 1:
        return {"raw_flagged_fraction": raw, "adjusted_estimate": None, "status": "UNAVAILABLE", "reason": "INCOMPATIBLE_TRANSFER_ASSUMPTIONS"}
    interval = wilson(flagged, total)
    return {"raw_flagged_fraction": raw, "adjusted_estimate": corrected, "status": "CONDITIONAL_POINT_ESTIMATE",
            "sampling_only_bounds": [max(0, (interval[0] + specificity - 1) / denominator), min(1, (interval[1] + specificity - 1) / denominator)],
            "limitations": ["Bounds omit sensitivity/specificity estimation uncertainty", "Transfer validation and probability sampling are externally audited assumptions"]}


def evaluate(data, bundle, seed=75):
    rows = validate_dataset(data)
    if digest(data) != bundle["artifact"]["corpus_digest"]:
        raise ValueError("Frozen corpus digest mismatch")
    all_groups = dict(zip([r["id"] for r in rows], groups(rows).tolist()))
    ids = {r["id"] for r in rows}
    split = bundle["split"]
    if set(split) != {"training", "calibration", "holdout"} or any(not isinstance(v, list) for v in split.values()):
        raise ValueError("Invalid split")
    assigned = sum(split.values(), [])
    if len(set(assigned)) != len(assigned) or not set(assigned) <= ids:
        raise ValueError("Invalid/overlapping split membership")
    group_sets = {k: {all_groups[i] for i in v} for k, v in split.items()}
    if any(a & b for k, a in group_sets.items() for l, b in group_sets.items() if k != l):
        raise ValueError("Group leakage")
    holdout = [r for r in rows if all_groups[r["id"]] in group_sets["holdout"]]
    comparisons = []
    for model in ("signature-rule", "logistic"):
        records = []
        for row in holdout:
            if model == "logistic":
                d = score(bundle["artifact"], row["signals"])
                probability = d["score"]
                prediction = int(d["class"] == "AI_DIRECTED") if d["status"] == "classified" else None
            else:
                s = row["signals"]["signature_verified"]
                prediction = 1 if s["missingness"] == "observed" and s["value"] is True and s["provenance"] == "source_record" else None
                probability = None  # a rule output is not a probability
            records.append({"truth": target(row["execution_class"]), "prediction": prediction, "probability": probability, "group": all_groups[row["id"]], "cohort": row["execution_class"]})
        m = metrics(records)
        comparisons.append({"model": model, "metrics": m, "uncertainty": uncertainty(records, seed),
                            "cohorts": {c: metrics([r for r in records if r["cohort"] == c]) for c in sorted({r["cohort"] for r in records})},
                            "prevalence_shift": prevalence_shift(m["selective_sensitivity"], m["selective_specificity"]),
                            "population_prevalence": validated_prevalence(m["confusion"]["tp"] + m["confusion"]["fp"], m["classified"], m["selective_sensitivity"], m["selective_specificity"])})
    return {"schema": "observatory-evaluation/1", "mode": data["mode"], "target": bundle["artifact"]["target"], "protocol_version": data["protocol_version"], "source_commit": data["source_commit"],
            "corpus_digest": digest(data), "model_digest": digest(bundle["artifact"]), "total_corpus_rows": len(rows), "holdout_n": len(holdout), "holdout_groups": len(group_sets["holdout"]),
            "excluded_target_rows": len(bundle["excluded_ids"]), "comparisons": comparisons,
            "limitations": bundle["artifact"]["limitations"] + ["The signature rule observes identity and is an unvalidated proxy for this execution target", "No human/agent accuracy claim from generated fixtures", "Balanced corpus prevalence remains unknown", "Conventional automation, AI-written text, legal demand and harmful effects are separate targets"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", type=Path)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    report = evaluate(json.loads(args.corpus.read_text()), json.loads(args.bundle.read_text()))
    args.report.write_text(json.dumps(report, sort_keys=True, indent=2, allow_nan=False) + "\n")
