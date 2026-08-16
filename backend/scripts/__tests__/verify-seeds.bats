#!/usr/bin/env bats
#
# Preflight boundaries only (#1061 scope). Row counts, value assertions, and
# FAILED aggregation are deliberately not covered.

load helpers/load

setup() {
  setup_harness
  ENV_FILE_PATH="$TEST_TMP/env.local"
  write_env_file "$ENV_FILE_PATH" >/dev/null
}
teardown() { teardown_harness; }

run_seeds() {
  run env -C "$SCRIPTS_DIR/.." ENV_FILE="$ENV_FILE_PATH" \
    bash "$SCRIPTS_DIR/verify-seeds.sh"
}

# The expected migration count and latest-migration name are properties of the
# repository, not constants. Deriving them here — the same way verify-seeds.sh
# does — keeps these specs correct as migrations are added. Hardcoding them
# meant every new migration broke this suite with a failure that looks like a
# gate regression but is only a stale fixture.
repo_migration_count() {
  find "$SCRIPTS_DIR/../src/database/migrations" -maxdepth 1 -name '*.ts' | wc -l | tr -d ' '
}

repo_latest_migration() {
  local newest
  newest=$(find "$SCRIPTS_DIR/../src/database/migrations" -maxdepth 1 -name '*.ts' -printf '%f\n' | sort -n | tail -1)
  local name="${newest#*-}"
  name="${name%.ts}"
  printf '%s%s\n' "$name" "${newest%%-*}"
}

@test "verify-seeds: absent candidate fails before any check line and names verify-baseline.sh" {
  export STUB_DB_EXISTS=0
  run_seeds

  [ "$status" -eq 2 ]
  [[ "$output" == *"erp_gate_candidate"* ]]
  [[ "$output" == *"verify-baseline.sh"* ]]

  # The whole point of #1061: no content verdicts, no psql noise.
  [[ "$output" != *"  ok "* ]]
  [[ "$output" != *"  FAIL "* ]]
  [[ "$output" != *"psql:"* ]]
  [[ "$output" != *"==> Row counts"* ]]
  assert_no_sentinel
}

@test "verify-seeds: stale candidate — migration count mismatch" {
  export STUB_MIGRATION_COUNT=8
  run_seeds

  [ "$status" -eq 2 ]
  [[ "$output" == *"verify-baseline.sh"* ]]
  # Message must report both sides, not a bare "stale".
  [[ "$output" == *"$(repo_migration_count)"* ]]
  [[ "$output" == *"8"* ]]
  [[ "$output" != *"  ok "* ]]
  assert_no_sentinel
}

@test "verify-seeds: stale candidate — correct count but wrong latest migration" {
  # Count MATCHES the repository, so this can only fail via the latest-name
  # signal. That is the whole reason this spec is separate from the one above.
  export STUB_MIGRATION_COUNT="$(repo_migration_count)"
  export STUB_LATEST_MIGRATION='SomeOtherMigration1700000000000'
  run_seeds

  [ "$status" -eq 2 ]
  [[ "$output" == *"verify-baseline.sh"* ]]
  [[ "$output" == *"$(repo_latest_migration)"* ]]
  [[ "$output" == *"SomeOtherMigration1700000000000"* ]]
  [[ "$output" != *"  ok "* ]]
  assert_no_sentinel
}

@test "verify-seeds: fresh candidate passes preflight and reaches the row counts" {
  export STUB_DB_EXISTS=1
  export STUB_MIGRATION_COUNT="$(repo_migration_count)"
  export STUB_LATEST_MIGRATION="$(repo_latest_migration)"
  run_seeds

  # Preflight passed, so the script proceeds into its content checks. Those
  # fail against a stub that returns no rows — that is expected and out of
  # scope; the contract asserted here is that the preflight let it through.
  [[ "$output" == *"==> Row counts"* ]]
  [ "$status" -ne 2 ]
  assert_no_sentinel
}
