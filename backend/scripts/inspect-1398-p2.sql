-- Read-only inspection report for #1409, project 2 of #1398.
-- Run with psql -X -q --csv -v ON_ERROR_STOP=1 and these operator values:
--   -v app_version=<backend package version>
--   -v image_id=<running backend container image id>
--   -v env_label=<environment label>
--   -v script_sha=<script commit SHA>
-- Get app_version with: docker compose exec backend node -p "require('./package.json').version"
-- Get image_id with: docker inspect --format '{{.Image}}' $(docker compose ps -q backend)
-- Exit 0 means the report was generated; inspect its findings before interpreting it.
-- Result sets: s01_environment, s02_soft_deleted_inactive, s03_vendor_payments,
-- s04_costing_method, s05_product_batches, s05_product_batches_detail,
-- s05_zero_cost_batches_detail, s06_inventory_ledger, s07_undo_counts,
-- s08_outside_workflows, s08_outside_workflows_detail, s09_balance_chains,
-- s09_balance_chains_detail, s10_product_anomalies, s10_product_anomalies_detail,
-- s11_users, s12_affected_records, d1_receipt_line_identity,
-- d1_receipt_line_identity_detail, d2_valuation_gaps, d2_valuation_gaps_detail.

\if :{?app_version}
\else
\warn 'missing run metadata: app_version'
SELECT 1 / 0;
\endif
\if :{?image_id}
\else
\warn 'missing run metadata: image_id'
SELECT 1 / 0;
\endif
\if :{?env_label}
\else
\warn 'missing run metadata: env_label'
SELECT 1 / 0;
\endif
\if :{?script_sha}
\else
\warn 'missing run metadata: script_sha'
SELECT 1 / 0;
\endif

BEGIN READ ONLY;

\echo '@@inspect-section s01_environment'
SELECT section, metric, value, note
FROM (VALUES
  ('s01_environment'::text, 'database'::text, current_database()::text, ''::text, 1),
  ('s01_environment', 'migrations_applied', (SELECT count(*)::text FROM migrations), '', 2),
  ('s01_environment', 'latest_migration', COALESCE((SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1), 'n/a'), '', 3),
  ('s01_environment', 'server_version', current_setting('server_version'), '', 4),
  ('s01_environment', 'run_at', clock_timestamp()::text, '', 5),
  ('s01_environment', 'app_version', :'app_version'::text, 'operator-supplied', 6),
  ('s01_environment', 'image_id', :'image_id'::text, 'operator-supplied', 7),
  ('s01_environment', 'env_label', :'env_label'::text, 'operator-supplied', 8),
  ('s01_environment', 'script_sha', :'script_sha'::text, 'operator-supplied', 9)
) AS report(section, metric, value, note, position)
ORDER BY position;

\echo '@@inspect-section s02_soft_deleted_inactive'
WITH classifications(table_name, classification) AS (
  VALUES
    ('audit_logs', 'operational'),
    ('auth_sessions', 'operational'),
    ('backup_logs', 'operational'),
    ('backup_retention_settings', 'operational'),
    ('backup_schedules', 'operational'),
    ('refresh_tokens', 'operational'),
    ('bank_statement_reconciliation_lines', 'business'),
    ('bank_statement_reconciliation_setup_marks', 'business'),
    ('bank_statement_reconciliations', 'business'),
    ('categories', 'business'),
    ('chart_of_account', 'business'),
    ('company_settings', 'business'),
    ('customers', 'business'),
    ('document_number_settings', 'business'),
    ('expense_payments', 'business'),
    ('expenses', 'business'),
    ('journal_entry', 'business'),
    ('journal_entry_line', 'business'),
    ('owner_equity_documents', 'business'),
    ('owner_equity_settlements', 'business'),
    ('payment_method_account_mappings', 'business'),
    ('payment_methods', 'business'),
    ('payments', 'business'),
    ('price_list_items', 'business'),
    ('price_lists', 'business'),
    ('print_settings', 'business'),
    ('products', 'business'),
    ('provider_settlement_lines', 'business'),
    ('provider_settlements', 'business'),
    ('purchase_cost_history', 'business'),
    ('purchase_order_items', 'business'),
    ('purchase_orders', 'business'),
    ('regional_settings', 'business'),
    ('sales_order_items', 'business'),
    ('sales_orders', 'business'),
    ('stock_adjustment_items', 'business'),
    ('stock_adjustments', 'business'),
    ('stock_movements', 'business'),
    ('suppliers', 'business'),
    ('users', 'business'),
    ('vendor_payments', 'business')
), discovered AS (
  SELECT c.table_name,
         bool_or(c.column_name = 'deletedAt') AS has_deleted_at,
         bool_or(c.column_name = 'isActive') AS has_is_active,
         COALESCE(cl.classification, 'unknown — needs classification') AS classification
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    LEFT JOIN classifications cl ON cl.table_name = c.table_name
   WHERE c.table_schema = current_schema()
     AND t.table_type = 'BASE TABLE'
     AND c.column_name IN ('deletedAt', 'isActive')
   GROUP BY c.table_name, cl.classification
), metric_defs(metric_name, metric_order) AS (
  VALUES ('total', 1), ('soft_deleted', 2), ('inactive', 3), ('soft_deleted_and_inactive', 4)
), per_table AS (
  SELECT d.table_name,
         m.metric_order,
         format(
           'SELECT %L::text AS section, %L::text AS metric, (%s)::text AS value, %L::text AS note',
           's02_soft_deleted_inactive',
           d.table_name || '.' || m.metric_name,
           CASE
             WHEN m.metric_name = 'total' THEN
               format('(SELECT count(*) FROM %s)', format('%I.%I', current_schema(), d.table_name))
             WHEN m.metric_name = 'soft_deleted' AND d.has_deleted_at THEN
               format('(SELECT count(*) FILTER (WHERE "deletedAt" IS NOT NULL) FROM %s)', format('%I.%I', current_schema(), d.table_name))
             WHEN m.metric_name = 'inactive' AND d.has_is_active THEN
               format('(SELECT count(*) FILTER (WHERE "isActive" = false) FROM %s)', format('%I.%I', current_schema(), d.table_name))
             WHEN m.metric_name = 'soft_deleted_and_inactive' AND d.has_deleted_at AND d.has_is_active THEN
               format('(SELECT count(*) FILTER (WHERE "deletedAt" IS NOT NULL AND "isActive" = false) FROM %s)', format('%I.%I', current_schema(), d.table_name))
             ELSE quote_literal('n/a')
           END,
           CASE
             WHEN m.metric_name = 'soft_deleted' AND NOT d.has_deleted_at THEN 'column absent'
             WHEN m.metric_name = 'inactive' AND NOT d.has_is_active THEN 'column absent'
             WHEN m.metric_name = 'soft_deleted_and_inactive' AND NOT (d.has_deleted_at AND d.has_is_active) THEN 'column absent'
             ELSE d.classification
           END
         ) AS query_text
    FROM discovered d CROSS JOIN metric_defs m
), all_queries AS (
  SELECT table_name, metric_order, query_text FROM per_table
  UNION ALL
  SELECT NULL, 1,
         format('SELECT %L::text AS section, %L::text AS metric, %L::text AS value, %L::text AS note',
           's02_soft_deleted_inactive', 'tables_discovered', count(*)::text, '')
    FROM discovered
  UNION ALL
  SELECT NULL, 2,
         format('SELECT %L::text AS section, %L::text AS metric, %L::text AS value, %L::text AS note',
           's02_soft_deleted_inactive', 'tables_unclassified', count(*) FILTER (WHERE classification = 'unknown — needs classification')::text, '')
    FROM discovered
)
SELECT string_agg(query_text, E'\nUNION ALL\n' ORDER BY table_name NULLS LAST, metric_order)
  FROM all_queries
\gexec


\echo '@@inspect-section s03_vendor_payments'
WITH status_counts AS (
  SELECT status::text AS status, count(*)::text AS count
    FROM vendor_payments
   GROUP BY status::text
), metrics AS (
  SELECT 'status.' || status AS metric, count AS value, ''::text AS note FROM status_counts
  UNION ALL
  SELECT 'status.completed', '0', '' WHERE NOT EXISTS (SELECT 1 FROM status_counts WHERE status = 'completed')
  UNION ALL
  SELECT 'status.voided', '0', '' WHERE NOT EXISTS (SELECT 1 FROM status_counts WHERE status = 'voided')
  UNION ALL
  SELECT 'soft_deleted', count(*) FILTER (WHERE "deletedAt" IS NOT NULL)::text, '' FROM vendor_payments
  UNION ALL
  SELECT 'total', count(*)::text, '' FROM vendor_payments
)
SELECT 's03_vendor_payments'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s04_costing_method'
WITH active_settings AS (
  SELECT "costingMethod", "createdAt", id,
         row_number() OVER (ORDER BY "createdAt", id) AS row_no
    FROM regional_settings
   WHERE "deletedAt" IS NULL AND "isActive" = true
), metrics AS (
  SELECT 'settings_rows'::text AS metric, count(*)::text AS value, ''::text AS note
    FROM regional_settings
  UNION ALL
  SELECT 'active_settings_rows', count(*)::text, '' FROM active_settings
  UNION ALL
  SELECT 'costing_method.' || row_no::text, "costingMethod"::text, '' FROM active_settings
  UNION ALL
  SELECT 'audit_rows_mentioning_costing_method', count(*)::text, ''
    FROM audit_logs
   WHERE "deletedAt" IS NULL
     AND ("oldValues" ? 'costingMethod' OR "newValues" ? 'costingMethod')
  UNION ALL
  SELECT 'costing_change_history', 'unavailable',
         'unavailable audit evidence: regional settings updates write no audit log'
)
SELECT 's04_costing_method'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s05_product_batches'
WITH live_batches AS (
  SELECT "productId",
         count(*) AS batch_count,
         COALESCE(sum("remainingQuantity"), 0) AS batch_quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4) AS batch_value,
         count(*) FILTER (WHERE "landedCost" IS NULL AND "remainingQuantity" > 0) AS unknown_cost_count,
         count(*) FILTER (WHERE "remainingQuantity" IS NULL) AS unknown_quantity_count,
         COALESCE(sum("remainingQuantity") FILTER (
           WHERE "landedCost" IS NULL AND "remainingQuantity" > 0), 0) AS unknown_cost_quantity
    FROM purchase_cost_history
   WHERE "deletedAt" IS NULL
   GROUP BY "productId"
), product_totals AS (
  SELECT p.id AS product_id, p.name AS product_name,
         COALESCE(p."stockQuantity", 0) AS stock_quantity,
         COALESCE(b.batch_count, 0) AS batch_count,
         COALESCE(b.batch_quantity, 0) AS batch_quantity,
         COALESCE(b.batch_value, 0)::numeric(24,4) AS batch_value,
         COALESCE(b.unknown_cost_count, 0) AS unknown_cost_count,
         COALESCE(b.unknown_quantity_count, 0) AS unknown_quantity_count,
         COALESCE(b.unknown_cost_quantity, 0) AS unknown_cost_quantity,
         (p."deletedAt" IS NOT NULL) AS is_soft_deleted,
         CASE
           WHEN COALESCE(p."stockQuantity", 0) <> 0 AND COALESCE(b.batch_count, 0) = 0 THEN 'stock_without_batches'
           WHEN COALESCE(p."stockQuantity", 0) > COALESCE(b.batch_quantity, 0) AND COALESCE(b.batch_count, 0) > 0 THEN 'stock_exceeds_batches'
           WHEN COALESCE(b.batch_quantity, 0) > COALESCE(p."stockQuantity", 0) THEN 'batches_exceed_stock'
           ELSE 'none'
         END AS flag
    FROM products p
    LEFT JOIN live_batches b ON b."productId" = p.id
   WHERE COALESCE(p."stockQuantity", 0) <> 0 OR COALESCE(b.batch_count, 0) > 0
), totals AS (
  SELECT count(*) FILTER (WHERE flag = 'stock_exceeds_batches')::text AS stock_exceeds_batches,
         count(*) FILTER (WHERE flag = 'batches_exceed_stock')::text AS batches_exceed_stock,
         count(*) FILTER (WHERE flag = 'stock_without_batches')::text AS stock_without_batches,
         count(*) FILTER (WHERE is_soft_deleted)::text AS soft_deleted_products_flagged
    FROM product_totals
), batch_totals AS (
  SELECT count(*) FILTER (WHERE "unitCost" = 0 OR "landedCost" = 0)::text AS zero_cost_batches,
         count(*) FILTER (WHERE "landedCost" IS NULL AND "remainingQuantity" > 0)::text AS unknown_cost_batches,
         COALESCE(sum("remainingQuantity") FILTER (
           WHERE "landedCost" IS NULL AND "remainingQuantity" > 0), 0)::numeric(15,4)::text AS unknown_cost_quantity,
         COALESCE(sum("remainingQuantity"), 0)::numeric(18,4)::text AS total_batch_quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4)::text AS total_batch_value,
         count(*) FILTER (WHERE "landedCost" IS NULL AND "remainingQuantity" > 0) AS unknown_count,
         COALESCE(sum("remainingQuantity") FILTER (
           WHERE "landedCost" IS NULL AND "remainingQuantity" > 0), 0)::numeric(15,4)::text AS unknown_quantity,
         count(*) FILTER (WHERE "remainingQuantity" IS NULL) AS unknown_quantity_count
    FROM purchase_cost_history
   WHERE "deletedAt" IS NULL
), deleted_batches AS (
  SELECT count(*)::text AS count,
         COALESCE(sum("remainingQuantity"), 0)::numeric(18,4)::text AS quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4)::text AS value
    FROM purchase_cost_history
   WHERE "deletedAt" IS NOT NULL
), metrics(metric, value, note) AS (
  SELECT 'products_with_stock_or_batches', count(*)::text, '' FROM product_totals
  UNION ALL SELECT 'stock_exceeds_batches', stock_exceeds_batches, '' FROM totals
  UNION ALL SELECT 'batches_exceed_stock', batches_exceed_stock, '' FROM totals
  UNION ALL SELECT 'stock_without_batches', stock_without_batches, '' FROM totals
  UNION ALL SELECT 'soft_deleted_products_flagged', soft_deleted_products_flagged, '' FROM totals
  UNION ALL SELECT 'zero_cost_batches', zero_cost_batches, '' FROM batch_totals
  UNION ALL SELECT 'unknown_cost_batches', unknown_cost_batches, '' FROM batch_totals
  UNION ALL SELECT 'unknown_cost_quantity', unknown_cost_quantity, '' FROM batch_totals
  UNION ALL SELECT 'total_batch_quantity', total_batch_quantity, '' FROM batch_totals
  UNION ALL SELECT 'total_batch_value', total_batch_value,
    CASE
      WHEN unknown_count > 0 AND unknown_quantity_count > 0 THEN format('incomplete: excludes %s batches (%s units) with unknown cost; excludes %s batches with unknown quantity', unknown_count, unknown_quantity, unknown_quantity_count)
      WHEN unknown_count > 0 THEN format('incomplete: excludes %s batches (%s units) with unknown cost', unknown_count, unknown_quantity)
      WHEN unknown_quantity_count > 0 THEN format('incomplete: excludes %s batches with unknown quantity', unknown_quantity_count)
      ELSE ''
    END FROM batch_totals
  UNION ALL SELECT 'total_batch_value_complete', CASE WHEN unknown_count > 0 OR unknown_quantity_count > 0 THEN 'false' ELSE 'true' END, '' FROM batch_totals
  UNION ALL SELECT 'soft_deleted_batches', count, '' FROM deleted_batches
  UNION ALL SELECT 'soft_deleted_batches.quantity', quantity, '' FROM deleted_batches
  UNION ALL SELECT 'soft_deleted_batches.value', value, '' FROM deleted_batches
)
SELECT 's05_product_batches'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s05_product_batches_detail'
WITH live_batches AS (
  SELECT "productId", count(*) AS batch_count,
         COALESCE(sum("remainingQuantity"), 0)::numeric(18,4) AS batch_quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4) AS batch_value,
         count(*) FILTER (WHERE "landedCost" IS NULL AND "remainingQuantity" > 0) AS unknown_cost_count,
         count(*) FILTER (WHERE "remainingQuantity" IS NULL) AS unknown_quantity_count
    FROM purchase_cost_history WHERE "deletedAt" IS NULL GROUP BY "productId"
)
SELECT 's05_product_batches_detail'::text AS section,
       p.id::text AS product_id, p.name AS product_name, p."stockQuantity"::text AS stock_quantity,
       COALESCE(b.batch_quantity, 0)::numeric(18,4)::text AS batch_quantity,
       COALESCE(b.batch_value, 0)::numeric(24,4)::text AS batch_value,
       (p."deletedAt" IS NOT NULL)::text AS is_soft_deleted,
       CASE WHEN COALESCE(b.unknown_cost_count, 0) > 0 OR COALESCE(b.unknown_quantity_count, 0) > 0 THEN 'false' ELSE 'true' END AS batch_value_complete,
       CASE
         WHEN p."stockQuantity" <> 0 AND COALESCE(b.batch_count, 0) = 0 THEN 'stock_without_batches'
         WHEN p."stockQuantity" > COALESCE(b.batch_quantity, 0) AND COALESCE(b.batch_count, 0) > 0 THEN 'stock_exceeds_batches'
         WHEN COALESCE(b.batch_quantity, 0) > p."stockQuantity" THEN 'batches_exceed_stock'
         ELSE 'none'
       END AS flag
  FROM products p LEFT JOIN live_batches b ON b."productId" = p.id
 WHERE COALESCE(p."stockQuantity", 0) <> 0 OR COALESCE(b.batch_count, 0) > 0
 ORDER BY p.id;

\echo '@@inspect-section s05_zero_cost_batches_detail'
SELECT 's05_zero_cost_batches_detail'::text AS section,
       id::text AS batch_id, "productId"::text AS product_id,
       "unitCost"::text AS unit_cost, "landedCost"::text AS landed_cost,
       CASE WHEN "landedCost" IS NULL AND "remainingQuantity" > 0 THEN 'unknown' ELSE 'zero' END AS cost_state
  FROM purchase_cost_history
 WHERE "deletedAt" IS NULL
   AND ("unitCost" = 0 OR "landedCost" = 0 OR ("landedCost" IS NULL AND "remainingQuantity" > 0))
 ORDER BY id;

\echo '@@inspect-section s06_inventory_ledger'
WITH settings AS (
  SELECT count(*)::int AS settings_rows,
         CASE WHEN count(*) = 1 THEN (array_agg("inventoryAccountId"))[1]::text END AS account_id
    FROM accounting_settings
), batch_totals AS (
  SELECT COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4) AS batch_value,
         count(*) FILTER (WHERE "landedCost" IS NULL AND "remainingQuantity" > 0) AS unknown_count,
         count(*) FILTER (WHERE "remainingQuantity" IS NULL) AS unknown_quantity_count
    FROM purchase_cost_history WHERE "deletedAt" IS NULL
), account AS (
  SELECT coa.id, coa.code, coa."openingBalance",
         EXISTS (SELECT 1 FROM chart_of_account child WHERE child."parentId" = coa.id) AS has_children
    FROM chart_of_account coa CROSS JOIN settings s
   WHERE s.settings_rows = 1 AND coa.id::text = s.account_id
), ledger AS (
  SELECT COALESCE(sum(line.debit - line.credit), 0)::numeric(18,2) AS balance
    FROM journal_entry_line line
    JOIN journal_entry entry ON entry.id = line."entryId"
    CROSS JOIN settings s
   WHERE s.settings_rows = 1 AND line."accountId"::text = s.account_id
     AND line."deletedAt" IS NULL AND entry."deletedAt" IS NULL
), opening AS (
  SELECT count(DISTINCT entry.id)::text AS entries,
         COALESCE(sum(line.debit - line.credit), 0)::numeric(18,2)::text AS lines_sum
    FROM journal_entry_line line
    JOIN journal_entry entry ON entry.id = line."entryId"
    CROSS JOIN settings s
   WHERE s.settings_rows = 1 AND line."accountId"::text = s.account_id
     AND entry."postingType"::text = 'OPENING_BALANCE'
     AND line."deletedAt" IS NULL AND entry."deletedAt" IS NULL
), metrics(metric, value, note) AS (
  SELECT 'accounting_settings_rows', settings_rows::text, '' FROM settings
  UNION ALL
  SELECT 'inventory_account_id', COALESCE(account_id, 'n/a'),
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'inventory_account_code', COALESCE((SELECT code FROM account), 'n/a'),
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'ledger_balance', CASE WHEN settings_rows = 1 THEN (SELECT balance::text FROM ledger) ELSE 'n/a' END,
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'batch_value', CASE WHEN settings_rows = 1 THEN (SELECT batch_value::text FROM batch_totals) ELSE 'n/a' END,
         CASE WHEN settings_rows <> 1 THEN 'accounting_settings is not a single row'
              WHEN (SELECT unknown_count FROM batch_totals) > 0 AND (SELECT unknown_quantity_count FROM batch_totals) > 0 THEN format('incomplete: batch value excludes %s batches with unknown cost; excludes %s batches with unknown quantity', (SELECT unknown_count FROM batch_totals), (SELECT unknown_quantity_count FROM batch_totals))
              WHEN (SELECT unknown_count FROM batch_totals) > 0 THEN format('incomplete: batch value excludes %s batches with unknown cost', (SELECT unknown_count FROM batch_totals))
              WHEN (SELECT unknown_quantity_count FROM batch_totals) > 0 THEN format('incomplete: batch value excludes %s batches with unknown quantity', (SELECT unknown_quantity_count FROM batch_totals)) ELSE '' END FROM settings
  UNION ALL
  SELECT 'difference', CASE WHEN settings_rows = 1 THEN ((SELECT balance FROM ledger) - (SELECT batch_value FROM batch_totals))::numeric(18,2)::text ELSE 'n/a' END,
         CASE WHEN settings_rows <> 1 THEN 'accounting_settings is not a single row'
              WHEN (SELECT unknown_count FROM batch_totals) > 0 AND (SELECT unknown_quantity_count FROM batch_totals) > 0 THEN format('ledger − batches; incomplete: batch value excludes %s batches with unknown cost; excludes %s batches with unknown quantity', (SELECT unknown_count FROM batch_totals), (SELECT unknown_quantity_count FROM batch_totals))
              WHEN (SELECT unknown_count FROM batch_totals) > 0 THEN format('ledger − batches; incomplete: batch value excludes %s batches with unknown cost', (SELECT unknown_count FROM batch_totals))
              WHEN (SELECT unknown_quantity_count FROM batch_totals) > 0 THEN format('ledger − batches; incomplete: batch value excludes %s batches with unknown quantity', (SELECT unknown_quantity_count FROM batch_totals)) ELSE 'ledger − batches' END FROM settings
  UNION ALL
  SELECT 'difference_complete', CASE WHEN settings_rows <> 1 THEN 'n/a' WHEN (SELECT unknown_count FROM batch_totals) > 0 OR (SELECT unknown_quantity_count FROM batch_totals) > 0 THEN 'false' ELSE 'true' END,
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'opening_balance_field', CASE WHEN settings_rows <> 1 OR (SELECT "openingBalance" FROM account) IS NULL THEN 'n/a' ELSE (SELECT "openingBalance"::numeric(18,2)::text FROM account) END,
         CASE WHEN settings_rows <> 1 THEN 'accounting_settings is not a single row' WHEN (SELECT "openingBalance" FROM account) IS NULL THEN 'opening balance field is NULL' ELSE '' END FROM settings
  UNION ALL
  SELECT 'opening_balance_entries', CASE WHEN settings_rows = 1 THEN (SELECT entries FROM opening) ELSE 'n/a' END,
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'opening_balance_lines_sum', CASE WHEN settings_rows = 1 THEN (SELECT lines_sum FROM opening) ELSE 'n/a' END,
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
  UNION ALL
  SELECT 'inventory_account_has_children', CASE WHEN settings_rows <> 1 THEN 'n/a' WHEN COALESCE((SELECT has_children FROM account), false) THEN 'true' ELSE 'false' END,
         CASE WHEN settings_rows = 1 THEN '' ELSE 'accounting_settings is not a single row' END FROM settings
)
SELECT 's06_inventory_ledger'::text AS section, metric, value, note FROM metrics;


\echo '@@inspect-section s08_outside_workflows'
WITH allowed_pairs(reference_type, movement_type) AS (
  VALUES
    -- inventory/services/stock-movement.service.ts:305-309, product creation.
    ('initial_stock', 'initial_stock'),
    -- purchasing/services/purchase-order-lifecycle.service.ts:278-289.
    ('purchase_order', 'purchase_receipt'),
    -- purchasing/services/purchase-order-lifecycle.service.ts:404-416.
    ('purchase_order', 'purchase_receipt_reversal'),
    -- sales/services/inventory-integration.service.ts:487-514; caller: sales-order-fulfillment.service.ts:174.
    ('sales_order', 'sale'),
    -- sales/services/sales-order-fulfillment.service.ts:401-407.
    ('sales_order', 'sale_reversal'),
    -- inventory/services/stock-adjustment.service.ts:609-619.
    ('stock_adjustment', 'adjustment_increase'),
    ('stock_adjustment', 'adjustment_decrease'),
    -- owner-equity/services/owner-equity-stock.service.ts:86-91.
    ('owner_equity', 'owner_drawing'),
    -- owner-equity/services/owner-equity-stock.service.ts:158-163.
    ('owner_equity', 'owner_drawing_reversal')
), live_movements AS (
  SELECT movement.*,
         NOT EXISTS (
           SELECT 1 FROM allowed_pairs pair
            WHERE pair.reference_type = movement."referenceType"
              AND pair.movement_type = movement."movementType"::text
         ) AS is_unrecognized,
         movement."referenceType" = 'stock_movement_reversal' AS is_standalone_reversal,
         CASE movement."referenceType"
           WHEN 'purchase_order' THEN NOT EXISTS (SELECT 1 FROM purchase_orders ref WHERE ref.id = movement."referenceId")
           WHEN 'sales_order' THEN NOT EXISTS (SELECT 1 FROM sales_orders ref WHERE ref.id = movement."referenceId")
           WHEN 'stock_adjustment' THEN NOT EXISTS (SELECT 1 FROM stock_adjustments ref WHERE ref.id = movement."referenceId")
           WHEN 'owner_equity' THEN NOT EXISTS (SELECT 1 FROM owner_equity_documents ref WHERE ref.id = movement."referenceId")
           ELSE false
         END AS has_missing_reference,
         CASE movement."referenceType"
           WHEN 'purchase_order' THEN EXISTS (SELECT 1 FROM purchase_orders ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'sales_order' THEN EXISTS (SELECT 1 FROM sales_orders ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'stock_adjustment' THEN EXISTS (SELECT 1 FROM stock_adjustments ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'owner_equity' THEN EXISTS (SELECT 1 FROM owner_equity_documents ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           ELSE false
         END AS references_soft_deleted
    FROM stock_movements movement
   WHERE movement."deletedAt" IS NULL
), metrics(metric, value, note) AS (
  SELECT 'unrecognized_pairs', count(*) FILTER (WHERE is_unrecognized)::text,
         'review candidate, not proof that a workflow was bypassed' FROM live_movements
  UNION ALL
  SELECT 'standalone_reversals', count(*) FILTER (WHERE is_standalone_reversal)::text,
         'review candidate, not proof that a workflow was bypassed' FROM live_movements
  UNION ALL
  SELECT 'missing_references', count(*) FILTER (WHERE has_missing_reference)::text,
         'review candidate, not proof that a workflow was bypassed' FROM live_movements
  UNION ALL
  SELECT 'references_to_soft_deleted_documents', count(*) FILTER (WHERE references_soft_deleted)::text,
         'review candidate, not proof that a workflow was bypassed' FROM live_movements
  UNION ALL
  SELECT 'movements_checked', count(*)::text,
         'review candidate, not proof that a workflow was bypassed' FROM live_movements
  UNION ALL
  SELECT 'soft_deleted_movements', count(*)::text,
         'review candidate, not proof that a workflow was bypassed' FROM stock_movements WHERE "deletedAt" IS NOT NULL
)
SELECT 's08_outside_workflows'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s08_outside_workflows_detail'
WITH allowed_pairs(reference_type, movement_type) AS (
  VALUES
    -- inventory/services/stock-movement.service.ts:305-309, product creation.
    ('initial_stock', 'initial_stock'),
    -- purchasing/services/purchase-order-lifecycle.service.ts:278-289.
    ('purchase_order', 'purchase_receipt'),
    -- purchasing/services/purchase-order-lifecycle.service.ts:404-416.
    ('purchase_order', 'purchase_receipt_reversal'),
    -- sales/services/inventory-integration.service.ts:487-514; caller: sales-order-fulfillment.service.ts:174.
    ('sales_order', 'sale'),
    -- sales/services/sales-order-fulfillment.service.ts:401-407.
    ('sales_order', 'sale_reversal'),
    -- inventory/services/stock-adjustment.service.ts:609-619.
    ('stock_adjustment', 'adjustment_increase'),
    ('stock_adjustment', 'adjustment_decrease'),
    -- owner-equity/services/owner-equity-stock.service.ts:86-91.
    ('owner_equity', 'owner_drawing'),
    -- owner-equity/services/owner-equity-stock.service.ts:158-163.
    ('owner_equity', 'owner_drawing_reversal')
), candidates AS (
  -- initial_stock is a product-creation event; standalone reversals point to movements, not documents.
  SELECT movement.*,
         NOT EXISTS (SELECT 1 FROM allowed_pairs pair
           WHERE pair.reference_type = movement."referenceType"
             AND pair.movement_type = movement."movementType"::text) AS is_unrecognized,
         movement."referenceType" = 'stock_movement_reversal' AS is_standalone_reversal,
         CASE movement."referenceType"
           WHEN 'purchase_order' THEN NOT EXISTS (SELECT 1 FROM purchase_orders ref WHERE ref.id = movement."referenceId")
           WHEN 'sales_order' THEN NOT EXISTS (SELECT 1 FROM sales_orders ref WHERE ref.id = movement."referenceId")
           WHEN 'stock_adjustment' THEN NOT EXISTS (SELECT 1 FROM stock_adjustments ref WHERE ref.id = movement."referenceId")
           WHEN 'owner_equity' THEN NOT EXISTS (SELECT 1 FROM owner_equity_documents ref WHERE ref.id = movement."referenceId")
           ELSE false END AS has_missing_reference,
         CASE movement."referenceType"
           WHEN 'purchase_order' THEN EXISTS (SELECT 1 FROM purchase_orders ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'sales_order' THEN EXISTS (SELECT 1 FROM sales_orders ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'stock_adjustment' THEN EXISTS (SELECT 1 FROM stock_adjustments ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           WHEN 'owner_equity' THEN EXISTS (SELECT 1 FROM owner_equity_documents ref WHERE ref.id = movement."referenceId" AND ref."deletedAt" IS NOT NULL)
           ELSE false END AS references_soft_deleted
    FROM stock_movements movement
   WHERE movement."deletedAt" IS NULL
), detail_rows AS (
  SELECT id, "productId", "referenceType", "movementType", "referenceId", 'unrecognized_pair'::text AS group_name
    FROM candidates WHERE is_unrecognized
  UNION ALL
  SELECT id, "productId", "referenceType", "movementType", "referenceId", 'standalone_reversal'
    FROM candidates WHERE is_standalone_reversal
  UNION ALL
  SELECT id, "productId", "referenceType", "movementType", "referenceId", 'missing_reference'
    FROM candidates WHERE has_missing_reference
  UNION ALL
  SELECT id, "productId", "referenceType", "movementType", "referenceId", 'soft_deleted_reference'
    FROM candidates WHERE references_soft_deleted
)
SELECT 's08_outside_workflows_detail'::text AS section,
       id::text AS movement_id, "productId"::text AS product_id,
       "referenceType" AS reference_type, "movementType"::text AS movement_type,
       "referenceId"::text AS reference_id, group_name AS "group"
  FROM detail_rows
 ORDER BY movement_id, "group";


\echo '@@inspect-section s07_undo_counts'
WITH metrics(metric, value, note) AS (
  SELECT 'fulfilled_sales_orders', count(*) FILTER (WHERE status::text = 'FULFILLED')::text,
         'soft-deleted documents excluded' FROM sales_orders WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT 'received_purchase_orders', count(*) FILTER (WHERE status::text = 'RECEIVED')::text,
         'soft-deleted documents excluded' FROM purchase_orders WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT 'completed_stock_adjustments', count(*) FILTER (WHERE status::text = 'completed')::text,
         'soft-deleted documents excluded' FROM stock_adjustments WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT 'reverted_stock_adjustments', count(*) FILTER (WHERE status::text = 'reverted')::text,
         'soft-deleted documents excluded' FROM stock_adjustments WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT 'completed_owner_stock_drawings', count(*)::text,
         'soft-deleted documents excluded' FROM owner_equity_documents
   WHERE "deletedAt" IS NULL AND type::text = 'STOCK_DRAWING' AND "documentStatus"::text = 'COMPLETED'
  UNION ALL
  SELECT 'owner_drawing_reversal_movements', count(*)::text,
         'soft-deleted documents excluded' FROM stock_movements
   WHERE "deletedAt" IS NULL AND "movementType"::text = 'owner_drawing_reversal'
  UNION ALL
  SELECT 'owner_stock_drawing_journal_reversals', count(*)::text,
         'soft-deleted documents excluded'
    FROM journal_entry reversal
    JOIN journal_entry original ON original.id = reversal."reversalOfEntryId"
   WHERE reversal."deletedAt" IS NULL AND original."deletedAt" IS NULL
     AND original."postingType"::text = 'OWNER_STOCK_DRAWING'
)
SELECT 's07_undo_counts'::text AS section, metric, value, note FROM metrics;


ROLLBACK;
\echo '@@inspect-end'
