-- #1409 (#1398 project 2): read-only inspection of existing data.
--
-- Reports what projects 3-9 and project 4's valuation design need to know
-- about existing rows. It corrects nothing: every statement is a SELECT inside
-- BEGIN READ ONLY ... ROLLBACK. Exit 0 means the report was generated, not
-- that the data is acceptable. Every finding needs a recorded disposition.
--
-- Run (development, the only environment as of 2026-10-20):
--   docker compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/inspect-1398-p2.sql
--
-- Label every recorded run with the database, NODE_ENV, the migration state
-- (section 'environment') and the application version that was running.
-- Sections that list offending rows may be empty. The last section states
-- which checks need the 3.25.0 migrations and whether those are applied.

BEGIN READ ONLY;

-- 1. Where this ran.
SELECT 'environment' AS section,
       current_database() AS database,
       (SELECT count(*) FROM migrations) AS migrations_applied,
       (SELECT name FROM migrations ORDER BY id DESC LIMIT 1) AS latest_migration,
       now() AS inspected_at;

-- 2. Soft-deleted and inactive rows in every table that has those columns.
SELECT 'soft_deleted_or_inactive' AS section,
       t.table_name,
       CASE WHEN t.table_name IN ('audit_logs', 'auth_sessions', 'refresh_tokens',
                                  'backup_logs', 'backup_retention_settings', 'backup_schedules')
            THEN 'operational' ELSE 'business' END AS kind,
       (xpath('/row/n/text()', query_to_xml(
          format('SELECT count(*) AS n FROM public.%I', t.table_name), false, true, '')))[1]::text::bigint AS total_rows,
       (xpath('/row/n/text()', query_to_xml(
          format('SELECT count(*) AS n FROM public.%I WHERE "deletedAt" IS NOT NULL', t.table_name), false, true, '')))[1]::text::bigint AS soft_deleted,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                          WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'isActive')
            THEN (xpath('/row/n/text()', query_to_xml(
                   format('SELECT count(*) AS n FROM public.%I WHERE "isActive" = false', t.table_name), false, true, '')))[1]::text::bigint
       END AS inactive
FROM information_schema.columns t
WHERE t.table_schema = 'public' AND t.column_name = 'deletedAt'
ORDER BY kind, t.table_name;

-- 3. Vendor payments by status (#1401 voids rather than deletes).
SELECT 'vendor_payment_status' AS section, s.status, s.payments, s.with_voided_at, s.soft_deleted
FROM (
  SELECT COALESCE(status, '(null)') AS status, count(*) AS payments,
         count(*) FILTER (WHERE "voidedAt" IS NOT NULL) AS with_voided_at,
         count(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS soft_deleted, 0 AS ord
  FROM vendor_payments GROUP BY status
  UNION ALL
  SELECT '(total)', count(*), count(*) FILTER (WHERE "voidedAt" IS NOT NULL),
         count(*) FILTER (WHERE "deletedAt" IS NOT NULL), 1
  FROM vendor_payments
) s
ORDER BY s.ord, s.status;

-- 4. The costing method: current setting and its change history.
SELECT 'costing_method' AS section, h.record, h.costing_method, h.previous_value, h.changed_at, h.changed_by
FROM (
  SELECT 'current' AS record, r."costingMethod" AS costing_method, NULL::text AS previous_value,
         r."updatedAt" AS changed_at, NULL::text AS changed_by, 0 AS ord
  FROM regional_settings r WHERE r."isActive" AND r."deletedAt" IS NULL
  UNION ALL
  SELECT 'active_settings_rows', (SELECT count(*)::text FROM regional_settings WHERE "isActive" AND "deletedAt" IS NULL),
         NULL, NULL, NULL, 1
  UNION ALL
  SELECT 'change', a."newValues" ->> 'costingMethod', a."oldValues" ->> 'costingMethod',
         a."createdAt", a.username, 2
  FROM audit_logs a WHERE a."newValues" ? 'costingMethod'
) h
ORDER BY h.ord, h.changed_at;

-- 5. Per product: stock against unreversed cost batches.
SELECT 'stock_vs_batches' AS section, p.id AS product_id, p.name AS product_name, p.type::text AS product_type,
       p."deletedAt" IS NOT NULL AS product_soft_deleted,
       p."stockQuantity" AS stock_quantity,
       COALESCE(b.batch_remaining, 0) AS batch_remaining,
       COALESCE(b.batch_value, 0) AS batch_value,
       COALESCE(b.batch_count, 0) AS batch_count,
       p."stockQuantity" - COALESCE(b.batch_remaining, 0) AS stock_minus_batches,
       CASE WHEN p."stockQuantity" > 0 AND COALESCE(b.batch_count, 0) = 0 THEN 'stock_without_batches'
            WHEN p."stockQuantity" > COALESCE(b.batch_remaining, 0) THEN 'stock_exceeds_batches'
            WHEN p."stockQuantity" < COALESCE(b.batch_remaining, 0) THEN 'batches_exceed_stock'
            ELSE 'matches' END AS finding
FROM products p
LEFT JOIN (
  SELECT "productId", count(*) AS batch_count,
         sum("remainingQuantity") AS batch_remaining,
         sum("remainingQuantity" * "landedCost") AS batch_value
  FROM purchase_cost_history
  WHERE "reversedAt" IS NULL AND "deletedAt" IS NULL
  GROUP BY "productId"
) b ON b."productId" = p.id
WHERE p."stockQuantity" <> 0 OR b."productId" IS NOT NULL
ORDER BY finding, p.name, p.id;

-- 6. Batches with no cost.
SELECT 'zero_or_null_cost_batches' AS section, h.id AS batch_id, h."productId" AS product_id,
       h."purchaseOrderId" AS purchase_order_id, h."unitCost" AS unit_cost, h."landedCost" AS landed_cost,
       h."receivedQuantity" AS received_quantity, h."remainingQuantity" AS remaining_quantity
FROM purchase_cost_history h
WHERE h."landedCost" IS NULL OR h."landedCost" = 0
ORDER BY h."productId", h.id;

-- 7. The inventory control account against the batches' value.
SELECT 'inventory_ledger_vs_batches' AS section,
       s."inventoryAccountId" AS inventory_account_id,
       a.code AS account_code, a.name AS account_name,
       a."openingBalance" AS account_opening_balance_field,
       (SELECT COALESCE(sum(l.debit::numeric - l.credit::numeric), 0)
          FROM journal_entry_line l JOIN journal_entry e ON e.id = l."entryId"
         WHERE l."accountId" = s."inventoryAccountId" AND e."deletedAt" IS NULL AND l."deletedAt" IS NULL) AS ledger_balance,
       (SELECT COALESCE(sum("remainingQuantity" * "landedCost"), 0)
          FROM purchase_cost_history WHERE "reversedAt" IS NULL AND "deletedAt" IS NULL) AS batch_value,
       (SELECT COALESCE(sum(l.debit::numeric - l.credit::numeric), 0)
          FROM journal_entry_line l JOIN journal_entry e ON e.id = l."entryId"
         WHERE l."accountId" = s."inventoryAccountId" AND e."deletedAt" IS NULL AND l."deletedAt" IS NULL)
       - (SELECT COALESCE(sum("remainingQuantity" * "landedCost"), 0)
            FROM purchase_cost_history WHERE "reversedAt" IS NULL AND "deletedAt" IS NULL) AS ledger_minus_batches,
       (SELECT count(DISTINCT e.id) FROM journal_entry e JOIN journal_entry_line l ON l."entryId" = e.id
         WHERE l."accountId" = s."inventoryAccountId" AND e."postingType"::text = 'OPENING_BALANCE') AS opening_balance_entries
FROM accounting_settings s
LEFT JOIN chart_of_account a ON a.id = s."inventoryAccountId";

-- 8. Documents whose undo projects 3-4 change.
SELECT 'undo_exposure' AS section,
       (SELECT count(*) FROM sales_orders WHERE status::text = 'FULFILLED' AND "deletedAt" IS NULL) AS fulfilled_sales_orders,
       (SELECT count(*) FROM purchase_orders WHERE status::text = 'RECEIVED' AND "deletedAt" IS NULL) AS received_purchase_orders,
       (SELECT count(*) FROM stock_adjustments WHERE status::text = 'completed' AND "deletedAt" IS NULL) AS completed_stock_adjustments,
       (SELECT count(*) FROM stock_adjustments WHERE status::text = 'reverted' AND "deletedAt" IS NULL) AS reverted_stock_adjustments,
       (SELECT count(*) FROM owner_equity_documents
         WHERE type::text = 'STOCK_DRAWING' AND "documentStatus"::text = 'COMPLETED' AND "deletedAt" IS NULL) AS completed_stock_drawings,
       (SELECT count(*) FROM stock_movements WHERE "movementType"::text = 'owner_drawing_reversal') AS stock_drawing_reversal_movements;

-- 9. Movements not written by their document workflow.
SELECT 'movements_outside_workflows' AS section, m."movementType"::text AS movement_type,
       COALESCE(m."referenceType", '(null)') AS reference_type, count(*) AS movements,
       min(m."createdAt") AS first_at, max(m."createdAt") AS last_at
FROM stock_movements m
WHERE (m."movementType"::text, COALESCE(m."referenceType", '(null)')) NOT IN (
  ('purchase_receipt', 'purchase_order'), ('purchase_receipt_reversal', 'purchase_order'),
  ('sale', 'sales_order'), ('sale_reversal', 'sales_order'),
  ('adjustment_increase', 'stock_adjustment'), ('adjustment_decrease', 'stock_adjustment'),
  ('owner_drawing', 'owner_equity'), ('owner_drawing_reversal', 'owner_equity'),
  ('initial_stock', 'initial_stock'))
GROUP BY 1, 2, 3
ORDER BY 2, 3;

-- 10. Broken balance chains: clamped or rewritten history. createdAt is the
-- transaction start time, so rows written in one transaction tie and their
-- order is unknown. A link is checked only when neither row is part of a tie;
-- otherwise a mismatch is 'same_timestamp_order_unknown', not a break.
SELECT 'balance_chain_breaks' AS section, c.product_id, c.movement_id, c.movement_type, c.created_at,
       c.previous_balance, c.prior_new_balance, c.quantity, c.new_balance, c.break_kind
FROM (
  SELECT r.*,
         CASE
           WHEN r.new_balance <> r.previous_balance + r.quantity THEN 'row_does_not_add_up'
           WHEN r.prior_new_balance IS NOT NULL AND r.prior_new_balance <> r.previous_balance
                AND (r.tie_size > 1 OR r.prior_tie_size > 1) THEN 'same_timestamp_order_unknown'
           WHEN r.prior_new_balance IS NOT NULL AND r.prior_new_balance <> r.previous_balance
             THEN 'link_to_prior_row_broken'
         END AS break_kind
  FROM (
    SELECT t.*,
           lag(t.new_balance) OVER w AS prior_new_balance,
           lag(t.tie_size) OVER w AS prior_tie_size
    FROM (
      SELECT m."productId" AS product_id, m.id AS movement_id, m."movementType"::text AS movement_type,
             m."createdAt" AS created_at, m."previousBalance" AS previous_balance,
             m.quantity, m."newBalance" AS new_balance,
             count(*) OVER (PARTITION BY m."productId", m."createdAt") AS tie_size
      FROM stock_movements m
    ) t
    WINDOW w AS (PARTITION BY t.product_id ORDER BY t.created_at, t.movement_id)
  ) r
) c
WHERE c.break_kind IS NOT NULL
ORDER BY c.product_id, c.created_at, c.movement_id;

-- 11. Products whose state conflicts with retirement and stock rules.
SELECT 'product_anomalies' AS section, p.id AS product_id, p.name AS product_name, p.type::text AS product_type,
       p."deletedAt" AS deleted_at, p."isActive" AS is_active, p."stockQuantity" AS stock_quantity,
       (SELECT count(*) FROM purchase_cost_history h WHERE h."productId" = p.id) AS batches,
       (SELECT COALESCE(sum(h."remainingQuantity" * h."landedCost"), 0) FROM purchase_cost_history h
         WHERE h."productId" = p.id AND h."reversedAt" IS NULL AND h."deletedAt" IS NULL) AS batch_value,
       CASE WHEN p."deletedAt" IS NOT NULL THEN 'soft_deleted_with_stock_or_batches'
            ELSE 'not_stocked_with_stock_or_value' END AS finding
FROM products p
WHERE (p."deletedAt" IS NOT NULL
       AND (p."stockQuantity" <> 0 OR EXISTS (SELECT 1 FROM purchase_cost_history h WHERE h."productId" = p.id)))
   OR (p.type::text <> 'Stocked Product'
       AND (p."stockQuantity" <> 0 OR EXISTS (SELECT 1 FROM purchase_cost_history h
                                               WHERE h."productId" = p.id AND h."remainingQuantity" <> 0)))
ORDER BY finding, p.name;

-- 12. Who can prepare and approve reconciliations and corrections.
SELECT 'approver_pairing' AS section,
       count(*) FILTER (WHERE active AND role = 'admin') AS active_admins,
       count(*) FILTER (WHERE active AND role = 'manager') AS active_managers,
       count(*) FILTER (WHERE active AND role = 'inventory_staff') AS active_inventory_staff,
       count(*) FILTER (WHERE active AND role = 'sales_staff') AS active_sales_staff,
       count(*) FILTER (WHERE active AND role = 'procurement_staff') AS active_procurement_staff,
       count(*) FILTER (WHERE NOT active) AS inactive_users,
       count(*) FILTER (WHERE active AND role = 'admin') >= 1 AS has_active_admin,
       (count(*) FILTER (WHERE active AND role IN ('manager', 'inventory_staff')) >= 1
        OR count(*) FILTER (WHERE active AND role = 'admin') >= 2) AS has_distinct_preparer
FROM (
  SELECT u.role::text AS role,
         (u.status::text = 'active' AND u."isActive" AND u."deletedAt" IS NULL) AS active
  FROM users u
) x;

-- 13. Drafts and configuration that projects 5-7 will change. Item counts
-- follow their parent's filter; soft-deleted drafts are counted separately.
SELECT 'drafts_and_config' AS section,
       (SELECT count(*) FROM stock_adjustments WHERE status::text = 'draft' AND "deletedAt" IS NULL) AS draft_stock_adjustments,
       (SELECT count(*) FROM stock_adjustment_items i JOIN stock_adjustments a ON a.id = i."stockAdjustmentId"
         WHERE a.status::text = 'draft' AND a."deletedAt" IS NULL) AS draft_stock_adjustment_items,
       (SELECT count(*) FROM stock_adjustments WHERE status::text = 'draft' AND "deletedAt" IS NOT NULL) AS soft_deleted_draft_stock_adjustments,
       (SELECT count(*) FROM provider_settlements WHERE status::text = 'DRAFT' AND "deletedAt" IS NULL) AS draft_provider_settlements,
       (SELECT count(*) FROM provider_settlement_lines l JOIN provider_settlements s ON s.id = l."settlementId"
         WHERE s.status::text = 'DRAFT' AND s."deletedAt" IS NULL) AS draft_provider_settlement_lines,
       (SELECT count(*) FROM bank_statement_reconciliations WHERE status::text = 'DRAFT' AND "deletedAt" IS NULL) AS draft_bank_reconciliations,
       (SELECT count(*) FROM sales_orders WHERE status::text IN ('DRAFT', 'READY') AND "deletedAt" IS NULL) AS editable_sales_orders,
       (SELECT count(*) FROM sales_order_items i JOIN sales_orders o ON o.id = i."salesOrderId"
         WHERE o.status::text IN ('DRAFT', 'READY') AND o."deletedAt" IS NULL) AS editable_sales_order_items,
       (SELECT count(*) FROM purchase_orders WHERE status::text IN ('DRAFT', 'READY') AND "deletedAt" IS NULL) AS editable_purchase_orders,
       (SELECT count(*) FROM purchase_order_items i JOIN purchase_orders o ON o.id = i."purchaseOrderId"
         WHERE o.status::text IN ('DRAFT', 'READY') AND o."deletedAt" IS NULL) AS editable_purchase_order_items,
       (SELECT count(*) FROM payment_method_account_mappings) AS account_mappings,
       (SELECT count(*) FROM payment_method_account_mappings WHERE "deletedAt" IS NOT NULL) AS account_mappings_soft_deleted,
       (SELECT count(*) FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id = m."paymentMethodId"
         WHERE pm."deletedAt" IS NOT NULL) AS mappings_of_soft_deleted_payment_methods,
       (SELECT count(*) FROM balance_sheet_account_groups) AS balance_sheet_groups;

-- 14. Checks that need the 3.25.0 migrations, and whether those are applied.
SELECT 'deferred_until_3_25_0' AS section, d.check_name, d.needs, d.state
FROM (
  SELECT 1 AS ord, 'receipt_line_identity' AS check_name,
         'purchase_cost_history.purchaseOrderItemId (AddReceiptLineIdentity1792369500000)' AS needs,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'purchase_cost_history'
                              AND column_name = 'purchaseOrderItemId')
              THEN 'applied: rerun the #1406 preflight and postcheck' ELSE 'not migrated yet' END AS state
  UNION ALL
  SELECT 2, 'valuation_gap_exposure',
         'stock_movement_valuation_gaps (AddStockMovementValuationGaps1792455000000)',
         CASE WHEN to_regclass('public.stock_movement_valuation_gaps') IS NOT NULL
              THEN 'applied: rerun the #1406 preflight and postcheck' ELSE 'not migrated yet' END
) d
ORDER BY d.ord;

ROLLBACK;
