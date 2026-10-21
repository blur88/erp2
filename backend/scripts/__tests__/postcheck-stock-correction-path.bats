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

teardown() {
  docker run --rm --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -c 'DROP DATABASE IF EXISTS postcheck_stock_fixture' >/dev/null 2>&1 || true
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

@test "postcheck: a NOT VALID expected foreign key fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x \
    -f /fixture.sql \
    -c 'ALTER TABLE stock_occurrences DROP CONSTRAINT "FK_stock_occurrences_legacy_journal"; ALTER TABLE stock_occurrences ADD CONSTRAINT "FK_stock_occurrences_legacy_journal" FOREIGN KEY ("legacyJournalEntryId") REFERENCES journal_entry(id) ON DELETE RESTRICT NOT VALID;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_fks +\| 12$' <<<"$output"
  grep -Eq '^expected_fks +\| 13$' <<<"$output"
}

@test "postcheck: a NOT VALID valuation-gap check fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x \
    -f /fixture.sql \
    -c 'ALTER TABLE stock_movement_valuation_gaps DROP CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive"; ALTER TABLE stock_movement_valuation_gaps ADD CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive" CHECK (quantity > 0) NOT VALID;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_checks +\| 3$' <<<"$output"
  grep -Eq '^expected_gap_checks +\| 4$' <<<"$output"
}

@test "postcheck: a NOT VALID other check fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x \
    -f /fixture.sql \
    -c 'ALTER TABLE stock_batch_consumptions DROP CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive"; ALTER TABLE stock_batch_consumptions ADD CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK (quantity > 0) NOT VALID;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_other_checks +\| 1$' <<<"$output"
  grep -Eq '^expected_other_checks +\| 2$' <<<"$output"
}

@test "postcheck: expected FK only outside public fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_batch_consumptions DROP CONSTRAINT "FK_51f795684690dbcdee919a915f2"; CREATE SCHEMA shadow; CREATE TABLE shadow.stock_batch_consumptions (id uuid, "batchId" uuid, CONSTRAINT "FK_51f795684690dbcdee919a915f2" FOREIGN KEY ("batchId") REFERENCES public.purchase_cost_history(id) ON DELETE RESTRICT);' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_fks +\| 12$' <<<"$output"
  grep -Eq '^expected_fks +\| 13$' <<<"$output"
}

@test "postcheck: gap CHECK only outside public fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_movement_valuation_gaps DROP CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive"; CREATE SCHEMA shadow; CREATE TABLE shadow.stock_movement_valuation_gaps (quantity numeric(15,4), CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive" CHECK (quantity > 0));' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_checks +\| 3$' <<<"$output"
  grep -Eq '^expected_gap_checks +\| 4$' <<<"$output"
}

@test "postcheck: other CHECK only outside public fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_batch_consumptions DROP CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive"; CREATE SCHEMA shadow; CREATE TABLE shadow.stock_batch_consumptions (quantity numeric, CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK (quantity > 0));' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_other_checks +\| 1$' <<<"$output"
  grep -Eq '^expected_other_checks +\| 2$' <<<"$output"
}

@test "postcheck: valuation-gap trigger only outside public fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'DROP TRIGGER "trg_stock_movement_valuation_gap_immutable" ON public.stock_movement_valuation_gaps; CREATE SCHEMA shadow; CREATE TABLE shadow.stock_movement_valuation_gaps ("movementId" uuid); CREATE TRIGGER "trg_stock_movement_valuation_gap_immutable" BEFORE DELETE OR UPDATE ON shadow.stock_movement_valuation_gaps FOR EACH ROW EXECUTE FUNCTION public.stock_movement_valuation_gap_immutable();' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_triggers +\| 2$' <<<"$output"
  grep -Eq '^expected_gap_triggers +\| 3$' <<<"$output"
}

@test "postcheck: partial unique index only outside public fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'DROP INDEX public."UQ_stock_movement_reverses"; CREATE SCHEMA shadow; CREATE TABLE shadow.stock_movements ("reversesMovementId" uuid); CREATE UNIQUE INDEX "UQ_stock_movement_reverses" ON shadow.stock_movements ("reversesMovementId") WHERE "reversesMovementId" IS NOT NULL;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_indexes +\| 4$' <<<"$output"
  grep -Eq '^expected_indexes +\| 5$' <<<"$output"
}

@test "postcheck: a gap CHECK with a different expression fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_movement_valuation_gaps DROP CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive"; ALTER TABLE public.stock_movement_valuation_gaps ADD CONSTRAINT "CHK_stock_movement_valuation_gap_quantity_positive" CHECK (quantity >= 0);' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_checks +\| 3$' <<<"$output"
  grep -Eq '^expected_gap_checks +\| 4$' <<<"$output"
}

@test "postcheck: an other CHECK with a different expression fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_batch_consumptions DROP CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive"; ALTER TABLE public.stock_batch_consumptions ADD CONSTRAINT "CHK_stock_batch_consumptions_quantity_positive" CHECK (true);' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_other_checks +\| 1$' <<<"$output"
  grep -Eq '^expected_other_checks +\| 2$' <<<"$output"
}

@test "postcheck: a deferrable expected foreign key fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_occurrences DROP CONSTRAINT "FK_stock_occurrences_legacy_journal"; ALTER TABLE public.stock_occurrences ADD CONSTRAINT "FK_stock_occurrences_legacy_journal" FOREIGN KEY ("legacyJournalEntryId") REFERENCES public.journal_entry(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_fks +\| 12$' <<<"$output"
  grep -Eq '^expected_fks +\| 13$' <<<"$output"
}

@test "postcheck: a disabled valuation-gap trigger fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'ALTER TABLE public.stock_movement_valuation_gaps DISABLE TRIGGER "trg_stock_movement_valuation_gap_immutable";' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_triggers +\| 2$' <<<"$output"
  grep -Eq '^expected_gap_triggers +\| 3$' <<<"$output"
}

@test "postcheck: a valuation-gap trigger with different events fails" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'DROP TRIGGER "trg_stock_movement_valuation_gap_immutable" ON public.stock_movement_valuation_gaps; CREATE TRIGGER "trg_stock_movement_valuation_gap_immutable" BEFORE DELETE ON public.stock_movement_valuation_gaps FOR EACH ROW EXECUTE FUNCTION public.stock_movement_valuation_gap_immutable();' \
    -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: FAIL"* ]]
  grep -Eq '^passing_gap_triggers +\| 2$' <<<"$output"
  grep -Eq '^expected_gap_triggers +\| 3$' <<<"$output"
}

@test "postcheck: a session search_path without public still passes" {
  run docker run --rm -i --network host \
    -e PGPASSWORD="$DB_PASSWORD" \
    --mount "type=bind,source=$FIXTURE,target=/fixture.sql,readonly" \
    --mount "type=bind,source=$SCRIPT,target=/postcheck.sql,readonly" \
    postgres:18.3-alpine3.23 \
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d postgres \
    -v ON_ERROR_STOP=1 -x -f /fixture.sql \
    -c 'SET search_path = pg_catalog' -f /postcheck.sql

  [ "$status" -eq 0 ]
  [[ "$output" == *"stock-correction postcheck: PASS"* ]]
  [[ "$output" != *"stock-correction postcheck: FAIL"* ]]
}

@test "postcheck: shared #1414 definitions match the preflight" {
  preflight="$BATS_TEST_DIRNAME/../preflight-stock-constraints-1414.sql"
  preflight_pairs="$(perl -0777 -ne 'while (/\x27(FK_stock_occurrences_legacy_journal|CHK_stock_occurrence_reversal_reason_length|CHK_stock_batch_consumptions_quantity_positive|FK_purchase_cost_history_occurrence)\x27,\s*\x27[^\x27]*\x27,\s*\x27[fc]\x27,\s*\x27((?:[^\x27]|\x27\x27)*)\x27/sg) { print "$1|$2\n" }' "$preflight")"
  postcheck_pairs="$(perl -0777 -ne 'while (/\x27(FK_stock_occurrences_legacy_journal|CHK_stock_occurrence_reversal_reason_length|CHK_stock_batch_consumptions_quantity_positive|FK_purchase_cost_history_occurrence)\x27,\s*\x27[^\x27]*\x27,\s*\x27((?:[^\x27]|\x27\x27)*)\x27(?=\s*\))/sg) { print "$1|$2\n" }' "$SCRIPT")"

  preflight_count="$(wc -l <<<"$preflight_pairs")"
  postcheck_count="$(wc -l <<<"$postcheck_pairs")"
  preflight_unique="$(sort -u <<<"$preflight_pairs")"
  postcheck_unique="$(sort -u <<<"$postcheck_pairs")"
  if [ "$preflight_count" -ne 8 ] || [ "$postcheck_count" -ne 4 ] || [ "$(wc -l <<<"$preflight_unique")" -ne 4 ] || [ "$preflight_unique" != "$postcheck_unique" ]; then
    printf 'preflight pairs (%s):\n%s\npostcheck pairs (%s):\n%s\n' "$preflight_count" "$preflight_pairs" "$postcheck_count" "$postcheck_pairs"
    return 1
  fi
}
