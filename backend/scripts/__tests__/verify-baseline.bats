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

@test "pg-transport: unknown PG_TRANSPORT aborts with exit 2 and names the value" {
  run env PG_TRANSPORT=carrier-pigeon bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"'

  [ "$status" -eq 2 ]
  [[ "$output" == *"must be 'compose' or 'tcp'"* ]]
  [[ "$output" == *"carrier-pigeon"* ]]
}

@test "pg-transport: compose aborts when the postgres service does not answer" {
  # command -v docker only proves the CLI exists; the gate needs the SERVICE.
  run env PATH="$PATH" PG_TRANSPORT=compose STUB_COMPOSE_READY=0 bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=erp_user DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"'

  [ "$status" -eq 2 ]
  [[ "$output" == *"pg_isready"* ]]
  [[ "$output" == *"docker compose up -d postgres"* ]]
}

@test "pg-transport: tcp aborts when pg_dump major version is not 18" {
  run env PATH="$PATH" PG_TRANSPORT=tcp STUB_PGDUMP_VERSION=16.4 bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"'

  [ "$status" -eq 2 ]
  [[ "$output" == *"major version"* ]]
  [[ "$output" == *"postgresql-client-18"* ]]
}

@test "pg-transport: tcp aborts on a PGHOST that conflicts with DB_HOST" {
  run env PATH="$PATH" PG_TRANSPORT=tcp PGHOST=other.example bash -c \
    'set -euo pipefail; DB_HOST=localhost DB_PORT=5432 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"'

  [ "$status" -eq 2 ]
  # Must not silently pick one: the message names BOTH values.
  [[ "$output" == *"other.example"* ]]
  [[ "$output" == *"localhost"* ]]
}

@test "pg-transport: tcp derives PGHOST/PGPORT/PGUSER from DB_*" {
  run env PATH="$PATH" PG_TRANSPORT=tcp bash -c \
    'set -euo pipefail; DB_HOST=db.example DB_PORT=6543 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; echo "H=$PGHOST P=$PGPORT U=$PGUSER"'

  [ "$status" -eq 0 ]
  [[ "$output" == *"H=db.example P=6543 U=u"* ]]
}

# --- wrapper behaviour -------------------------------------------------
# The cases above test SOURCING. These test the wrappers themselves, which
# is where an `exec`, a mangled argument, or a swallowed exit status would
# actually bite.

@test "pg_psql: passes the SQL as exactly one argument, not split on its spaces" {
  run env PATH="$PATH" PG_TRANSPORT=tcp bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; pg_psql -U u -d postgres -tAc "SELECT '"'"'a b'"'"', 2;"'

  [ "$status" -eq 0 ]
  run stub_calls

  # Exact count, not a substring match. A "$*"-joined log line reads the same
  # whether the wrapper forwarded "$@" correctly or split on whitespace, so
  # only the per-argument record can catch a boundary bug: broken forwarding
  # of this call yields ARGC=9 and splits the SQL across ARG[6]..ARG[9].
  [[ "$output" == *"psql ARGC=6"* ]]
  [[ "$output" == *"psql ARG[5]=-tAc"* ]]
  [[ "$output" == *"psql ARG[6]=SELECT 'a b', 2;"* ]]

  # The SQL must not have leaked into a seventh argument.
  [[ "$output" != *"psql ARG[7]="* ]]
}

@test "pg_psql: passes stdin through and its stdout is capturable" {
  run env PATH="$PATH" PG_TRANSPORT=tcp STUB_ECHO_STDIN=1 bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; printf "FROMSTDIN\n" | pg_psql -U u -d postgres'

  [ "$status" -eq 0 ]
  [[ "$output" == *"FROMSTDIN"* ]]
  [[ "$output" == *"ROW"* ]]
}

@test "pg_psql: propagates a non-zero exit AND the script keeps running" {
  # The direct proof that no `exec` crept into the wrapper: after a failing
  # call the script must still reach its later lines. An exec'd psql would
  # replace the shell and SCRIPT_CONTINUED would never print.
  run env PATH="$PATH" PG_TRANSPORT=tcp STUB_PSQL_EXIT=3 bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; set +e; pg_psql -U u -d postgres -c "SELECT 1" >/dev/null 2>&1; echo "status=$?"; set -e; echo SCRIPT_CONTINUED'

  [ "$status" -eq 0 ]
  [[ "$output" == *"status=3"* ]]
  [[ "$output" == *"SCRIPT_CONTINUED"* ]]
}

@test "pg_dump_db: forwards flags and the script keeps running after it" {
  run env PATH="$PATH" PG_TRANSPORT=tcp bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=u DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; pg_dump_db -U u --schema-only --no-owner erp_gate_candidate >/dev/null; echo SCRIPT_CONTINUED'

  [ "$status" -eq 0 ]
  [[ "$output" == *"SCRIPT_CONTINUED"* ]]
  run stub_calls
  [[ "$output" == *"pg_dump ARGC=5"* ]]
  [[ "$output" == *"pg_dump ARG[2]=u"* ]]
  [[ "$output" == *"pg_dump ARG[3]=--schema-only"* ]]
  [[ "$output" == *"pg_dump ARG[5]=erp_gate_candidate"* ]]
}

@test "pg_psql: compose mode adds no -h/-p flags" {
  # The connection is container-local; host flags would break every local run.
  run env PATH="$PATH" PG_TRANSPORT=compose bash -c \
    'set -euo pipefail; DB_HOST=h DB_PORT=1 DB_USERNAME=erp_user DB_PASSWORD=p; . "'"$SCRIPTS_DIR"'/lib/pg-transport.sh"; pg_psql -U erp_user -d postgres -c "SELECT 1"'

  [ "$status" -eq 0 ]
  run stub_calls
  # The docker stub still logs "docker $*"; only psql/pg_dump log per-argument.
  [[ "$output" == *"exec -T postgres psql"* ]]
  [[ "$output" != *" -h "* ]]
  [[ "$output" != *" -p "* ]]
}
