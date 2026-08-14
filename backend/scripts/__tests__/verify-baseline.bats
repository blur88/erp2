#!/usr/bin/env bats
#
# Preflight boundaries only (#1061 scope). Seed/schema-diff machinery is not
# covered here.

load helpers/load

setup() {
  setup_harness
  ENV_FILE_PATH="$TEST_TMP/env.local"
}
teardown() { teardown_harness; }

# Runs verify-baseline.sh from backend/ (its real invocation directory) with a
# controlled ENV_FILE, never the developer's .env.local.
run_baseline() {
  run env -C "$SCRIPTS_DIR/.." ENV_FILE="$ENV_FILE_PATH" \
    bash "$SCRIPTS_DIR/verify-baseline.sh"
}

@test "verify-baseline: missing DB_PASSWORD exits 2 before touching any database" {
  cat > "$ENV_FILE_PATH" <<'EOF'
DB_USERNAME=erp_user
EOF
  # Ensure no ambient password satisfies the check.
  unset DB_PASSWORD
  run_baseline

  [ "$status" -eq 2 ]
  [[ "$output" == *"DB_PASSWORD is not set"* ]]
  # Nothing may have been created or dropped.
  run stub_calls
  [[ "$output" != *"DROP DATABASE"* ]]
}

@test "verify-baseline: failed TCP probe exits 2 without claiming authentication failed" {
  write_env_file "$ENV_FILE_PATH" >/dev/null
  export STUB_NODE_EXIT=1
  run_baseline

  [ "$status" -eq 2 ]
  [[ "$output" == *"Cannot connect to PostgreSQL"* ]]
  # The probe cannot distinguish bad credentials from DNS/port/TLS/down, so it
  # must not name a cause it did not establish (#1059).
  [[ "$output" != *"authentication failed"* ]]
  assert_no_sentinel
}

@test "verify-baseline: successful probe proceeds past preflight to the first mutation" {
  write_env_file "$ENV_FILE_PATH" >/dev/null
  export STUB_NODE_EXIT=0
  run_baseline

  # The script continues into schema:sync / migration:run, which this harness
  # does not stub; the assertion is that the preflight was PASSED, evidenced by
  # the first logged docker mutation. Exit status is deliberately not asserted.
  run stub_calls
  [[ "$output" == *"DROP DATABASE"* ]]
  assert_no_sentinel
}
