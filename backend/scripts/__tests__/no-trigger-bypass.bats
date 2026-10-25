#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-no-trigger-bypass.sh"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/backend/src/database/migrations" "$REPO/backend/test/utils"
}

@test "rejects DISABLE TRIGGER in application source regardless of case and spacing" {
  printf 'ALTER TABLE records dIsAbLe\t\n tRiGgEr USER;\n' > "$REPO/backend/src/example.ts"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [ "$output" = "backend/src/example.ts:1: forbidden trigger disable: dIsAbLe tRiGgEr
Trigger bypass SQL is forbidden in backend application source; only DROP TRIGGER and DROP INDEX in migrations are allowed." ]
}

@test "rejects DROP TRIGGER outside migrations" {
  printf '\nDROP   TRIGGER IF EXISTS unsafe;\n' > "$REPO/backend/src/example.ts"

  run "$CHECK" "$REPO"

  [ "$status" -ne 0 ]
  [ "$output" = "backend/src/example.ts:2: trigger drop outside migrations: DROP TRIGGER
Trigger bypass SQL is forbidden in backend application source; only DROP TRIGGER and DROP INDEX in migrations are allowed." ]
}

@test "allows trigger operations in migrations and the test fixture" {
  printf 'DROP TRIGGER IF EXISTS historical ON records;\n' > "$REPO/backend/src/database/migrations/001-history.ts"
  printf 'ALTER TABLE records DISABLE TRIGGER USER;\nDROP TRIGGER IF EXISTS fixture ON records;\n' > "$REPO/backend/test/utils/bank-reconciliation-fixture.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the checked-out repository obeys the trigger guard" {
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
}

@test "rejects session_replication_role in application source and migrations" {
  for location in example.ts database/migrations/001-unsafe.ts; do
    for sql in "SET SeSsIoN_RePlIcAtIoN_RoLe = replica;" "SET LOCAL SeSsIoN_RePlIcAtIoN_RoLe = replica;" "SELECT set_config('SeSsIoN_RePlIcAtIoN_RoLe', 'replica', false);"; do
      printf '\n%s\n' "$sql" > "$REPO/backend/src/$location"

      run "$CHECK" "$REPO"

      [ "$status" -eq 1 ]
      [ "$output" = "backend/src/$location:2: forbidden replication role: SeSsIoN_RePlIcAtIoN_RoLe
Trigger bypass SQL is forbidden in backend application source; only DROP TRIGGER and DROP INDEX in migrations are allowed." ]
      rm "$REPO/backend/src/$location"
    done
  done
}

@test "rejects DROP INDEX outside migrations regardless of case and spacing" {
  printf '\ndRoP\t\n InDeX IF EXISTS unsafe;\n' > "$REPO/backend/src/example.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "backend/src/example.ts:2: index drop outside migrations: dRoP InDeX
Trigger bypass SQL is forbidden in backend application source; only DROP TRIGGER and DROP INDEX in migrations are allowed." ]
}

@test "allows index drops in migrations and bypass SQL in test fixtures" {
  printf 'DROP\t\n INDEX IF EXISTS historical;\n' > "$REPO/backend/src/database/migrations/001-history.ts"
  printf "SET session_replication_role = replica;\nDROP INDEX UQ_bsr_one_draft_per_account;\n" > "$REPO/backend/test/utils/bank-reconciliation-fixture.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
