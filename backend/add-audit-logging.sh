#!/bin/bash

# Script to add AuditLogService import to multiple service files

SERVICES=(
  "src/modules/sales/services/sales-order.service.ts"
  "src/modules/sales/services/invoice.service.ts"
  "src/modules/sales/services/payment.service.ts"
  "src/modules/purchasing/services/supplier.service.ts"
  "src/modules/purchasing/services/purchase-order.service.ts"
  "src/modules/purchasing/services/goods-received-note.service.ts"
  "src/modules/purchasing/services/vendor-payment.service.ts"
  "src/modules/inventory/services/category.service.ts"
  "src/modules/inventory/services/stock-adjustment.service.ts"
)

for SERVICE in "${SERVICES[@]}"; do
  echo "Processing $SERVICE..."

  # Check if file exists
  if [ ! -f "$SERVICE" ]; then
    echo "  File not found: $SERVICE"
    continue
  fi

  # Check if already has AuditLogService import
  if grep -q "AuditLogService" "$SERVICE"; then
    echo "  Already has AuditLogService import, skipping"
    continue
  fi

  # Add import statement after the last import line
  # Find the line number of the last import
  LAST_IMPORT_LINE=$(grep -n "^import" "$SERVICE" | tail -1 | cut -d: -f1)

  if [ -z "$LAST_IMPORT_LINE" ]; then
    echo "  No import statements found, skipping"
    continue
  fi

  # Insert the import statement
  sed -i "${LAST_IMPORT_LINE}a import { AuditLogService } from '../../audit-logs/services';" "$SERVICE"

  echo "  Added AuditLogService import"
done

echo "Done!"
