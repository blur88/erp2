#!/usr/bin/env bats

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../postcheck-stock-correction-path.sql"
  FIXTURE="$BATS_TEST_DIRNAME/fixtures/postcheck-stock-correction-path.sql"
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

@test "postcheck: stock correction schema and retained history invariants pass" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -f /fixture.sql -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: PASS"* ]]
  [[ "$output" != *"stock-correction postcheck: FAIL"* ]]
  [[ "$output" == *"valuation_gap_exposure"* ]]
  [[ "$output" == *"Gap exposure product"* ]]
  [[ "$output" == *"11.0000"* ]]
}

@test "postcheck: a batch reversal linked to another receipt fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 \
    -f /fixture.sql \
    -c "UPDATE stock_occurrences SET \"reversesOccurrenceId\" = '00000000-0000-4000-8000-000000000007' WHERE id = '00000000-0000-4000-8000-000000000003';" \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
}

@test "postcheck: a receipt-line index with the wrong keys fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 \
    -f /fixture.sql \
    -c 'DROP INDEX "UQ_stock_movement_occurrence_item"; CREATE UNIQUE INDEX "UQ_stock_movement_occurrence_item" ON stock_movements ("productSequence") WHERE "productSequence" IS NOT NULL;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
}

@test "postcheck: occurrence marker inconsistent with valuation-gap rows fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 \
    -f /fixture.sql \
    -c 'UPDATE stock_occurrences SET "hasValuationGap" = false WHERE id = '\''00000000-0000-4000-8000-000000000009'\'';' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  [[ "$output" == *"gap_marker_mismatch_count"* ]]
}

@test "postcheck: batch allocation plus gap quantity mismatch fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 \
    -f /fixture.sql \
    -c 'UPDATE stock_movement_valuation_gaps SET quantity = 2;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  [[ "$output" == *"gap_quantity_mismatch_count"* ]]
}

@test "postcheck: missing FK_purchase_cost_history_occurrence fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 \
    -f /fixture.sql \
    -c 'ALTER TABLE purchase_cost_history DROP CONSTRAINT "FK_purchase_cost_history_occurrence";' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
}

