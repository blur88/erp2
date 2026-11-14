#!/usr/bin/env bash
# Run from the repository root (or a fixture with the same test directory).
set -e

# node --test exits 0 when the glob matches nothing or a file holds no
# test cases. Require at least one real case: the TAP reporter also
# emits one top-level entry per file (named by its path), so those are
# excluded from the count. Capture the status with `|| status=$?`
# because the runner's bash runs with -e.
tap="$(mktemp)"
trap 'rm -f "$tap"' EXIT
status=0
node --test --test-reporter=tap 'scripts/__tests__/*.test.*' > "$tap" 2>&1 || status=$?
cat "$tap"
if [ "$status" -ne 0 ]; then
  exit "$status"
fi
cases="$(grep -E '^(not )?ok [0-9]+ - ' "$tap" | grep -vcE ' - scripts/__tests__/[^ ]+$' || true)"
if [ "$cases" -eq 0 ]; then
  echo "Root release-tooling tests: no test cases ran" >&2
  exit 1
fi
