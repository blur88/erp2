#!/usr/bin/env bash
# Read the observable ruleset and detect drift without changing GitHub (#1898).
set -euo pipefail

live=$(mktemp)
trap 'rm -f "$live"' EXIT
if ! gh api "repos/${GITHUB_REPOSITORY:?}/rulesets/15609777" > "$live"; then
  echo '::error::Cannot read ruleset 15609777 with GITHUB_TOKEN. Stop here; report the access limitation on #1898. Do not add credentials.' >&2
  exit 1
fi
node scripts/compare-ruleset.cjs .github/ruleset-15609777.snapshot.json "$live"
