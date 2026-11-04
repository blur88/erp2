#!/usr/bin/env bash
# Freeze legacy tracked paths; new evidence belongs in docs/evidence/<issue>/.
set -euo pipefail
export LC_ALL=C
REPO_DIR="${1:-$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(git -C "$REPO_DIR" rev-parse --show-toplevel)"
# Check the Git index recursively. Untracked files and content edits are excluded
# intentionally; only staged/tracked path changes belong to this guard (#1561).
actual="$(git -C "$REPO_DIR" -c core.quotePath=false ls-files -- docs/testing/ docs/backend/measurements/)"
expected="$(cat <<'PATHS'
docs/backend/measurements/1449/derive-results.py
docs/backend/measurements/1449/gate-result.txt
docs/backend/measurements/1449/heap-reporter.cjs
docs/backend/measurements/1449/machine.txt
docs/backend/measurements/1449/measurement-results.txt
docs/backend/measurements/1449/no-limit.jsonl
docs/backend/measurements/1449/no-limit.raw.jsonl
docs/backend/measurements/1449/with-limit.jsonl
docs/backend/measurements/1449/with-limit.raw.jsonl
docs/backend/measurements/1484/verification.md
docs/testing/async-wait-limit-5s-loaded-loop.output.txt
docs/testing/async-wait-limit-evidence.md
docs/testing/async-wait-limit-head-before-after.output.txt
docs/testing/async-wait-limit-lint-typecheck.output.txt
docs/testing/async-wait-limit-pr-checks-watch.output.txt
docs/testing/async-wait-limit-pr-checks.txt
docs/testing/async-wait-limit-session-records.txt
docs/testing/async-wait-limit-test-coverage-run.txt
docs/testing/async-wait-limit-test-coverage.output.txt
docs/testing/msw-unhandled-request-evidence.md
docs/testing/msw-unhandled-request-inventory.json
docs/testing/msw-unhandled-request-rerun.json
PATHS
)"
found=0
while IFS= read -r path; do
  if ! grep -Fxq -- "$path" <<< "$actual"; then
    printf 'legacy evidence removed: %s\n' "$path"
    found=1
  fi
done <<< "$expected"
while IFS= read -r path; do
  [ -n "$path" ] || continue
  if ! grep -Fxq -- "$path" <<< "$expected"; then
    printf 'legacy evidence added: %s\n' "$path"
    found=1
  fi
done <<< "$actual"
exit "$found"
