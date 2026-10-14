import unittest
from evaluation import metrics, uncertainty, validated_prevalence, prevalence_shift, evaluate
from models import train
from test_models import fixture


class Evaluation(unittest.TestCase):
    def test_denominators_abstention_and_unknown(self):
        records = [{"truth": y, "prediction": p, "probability": q, "group": i, "cohort": "fixture"} for i, (y, p, q) in enumerate([(1, 1, .8), (1, 0, .2), (0, 1, .7), (0, 0, .1), (1, None, None), (0, None, None), (None, 1, .9)])]
        m = metrics(records)
        self.assertEqual(m["confusion"], {"tp": 1, "fp": 1, "tn": 1, "fn": 1, "positive_abstentions": 1, "negative_abstentions": 1, "unknown_labels": 1})
        self.assertAlmostEqual(m["end_to_end_sensitivity"], 1 / 3)
        self.assertEqual(m["selective_sensitivity"], .5)
        self.assertEqual(m["precision"], .5)
        self.assertEqual(m["classified"], 5)
        self.assertEqual(m["probability_n"], 4)
        self.assertEqual(sum(b["n"] for b in m["reliability"]), 4)
        self.assertAlmostEqual(m["brier"], (.04 + .64 + .49 + .01) / 4)
        self.assertIsNone(uncertainty(records)["intervals"])

    def test_bootstrap_reproducible_and_empty_safe(self):
        records = [{"truth": i % 2, "prediction": i % 2, "probability": .9 if i % 2 else .1, "group": i, "cohort": "fixture"} for i in range(20)]
        self.assertEqual(uncertainty(records, repeats=50), uncertainty(records, repeats=50))
        self.assertIsNone(metrics([])["precision"])

    def test_prevalence_requires_actual_sampling_and_transfer(self):
        self.assertIsNone(validated_prevalence(50, 100, .9, .9)["adjusted_estimate"])
        result = validated_prevalence(26, 100, .9, .9, probability_sample=True, transport_validated=True)
        self.assertAlmostEqual(result["adjusted_estimate"], .2)
        self.assertIsNone(validated_prevalence(50, 100, .5, .5, probability_sample=True, transport_validated=True)["adjusted_estimate"])
        self.assertEqual(prevalence_shift(.9, .9)[0]["mode"], "simulation_fixed_error_rates")

    def test_holdout_report_and_frozen_digest(self):
        data = fixture()
        bundle = train(data)
        result = evaluate(data, bundle)
        self.assertEqual(result["holdout_n"], len(bundle["split"]["holdout"]))
        self.assertEqual(result["mode"], "synthetic_fixture")
        self.assertEqual(len(result["comparisons"]), 2)
        data["rows"][0]["signals"]["latency_ms"]["value"] += 1
        with self.assertRaises(ValueError):
            evaluate(data, bundle)


if __name__ == "__main__":
    unittest.main()
