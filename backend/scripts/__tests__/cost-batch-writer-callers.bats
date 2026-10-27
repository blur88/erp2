#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-cost-batch-writer-callers.sh"
MESSAGE='New cost-batch writer call sites must follow CODING_STANDARDS.md "Inventory cost-batch lock order"; after review, add the (file, writer) pair to backend/scripts/verify-cost-batch-writer-callers.sh.'

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/backend/src/modules/sales/services" "$REPO/backend/src/modules/other"
}

@test "rejects each cost-batch writer called from an unreviewed file" {
  for writer in reduceStock restoreStock removeStock addStock; do
    printf '\nawait this.baseCostCalculator.%s(productId, 1, manager);\n' "$writer" > "$REPO/backend/src/modules/other/new.service.ts"

    run "$CHECK" "$REPO"

    [ "$status" -eq 1 ]
    [ "$output" = "backend/src/modules/other/new.service.ts:2: unreviewed cost-batch writer call: $writer
$MESSAGE" ]
  done
}

@test "rejects a reviewed file calling a writer it is not listed for" {
  printf 'await this.baseCostCalculator.restoreStock(id, 1, manager);\nawait this.baseCostCalculator.removeStock(id, poId, manager);\n' \
    > "$REPO/backend/src/modules/sales/services/sales-order-fulfillment.service.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "backend/src/modules/sales/services/sales-order-fulfillment.service.ts:2: unreviewed cost-batch writer call: removeStock
$MESSAGE" ]
}

@test "finds a call split across lines" {
  printf 'await this.baseCostCalculator\n  .reduceStock (\n  productId, 1, manager);\n' > "$REPO/backend/src/modules/other/new.service.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "backend/src/modules/other/new.service.ts:2: unreviewed cost-batch writer call: reduceStock
$MESSAGE" ]
}

@test "ignores unit specs and writer definitions" {
  printf 'calc.reduceStock(id, 1, manager);\n' > "$REPO/backend/src/modules/other/new.service.spec.ts"
  printf 'async reduceStock(productId: string) {}\n' > "$REPO/backend/src/modules/other/calculator.service.ts"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the checked-out repository has only reviewed cost-batch writer callers" {
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
