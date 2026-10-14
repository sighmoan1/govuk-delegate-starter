"""Offline, blinded inference and grouped model development. No service calls."""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold

FEATURES = ("signature_verified", "latency_ms", "browser_present", "vendor_verified")
MISSING = ("observed", "not_observed", "not_configured", "error")
CLASSES = ("HUMAN_OPERATED", "HUMAN_AI_ASSISTED", "SCRIPTED_AUTOMATION", "AI_AGENT_BROWSER", "AI_AGENT_API")
TARGET = "ai-directed-execution/1"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def vector(signals, selected=FEATURES):
    if not isinstance(signals, dict) or set(signals) != set(FEATURES):
        raise ValueError("Only the four allowlisted signals are accepted")
    values = []
    for name in FEATURES:
        s = signals[name]
        if set(s) != {"value", "missingness", "provenance", "confidence"} or s["missingness"] not in MISSING:
            raise ValueError("Invalid signal")
        value = s["value"]
        if s["missingness"] != "observed":
            if value is not None:
                raise ValueError("Missing signals must have null values")
        elif name == "latency_ms":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 86400000:
                raise ValueError("Invalid latency")
        elif not isinstance(value, bool):
            raise ValueError("Invalid boolean")
        if not isinstance(s["provenance"], str) or len(s["provenance"]) > 128:
            raise ValueError("Invalid provenance")
        confidence = s["confidence"]
        if confidence is not None and (isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
            raise ValueError("Invalid confidence")
        if name in selected:
            # Provenance strings and confidence are never inference features.
            values.append(math.log1p(value) if name == "latency_ms" and value is not None else float(value or 0))
            values.extend(float(s["missingness"] == status) for status in MISSING[1:])
    return values


def target(execution_class):
    # Conventional scripts are not evidence of AI direction: excluded, not negative.
    if execution_class in ("HUMAN_OPERATED", "HUMAN_AI_ASSISTED"):
        return 0
    if execution_class in ("AI_AGENT_BROWSER", "AI_AGENT_API"):
        return 1
    return None


def groups(rows):
    """Transitive connected components across all possible leakage identifiers."""
    parents = list(range(len(rows)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    seen = {}
    for i, row in enumerate(rows):
        for kind, value in row["groups"].items():
            key = (kind, value)
            if key in seen:
                parents[root(i)] = root(seen[key])
            else:
                seen[key] = i
    return np.array([root(i) for i in range(len(rows))])


def validate_dataset(data):
    if set(data) != {"schema", "mode", "protocol_version", "source_commit", "rows"} or data["schema"] != "observatory-corpus/1" or data["mode"] not in ("synthetic_fixture", "consented_study"):
        raise ValueError("Invalid corpus envelope")
    if not isinstance(data["protocol_version"], str) or not data["protocol_version"] or len(data["protocol_version"]) > 80 or not isinstance(data["source_commit"], str) or not re.fullmatch(r"[a-f0-9]{40}", data["source_commit"]):
        raise ValueError("Protocol and source revision required")
    rows = data["rows"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= 10000:
        raise ValueError("Invalid corpus size")
    ids = set()
    for row in rows:
        if set(row) != {"id", "groups", "execution_class", "signals"} or not isinstance(row["id"], str) or row["id"] in ids:
            raise ValueError("Invalid/duplicate row")
        ids.add(row["id"])
        if row["execution_class"] not in (*CLASSES, "UNKNOWN"):
            raise ValueError("Invalid execution class")
        if set(row["groups"]) != {"intent", "session", "actor_family", "scenario_family"} or any(not isinstance(v, str) or not v or len(v) > 128 for v in row["groups"].values()):
            raise ValueError("All grouping identifiers are required")
        vector(row["signals"])
    return rows


def score(artifact, signals):
    x = vector(signals, artifact["feature_set"])
    if not any(signals[f]["missingness"] == "observed" for f in artifact["feature_set"]):
        return {"status": "abstain", "class": None, "score": None, "reason": "NO_OBSERVED_FEATURES"}
    if len(x) != len(artifact["coefficients"]):
        raise ValueError("Model feature mismatch")
    z = artifact["intercept"] + sum(c * (v - m) / s for c, v, m, s in zip(artifact["coefficients"], x, artifact["mean"], artifact["scale"]))
    p = 1 / (1 + math.exp(-max(-700, min(700, z))))
    return {"status": "classified", "class": "AI_DIRECTED" if p >= artifact["threshold"] else "HUMAN_OPERATED", "score": p, "reason": "EXPERIMENTAL_STATISTICAL_PREDICTION"}


def train(data, seed=73, selected=FEATURES):
    if not selected or tuple(selected) != tuple(f for f in FEATURES if f in selected):
        raise ValueError("Unique features in canonical order required")
    all_rows = validate_dataset(data)
    rows = [r for r in all_rows if target(r["execution_class"]) is not None]
    # Compute groups BEFORE removing unknown/scripted rows: they can bridge families.
    all_groups = dict(zip([r["id"] for r in all_rows], groups(all_rows).tolist()))
    g = np.array([all_groups[r["id"]] for r in rows])
    y = np.array([target(r["execution_class"]) for r in rows])
    if len(set(g)) < 10 or len(set(y)) < 2:
        raise ValueError("At least ten independent groups and both target classes required")
    x = np.array([vector(r["signals"], selected) for r in rows])
    folds = list(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed).split(x, y, g))
    calibration, holdout = folds[3][1], folds[4][1]
    training = np.array(sorted(set(range(len(rows))) - set(calibration) - set(holdout)))
    for indices in (training, calibration, holdout):
        if len(set(y[indices])) < 2:
            raise ValueError("Each partition must contain both classes; collect more independent groups")
    parts = {"training": training, "calibration": calibration, "holdout": holdout}
    if any(set(g[a]) & set(g[b]) for name, a in parts.items() for other, b in parts.items() if name != other):
        raise ValueError("Group leakage")
    mean, scale = x[training].mean(axis=0), x[training].std(axis=0)
    scale[scale == 0] = 1
    model = LogisticRegression(random_state=seed, max_iter=2000).fit((x[training] - mean) / scale, y[training])
    probabilities = model.predict_proba((x[calibration] - mean) / scale)[:, 1]
    negatives = probabilities[y[calibration] == 0]
    # Only calibration chooses threshold. Never inspect holdout to improve it.
    candidates = sorted(set([0.5, 1.0, *probabilities.tolist(), *[float(np.nextafter(p, 1.0)) for p in negatives]]))
    feasible = [t for t in candidates if np.mean(negatives >= t) <= .01]
    threshold = min(feasible) if feasible else 1.0
    names = [n for f in selected for n in (f, *(f + "/" + s for s in MISSING[1:]))]
    artifact = {"schema": "observatory-logistic/1", "target": TARGET, "feature_set": list(selected), "feature_names": names,
                "coefficients": model.coef_[0].tolist(), "intercept": float(model.intercept_[0]), "mean": mean.tolist(), "scale": scale.tolist(),
                "threshold": threshold, "seed": seed, "sklearn_version": sklearn.__version__, "corpus_digest": digest(data), "mode": data["mode"],
                "calibration": {"method": "raw_logistic_no_probability_calibration", "false_positive_target": .01, "negative_n": len(negatives), "observed_false_positives": int(sum(negatives >= threshold)), "target_substantiated": False},
                "limitations": ["Synthetic fixture results do not validate detection", "Signature and browser presence do not prove AI direction", "Unknown and conventional scripted execution excluded from binary target", "Balanced corpus cannot estimate population prevalence", "Calibration false-positive target is descriptive, not a guarantee"]}
    return {"artifact": artifact, "split": {name: [rows[i]["id"] for i in indices] for name, indices in parts.items()},
            "excluded_ids": [r["id"] for r in all_rows if target(r["execution_class"]) is None]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seed", type=int, default=73)
    args = parser.parse_args()
    result = train(json.loads(args.corpus.read_text()), args.seed)
    args.output.write_text(json.dumps(result, sort_keys=True, indent=2, allow_nan=False) + "\n")
