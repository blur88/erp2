#!/usr/bin/env bash
# Shared harness for the gate-script specs.
#
# These specs run the REAL scripts. Postgres, Docker, and TypeORM are replaced
# by PATH stubs so the specs assert the scripts' observable contract — command
# ordering, early exit, diagnostics, and suppression of psql noise — without a
# live stack.

SENTINEL_PASSWORD='s3ntinel-do-not-print'

# Absolute path to backend/scripts (the directory under test).
SCRIPTS_DIR="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

setup_harness() {
  TEST_TMP="$(mktemp -d)"
  STUB_LOG="$TEST_TMP/calls.log"
  : > "$STUB_LOG"
  export STUB_LOG

  # Stubs must win over any real docker/node on PATH.
  PATH="${BATS_TEST_DIRNAME}/helpers/stub-bin:$PATH"
  export PATH

  # Hermetic defaults. Individual specs override before running the script.
  export STUB_DB_EXISTS=1
  export STUB_MIGRATION_COUNT=11
  export STUB_LATEST_MIGRATION='AddRedisMonitoringTables1786712086437'
  export STUB_SEED_MODE=pass
  export STUB_NODE_EXIT=0
}

teardown_harness() {
  [ -n "${TEST_TMP:-}" ] && rm -rf "$TEST_TMP"
}

# Writes a controlled ENV_FILE so the scripts never source the developer's
# real backend/.env.local. Callers export ENV_FILE to this path.
write_env_file() {
  local path="$1"
  cat > "$path" <<EOF
DB_USERNAME=erp_user
DB_PASSWORD=${SENTINEL_PASSWORD}
DB_HOST=localhost
DB_PORT=5432
EOF
  printf '%s' "$path"
}

# #1061 requires that no credential value reaches output. Asserted, not assumed.
assert_no_sentinel() {
  if printf '%s' "$output" | grep -qF "$SENTINEL_PASSWORD"; then
    echo "SENTINEL LEAKED into output:" >&2
    printf '%s\n' "$output" >&2
    return 1
  fi
}

stub_calls() {
  cat "$STUB_LOG"
}
