#!/usr/bin/env bats
#
# Guard for #1466. TypeORM's `migration:run --fake` records every pending
# migration as applied without running it. Advice to run it went stale in the
# entrypoint once the chain grew past InitialSchema; this keeps the flag out of
# tracked files except for the exact lines allow-listed in the checker.

CHECK="${BATS_TEST_DIRNAME}/../verify-no-fake-migration-advice.sh"
GUIDANCE='Point operators to docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md, section "Existing database": --fake records every pending migration as applied without running it (#1466).'
GUIDE=docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md
GUIDE_LINE='`migration:run --fake` with the full migration configuration: that command records'
MIGRATION=backend/src/database/migrations/1785400000000-RemoveStaleVendorPaymentDocumentNumber.ts
MIGRATION_LINE='        // runs `migration:run --fake`, which records genesis as applied without'
ENTRYPOINT_TEST=backend/scripts/__tests__/docker-entrypoint.bats
ENTRYPOINT_TEST_LINE='  [[ "$output" != *--fake* ]]'

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO"
  git -C "$REPO" init -q
}

# Writes content to a repository-relative path and stages it.
track() {
  mkdir -p "$REPO/$(dirname "$1")"
  printf '%s\n' "$2" > "$REPO/$1"
  git -C "$REPO" add "$1"
}

@test "rejects fake-migration advice in a tracked script" {
  track backend/docker-entrypoint.sh 'echo "run migration:run --fake first"'

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "backend/docker-entrypoint.sh:1: echo \"run migration:run --fake first\"
$GUIDANCE" ]
}

@test "allows only the exact allow-listed lines" {
  track "$GUIDE" "$GUIDE_LINE"
  track "$MIGRATION" "$MIGRATION_LINE"
  track "$ENTRYPOINT_TEST" "$ENTRYPOINT_TEST_LINE"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "rejects new advice in a file that also holds an allow-listed line" {
  track "$GUIDE" "$GUIDE_LINE
Then run npm run typeorm -- migration:run --fake."

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "$GUIDE:2: Then run npm run typeorm -- migration:run --fake.
$GUIDANCE" ]
}

@test "rejects an allow-listed line moved to another file" {
  track docs/deployment/DEPLOYMENT_CHECKLIST.md "$GUIDE_LINE"

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "docs/deployment/DEPLOYMENT_CHECKLIST.md:1: $GUIDE_LINE
$GUIDANCE" ]
}

@test "skips historical docs, local plans, the guard's own files and untracked files" {
  track docs/archive/old.md 'migration:run --fake'
  track docs/superpowers/plans/plan.md 'migration:run --fake'
  track backend/scripts/verify-no-fake-migration-advice.sh 'PATTERN=--fake'
  track backend/scripts/__tests__/no-fake-migration-advice.bats 'migration:run --fake'
  printf 'migration:run --fake\n' > "$REPO/untracked.md"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the checked-out repository obeys the fake-migration guard" {
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
