#!/usr/bin/env bats

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../preflight-costing-method-p4s1.sql"
  ENV_FILE="$BATS_TEST_DIRNAME/../../.env.test"

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

run_preflight() {
  local seed_sql="$1"
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    postgres:18.3-alpine3.23 \
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
      -c "$seed_sql" \
      -f - \
      -c 'SELECT '\''UNCHANGED='\'' || string_agg("costingMethod", '\'','\'' ORDER BY id) FROM regional_settings' \
      < "$SCRIPT"
}

@test "prints PASS for only supported methods and preserves the input rows" {
  run_preflight 'CREATE TEMP TABLE regional_settings (id integer, "costingMethod" text); INSERT INTO regional_settings VALUES (1, '\''AVERAGE'\''), (2, '\''FIFO'\'');'

  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: all costing methods are AVERAGE or FIFO"* ]]
  [[ "$output" == *"UNCHANGED=AVERAGE,FIFO"* ]]
}

@test "prints HOLD for an unsupported method and preserves the input rows" {
  run_preflight 'CREATE TEMP TABLE regional_settings (id integer, "costingMethod" text); INSERT INTO regional_settings VALUES (1, '\''LIFO'\'');'

  [ "$status" -eq 0 ]
  [[ "$output" == *"1|LIFO"* ]]
  [[ "$output" == *"HOLD: resolve unsupported costing methods before deployment"* ]]
  [[ "$output" == *"UNCHANGED=LIFO"* ]]
}
