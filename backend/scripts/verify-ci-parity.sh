#!/usr/bin/env bash
# Backend CI parity guard (docs/backend/testing.md: CI substitution for backend
# suites). AGENTS.md lets the CI backend job stand in for local `npm run test`
# and `npm run test:e2e`; that rests on the job running those commands against
# the same PostgreSQL image as docker-compose.yml. This fails when either part
# drifts.
#
# It checks the image and the two commands only. The environment comparison
# reads the untracked backend/.env.test and stays a manual recheck.

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"
CI="$REPO_DIR/.github/workflows/ci.yml"
COMPOSE="$REPO_DIR/docker-compose.yml"
JOB="test-backend"

for f in "$CI" "$COMPOSE"; do
  if [ ! -f "$f" ]; then
    printf 'File not found: %s\n' "$f" >&2
    exit 2
  fi
done

# The test-backend job's lines: from its key to the next two-space job key.
job="$(awk -v job="  $JOB:" '
  $0 == job { inside = 1; next }
  inside && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ { exit }
  inside { print }
' "$CI")"

if [ -z "$job" ]; then
  printf '.github/workflows/ci.yml: job %s not found\n' "$JOB" >&2
  exit 1
fi

# First postgres image under the job's services, and under Compose services.
ci_image="$(awk '
  /^      postgres:[[:space:]]*$/ { inside = 1; next }
  inside && /^        image:/ { sub(/^        image:[[:space:]]*/, ""); print; exit }
  inside && /^      [^ ]/ { inside = 0 }
' <<<"$job")"
compose_image="$(awk '
  /^  postgres:[[:space:]]*$/ { inside = 1; next }
  inside && /^    image:/ { sub(/^    image:[[:space:]]*/, ""); print; exit }
  inside && /^  [^ ]/ { inside = 0 }
' "$COMPOSE")"

failed=0

if [ -z "$ci_image" ] || [ "$ci_image" != "$compose_image" ]; then
  printf 'PostgreSQL image differs: ci.yml %s uses "%s", docker-compose.yml uses "%s"\n' \
    "$JOB" "${ci_image:-<none>}" "${compose_image:-<none>}" >&2
  failed=1
fi

for script in test test:e2e; do
  if ! grep -Eq "^[[:space:]]+run: npm run ${script}( |\$)" <<<"$job"; then
    printf 'ci.yml %s no longer runs: npm run %s\n' "$JOB" "$script" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  printf 'The CI substitution in AGENTS.md rests on this parity; restore it or recheck docs/backend/testing.md "CI substitution for backend suites" before changing the rule.\n' >&2
  exit 1
fi
