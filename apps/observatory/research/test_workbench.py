import unittest
from workbench import run
from test_models import fixture


class Workbench(unittest.TestCase):
    def test_same_split_and_unavailable_vendors(self):
        a = run(fixture())
        self.assertEqual(len(a["comparisons"]), 6)
        self.assertEqual(len(a["configurations"]), 5)
        self.assertEqual(len({c["metrics"]["n"] for c in a["comparisons"]}), 1)
        self.assertEqual(a["optional_models"][0]["status"], "not_configured")
        self.assertEqual(len({c["model_digest"] for c in a["configurations"]}), 5)
        self.assertTrue(all(c["population_prevalence"]["adjusted_estimate"] is None for c in a["comparisons"]))


if __name__ == "__main__":
    unittest.main()
