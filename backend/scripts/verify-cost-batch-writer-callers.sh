#!/usr/bin/env bash
# Cost-batch writer call-site guard (CODING_STANDARDS.md: Inventory cost-batch
# lock order). Every call to reduceStock, restoreStock, removeStock or addStock
# in backend/src must sit at a reviewed (file, writer) pair listed below. A new
# location fails until someone adds it here, which puts it in front of review.
#
# This detects unreviewed caller locations only. It does not prove that a
# listed caller holds its product locks, or takes them in the canonical order;
# the e2e regressions and review cover that. It also does not see direct
# PurchaseCostHistory repository writes, or a writer reached through an alias.

set -euo pipefail

REPO_DIR="${1:-$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(CDPATH= cd -- "$REPO_DIR" && pwd)"
SRC_DIR="$REPO_DIR/backend/src"

if [ ! -d "$SRC_DIR" ]; then
  printf 'Backend application source directory not found: %s\n' "$SRC_DIR" >&2
  exit 2
fi

# Reviewed (file, writer) pairs.
REVIEWED='
backend/src/modules/sales/services/inventory-integration.service.ts reduceStock
backend/src/modules/sales/services/sales-order-fulfillment.service.ts restoreStock
backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts addStock
backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts removeStock
backend/src/modules/inventory/services/product.service.ts addStock
'

found=0

while IFS= read -r -d '' file; do
  relative_file="${file#"$REPO_DIR/"}"
  while IFS=' ' read -r line writer; do
    [ -n "$writer" ] || continue
    if ! grep -qxF "$relative_file $writer" <<<"$REVIEWED"; then
      printf '%s:%s: unreviewed cost-batch writer call: %s\n' "$relative_file" "$line" "$writer" >&2
      found=1
    fi
  done < <(perl -0777 -ne '
    while (/\.\s*(reduceStock|restoreStock|removeStock|addStock)\s*\(/g) {
      print 1 + (substr($_, 0, $-[0]) =~ tr/\n//), " $1\n";
    }
  ' "$file")
done < <(find "$SRC_DIR" -type f -name '*.ts' ! -name '*.spec.ts' -print0)

if [ "$found" -ne 0 ]; then
  printf 'New cost-batch writer call sites must follow CODING_STANDARDS.md "Inventory cost-batch lock order"; after review, add the (file, writer) pair to backend/scripts/verify-cost-batch-writer-callers.sh.\n' >&2
  exit 1
fi
