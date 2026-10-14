import copy
import json
import unittest
from models import FEATURES, groups, score, train, vector


def fixture():
    rows = []
    for i in range(100):
        for j in range(2):
            label = "AI_AGENT_BROWSER" if i % 2 else "HUMAN_OPERATED"
            values = (bool(i % 3), (i * 37 + j * 17) % 900, True, bool(i % 5))
            rows.append({"id": f"fixture-{i}-{j}", "groups": {k: f"{k}-{i}" for k in ("intent", "session", "actor_family", "scenario_family")}, "execution_class": label,
                         "signals": {f: {"value": v, "missingness": "observed", "provenance": "synthetic_fixture", "confidence": None} for f, v in zip(FEATURES, values)}})
    return {"schema": "observatory-corpus/1", "mode": "synthetic_fixture", "protocol_version": "fixture/1", "source_commit": "0" * 40, "rows": rows}


class Models(unittest.TestCase):
    def test_repeatable_and_serializable(self):
        data = fixture()
        a, b = train(data), train(data)
        self.assertEqual(a, b)
        restored = json.loads(json.dumps(a))["artifact"]
        self.assertEqual(score(restored, data["rows"][0]["signals"]), score(a["artifact"], data["rows"][0]["signals"]))
        self.assertEqual(len(set(sum(a["split"].values(), []))), 200)

    def test_transitive_links_prevent_leakage(self):
        data = fixture()
        data["rows"][2]["groups"]["session"] = data["rows"][0]["groups"]["session"]
        result = train(data)
        assignment = {i: name for name, ids in result["split"].items() for i in ids}
        self.assertEqual(assignment["fixture-0-0"], assignment["fixture-1-0"])
        self.assertEqual(groups(data["rows"])[0], groups(data["rows"])[3])

    def test_holdout_not_used_for_fit_or_threshold(self):
        data = fixture()
        a = train(data)
        # Fit/threshold should stay unchanged when only a held-out numeric value changes.
        held = set(a["split"]["holdout"])
        for row in data["rows"]:
            if row["id"] in held:
                row["signals"]["latency_ms"]["value"] = 8000000
        b = train(data)
        for key in ("coefficients", "mean", "scale", "intercept", "threshold"):
            self.assertEqual(a["artifact"][key], b["artifact"][key])

    def test_labels_never_features(self):
        signals = fixture()["rows"][0]["signals"]
        signals["execution_class"] = "AI_AGENT_BROWSER"
        with self.assertRaises(ValueError):
            vector(signals)

    def test_missing_abstains_and_small_corpus_fails(self):
        data = fixture()
        model = train(data)["artifact"]
        signals = copy.deepcopy(data["rows"][0]["signals"])
        for s in signals.values():
            s.update(value=None, missingness="not_observed")
        self.assertEqual(score(model, signals)["status"], "abstain")
        data["rows"] = data["rows"][:10]
        with self.assertRaises(ValueError):
            train(data)


if __name__ == "__main__":
    unittest.main()
