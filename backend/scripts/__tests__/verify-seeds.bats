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
  [[ "$output" == *"11"* ]]
  [[ "$output" == *"8"* ]]
  [[ "$output" != *"  ok "* ]]
  assert_no_sentinel
}

@test "verify-seeds: stale candidate — correct count but wrong latest migration" {
  # Count MATCHES the repository, so this can only fail via the latest-name
  # signal. That is the whole reason this spec is separate from the one above.
  export STUB_MIGRATION_COUNT=11
  export STUB_LATEST_MIGRATION='SomeOtherMigration1700000000000'
  run_seeds

  [ "$status" -eq 2 ]
  [[ "$output" == *"verify-baseline.sh"* ]]
  [[ "$output" == *"AddRedisMonitoringTables1786712086437"* ]]
  [[ "$output" == *"SomeOtherMigration1700000000000"* ]]
  [[ "$output" != *"  ok "* ]]
  assert_no_sentinel
}

@test "verify-seeds: fresh candidate passes preflight and reaches the row counts" {
  export STUB_DB_EXISTS=1
  export STUB_MIGRATION_COUNT=11
  export STUB_LATEST_MIGRATION='AddRedisMonitoringTables1786712086437'
  run_seeds

  # Preflight passed, so the script proceeds into its content checks. Those
  # fail against a stub that returns no rows — that is expected and out of
  # scope; the contract asserted here is that the preflight let it through.
  [[ "$output" == *"==> Row counts"* ]]
  [ "$status" -ne 2 ]
  assert_no_sentinel
}
