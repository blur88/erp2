"""Exercise the ruleset comparator's command-line boundary (#1898)."""
import copy
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / '.github/ruleset-15609777.snapshot.json'


class RulesetComparison(unittest.TestCase):
    def run_comparison(self, live):
        return subprocess.run(['python3', str(ROOT / 'scripts/check-ruleset.py'), str(BASELINE)], input=json.dumps(live), text=True, capture_output=True)

    def test_order_and_unobservable_metadata_do_not_trigger_drift(self):
        live = json.loads(BASELINE.read_text())
        live['rules'].reverse()
        live['bypass_actors'] = [{'bypass_mode': 'always'}]
        live['updated_at'] = 'different'
        self.assertEqual(self.run_comparison(live).returncode, 0)

    def test_configuration_changes_fail_with_diff(self):
        baseline = json.loads(BASELINE.read_text())
        for field, replacement in [('enforcement', 'disabled'), ('target', 'tag'), ('conditions', {}), ('rules', [])]:
            with self.subTest(field=field):
                live = copy.deepcopy(baseline)
                live[field] = replacement
                result = self.run_comparison(live)
                self.assertEqual(result.returncode, 1)
                self.assertIn('--- reviewed baseline', result.stdout)
                self.assertIn('+++ live ruleset', result.stdout)

    def test_required_check_changes_fail(self):
        live = json.loads(BASELINE.read_text())
        rule = next(rule for rule in live['rules'] if rule['type'] == 'required_status_checks')
        rule['parameters']['required_status_checks'][0]['context'] = 'Changed check'
        self.assertEqual(self.run_comparison(live).returncode, 1)

    def test_unreadable_fields_fail(self):
        self.assertNotEqual(self.run_comparison({'message': 'Resource not accessible'}).returncode, 0)


if __name__ == '__main__':
    unittest.main()
