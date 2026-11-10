#!/usr/bin/env bash
# Freeze legacy tracked paths; new evidence belongs in docs/evidence/<issue>/.
set -euo pipefail
export LC_ALL=C
REPO_DIR="${1:-$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(git -C "$REPO_DIR" rev-parse --show-toplevel)"
# Check the Git index recursively. Untracked files and content edits are excluded
# intentionally; only staged/tracked path changes belong to this guard (#1561).
tracked_files="$(mktemp)"
trap 'rm -f -- "$tracked_files"' EXIT
git -C "$REPO_DIR" ls-files -z -- docs/testing/ docs/backend/measurements/ > "$tracked_files"
declare -A actual=() expected_paths=()
while IFS= read -r -d '' path; do
  actual["$path"]=1
done < "$tracked_files"
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
  expected_paths["$path"]=1
  if [[ ! ${actual["$path"]+present} ]]; then
    printf '%s: legacy evidence record missing; cited records stay at their path\n' "$path"
    found=1
  fi
done <<< "$expected"
while IFS= read -r -d '' path; do
  if [[ ! ${expected_paths["$path"]+present} ]]; then
    printf '%s: new file in a closed evidence location; use docs/evidence/<issue>/\n' "$path"
    found=1
  fi
done < "$tracked_files"
exit "$found"
