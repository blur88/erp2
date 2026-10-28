#!/usr/bin/env bash
# Backend CI parity guard (docs/backend/testing.md: CI substitution for backend
# suites). AGENTS.md lets the CI backend job stand in for local `npm run test`
# and `npm run test:e2e`; that rests on the job running those commands against
# the same PostgreSQL image as docker-compose.yml. This fails when either part
# drifts, or when the job or either suite's step is made conditional
# (`if:`) or non-gating (`continue-on-error:`).
#
# It checks the image, the job, and the two commands' steps only. It does not
# catch a command that still runs but is narrowed or masked (extra Jest
# arguments, `|| true`, a changed `working-directory`). The environment
# comparison reads the untracked backend/.env.test and stays a manual recheck.

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"
CI="$REPO_DIR/.github/workflows/ci.yml"
COMPOSE="$REPO_DIR/docker-compose.yml"
JOB="test-backend"
TRAILER='The CI substitution in AGENTS.md rests on this parity; restore it or recheck docs/backend/testing.md "CI substitution for backend suites" before changing the rule.'

for f in "$CI" "$COMPOSE"; do
  if [ ! -f "$f" ]; then
    printf 'File not found: %s\n' "$f" >&2
    exit 2
  fi
done

# The test-backend job's lines: from its key to the next two-space job key.
job="$(awk -v job="$JOB" '
  $0 ~ "^  " job ":[[:space:]]*(#.*)?$" { inside = 1; next }
  inside && /^  [A-Za-z0-9_-]+:[[:space:]]*(#.*)?$/ { exit }
  inside { print }
' "$CI")"

if [ -z "$job" ]; then
  printf '.github/workflows/ci.yml: job %s not found\n%s\n' "$JOB" "$TRAILER" >&2
  exit 1
fi

# postgres_image INDENT: the image of the first `postgres:` key at INDENT
# spaces, read from stdin, with surrounding quotes removed.
postgres_image() {
  awk -v pad="$(printf '%*s' "$1" '')" '
    $0 ~ "^" pad "postgres:[[:space:]]*$" { inside = 1; next }
    inside && $0 ~ "^" pad "  image:" {
      sub("^" pad "  image:[[:space:]]*", ""); gsub(/["'\'']/, ""); print; exit
    }
    inside && $0 ~ "^" pad "[^ ]" { inside = 0 }
  '
}

ci_image="$(postgres_image 6 <<<"$job")"
compose_image="$(postgres_image 2 <"$COMPOSE")"

failed=0

if [ -z "$ci_image" ] || [ "$ci_image" != "$compose_image" ]; then
  printf 'PostgreSQL image differs: ci.yml %s uses "%s", docker-compose.yml uses "%s"\n' \
    "$JOB" "${ci_image:-<none>}" "${compose_image:-<none>}" >&2
  failed=1
fi

if grep -Eq '^    (if|continue-on-error):' <<<"$job"; then
  printf 'ci.yml %s is conditional or non-gating at job level (if: or continue-on-error:)\n' "$JOB" >&2
  failed=1
fi

# Each step of the job, numbered: "<step> <line>". Lines after the last step
# keep its number.
steps="$(awk '/^      - / { n++ } n { print n " " $0 }' <<<"$job")"

for script in test test:e2e; do
  step="$(grep -E "^[0-9]+ +(- )?run: npm run ${script}( |\$)" <<<"$steps" | head -1 | cut -d' ' -f1 || true)"
  if [ -z "$step" ]; then
    printf 'ci.yml %s no longer runs: npm run %s\n' "$JOB" "$script" >&2
    failed=1
  elif grep -Eq "^${step} +(- )?(if|continue-on-error):" <<<"$steps"; then
    printf 'ci.yml %s step running npm run %s is conditional or non-gating (if: or continue-on-error:)\n' "$JOB" "$script" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf '%s\n' "$TRAILER" >&2
  exit 1
fi
