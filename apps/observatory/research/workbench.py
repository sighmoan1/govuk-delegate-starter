"""Fixed-snapshot comparison and ablation runner, aggregate outputs only."""
import argparse
import json
from pathlib import Path
from models import FEATURES, digest, train
from evaluation import evaluate


def run(data, seed=73):
    full = train(data, seed)
    report = evaluate(data, full)
    report["configurations"] = [{"name": "logistic", "features": list(FEATURES), "model_digest": digest(full["artifact"]), "threshold": full["artifact"]["threshold"]}]
    for removed in FEATURES:
        selected = tuple(f for f in FEATURES if f != removed)
        bundle = train(data, seed, selected)
        if bundle["split"] != full["split"]:
            raise ValueError("Ablation split changed")
        ablation = evaluate(data, bundle)["comparisons"][1]
        ablation["model"] = "logistic-without-" + removed
        report["comparisons"].append(ablation)
        report["configurations"].append({"name": ablation["model"], "features": list(selected), "model_digest": digest(bundle["artifact"]), "threshold": bundle["artifact"]["threshold"]})
    report["split_digest"] = digest(full["split"])
    report["seed"] = seed
    report["optional_models"] = [{"name": name, "status": "not_configured"} for name in ("jev", "openai-decisions")]
    report["limitations"].append("Ablations share a held-out sample: repeated comparisons are not independent confirmation")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    args.report.write_text(json.dumps(run(json.loads(args.corpus.read_text())), indent=2, sort_keys=True, allow_nan=False) + "\n")
