#!/usr/bin/env bats
#
# The missing-variable contract for the after check (task 8, #1401). The e2e
# suite cannot express it -- it substitutes a SQL literal for `:'baseline'`.
# Real psql only substitutes `:'baseline'` when the variable exists; otherwise
# it is sent through unchanged and the server rejects it. So a missing baseline
# is a psql error with ON_ERROR_STOP, never an empty baseline. An empty
# baseline must be passed explicitly as [].
#
# Real psql, real server: a stub cannot prove this, and the host may not have
# psql, so psql runs from the same postgres image the CI service uses. The
# validation statement is table-free, so any reachable database proves the
# contract; the maintenance database avoids depending on test fixtures.

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../postcheck-vendor-payments-void.sql"
  ENV_FILE="$BATS_TEST_DIRNAME/../../.env.test"

  # CI exports DB_*; locally they come from the gitignored .env.test.
  if [ -z "${DB_USERNAME:-}" ] && [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi

  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  : "${DB_USERNAME:?DB_USERNAME is not set}"
  : "${DB_PASSWORD:?DB_PASSWORD is not set}"
}

@test "postcheck: a missing baseline is a psql error, never an empty baseline" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 < "$SCRIPT"

  # 3 is psql's ON_ERROR_STOP exit code for a server error; 2 would be a
  # connection failure, which would not prove the contract.
  [ "$status" -eq 3 ]
  [[ "$output" == *"syntax error"* ]]
  # psql echoes the offending line with the variable left unresolved.
  [[ "$output" == *":'baseline'"* ]]
  # The rejection is the unresolved variable itself; the script's own
  # malformed-baseline guard is not what caught it.
  [[ "$output" != *"malformed baseline"* ]]
  # Nothing after the validation statement ran.
  [[ "$output" != *"gate"* ]]
}
