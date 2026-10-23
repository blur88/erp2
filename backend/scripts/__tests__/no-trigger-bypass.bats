#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-no-trigger-bypass.sh"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/backend/src/database/migrations" "$REPO/backend/test/utils"
}

@test "rejects DISABLE TRIGGER in application source regardless of case and spacing" {
  printf 'ALTER TABLE records DISABLE\t\n TRIGGER USER;\n' > "$REPO/backend/src/example.ts"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"backend/src/example.ts"* ]]
  [[ "$output" == *"forbidden trigger disable"* ]]
}

@test "rejects DROP TRIGGER outside migrations" {
  printf 'DROP   TRIGGER IF EXISTS unsafe;\n' > "$REPO/backend/src/example.ts"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [[ "$output" == *"backend/src/example.ts"* ]]
  [[ "$output" == *"trigger drop outside migrations"* ]]
}

@test "allows trigger operations in migrations and the test fixture" {
  printf 'DROP TRIGGER IF EXISTS historical ON records;\n' > "$REPO/backend/src/database/migrations/001-history.ts"
  printf 'ALTER TABLE records DISABLE TRIGGER USER;\nDROP TRIGGER IF EXISTS fixture ON records;\n' > "$REPO/backend/test/utils/bank-reconciliation-fixture.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
}

@test "the checked-out repository obeys the trigger guard" {
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
}
