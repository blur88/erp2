#!/usr/bin/env python3
"""Compare observable ruleset configuration with its reviewed baseline (#1898)."""
import difflib
import json
import sys


def normalize(value):
    """Ignore object and array ordering while retaining all rule parameters."""
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return sorted((normalize(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
    return value


def snapshot(value):
    result = {key: value[key] for key in ('target', 'enforcement', 'conditions', 'rules')}
    if not isinstance(result['rules'], list) or not isinstance(result['conditions'], dict):
        raise ValueError('Ruleset response has invalid rules or conditions')
    return json.dumps(normalize(result), indent=2, sort_keys=True) + '\n'


def main():
    with open(sys.argv[1], encoding='utf-8') as baseline:
        expected = snapshot(json.load(baseline))
    actual = snapshot(json.load(sys.stdin))
    if expected != actual:
        sys.stdout.writelines(difflib.unified_diff(expected.splitlines(True), actual.splitlines(True), fromfile='reviewed baseline', tofile='live ruleset'))
        return 1
    print('Observable ruleset matches reviewed baseline.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
