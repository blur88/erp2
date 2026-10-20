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




\echo '@@inspect-section s09_balance_chains'
WITH base AS (
  SELECT movement.id, movement."productId" AS product_id, movement."createdAt", movement."deletedAt",
         movement.quantity, movement."previousBalance", movement."newBalance",
         product."stockQuantity" AS stock_quantity,
         count(*) OVER (PARTITION BY movement."productId", movement."createdAt") AS timestamp_count
    FROM stock_movements movement
    LEFT JOIN products product ON product.id = movement."productId"
), ordered AS (
  SELECT base.*,
         row_number() OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS sequence,
         lag("newBalance") OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_new_balance,
         lag("deletedAt") OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_deleted_at,
         lag(timestamp_count) OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_timestamp_count
    FROM base
), live_links AS (
  SELECT *, (sequence > 1 AND "deletedAt" IS NULL AND prior_deleted_at IS NULL) AS has_live_link
    FROM ordered
), last_live AS (
  SELECT *, row_number() OVER (PARTITION BY product_id ORDER BY "createdAt" DESC, id DESC) AS last_rank
    FROM ordered WHERE "deletedAt" IS NULL
), metrics(metric, value, note) AS (
  SELECT 'products_checked', count(DISTINCT product_id) FILTER (WHERE "deletedAt" IS NULL)::text, '' FROM ordered
  UNION ALL SELECT 'movements_checked', count(*) FILTER (WHERE "deletedAt" IS NULL)::text, '' FROM ordered
  UNION ALL SELECT 'arithmetic_failures', count(*) FILTER (
    WHERE "deletedAt" IS NULL AND "newBalance" IS DISTINCT FROM "previousBalance" + quantity)::text, '' FROM ordered
  UNION ALL SELECT 'link_breaks', count(*) FILTER (
    WHERE has_live_link AND timestamp_count = 1 AND prior_timestamp_count = 1
      AND "previousBalance" IS DISTINCT FROM prior_new_balance)::text, '' FROM live_links
  UNION ALL SELECT 'links_evaluated', count(*) FILTER (
    WHERE has_live_link AND timestamp_count = 1 AND prior_timestamp_count = 1)::text, '' FROM live_links
  UNION ALL SELECT 'links_order_unknown', count(*) FILTER (
    WHERE has_live_link AND (timestamp_count > 1 OR prior_timestamp_count > 1))::text, '' FROM live_links
  UNION ALL SELECT 'end_mismatches', count(*) FILTER (
    WHERE last_rank = 1 AND timestamp_count = 1 AND "newBalance" IS DISTINCT FROM stock_quantity)::text, '' FROM last_live
  UNION ALL SELECT 'end_order_unknown', count(*) FILTER (WHERE last_rank = 1 AND timestamp_count > 1)::text, '' FROM last_live
  UNION ALL SELECT 'soft_deleted_movements', count(*) FILTER (WHERE "deletedAt" IS NOT NULL)::text, '' FROM ordered
)
SELECT 's09_balance_chains'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s09_balance_chains_detail'
WITH base AS (
  SELECT movement.id, movement."productId" AS product_id, movement."createdAt", movement."deletedAt",
         movement.quantity, movement."previousBalance", movement."newBalance",
         product."stockQuantity" AS stock_quantity,
         count(*) OVER (PARTITION BY movement."productId", movement."createdAt") AS timestamp_count
    FROM stock_movements movement LEFT JOIN products product ON product.id = movement."productId"
), ordered AS (
  SELECT base.*,
         row_number() OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS sequence,
         lag("newBalance") OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_new_balance,
         lag("deletedAt") OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_deleted_at,
         lag(timestamp_count) OVER (PARTITION BY product_id ORDER BY "createdAt", id) AS prior_timestamp_count
    FROM base
), live_links AS (
  SELECT *, (sequence > 1 AND "deletedAt" IS NULL AND prior_deleted_at IS NULL) AS has_live_link FROM ordered
), last_live AS (
  SELECT *, row_number() OVER (PARTITION BY product_id ORDER BY "createdAt" DESC, id DESC) AS last_rank
    FROM ordered WHERE "deletedAt" IS NULL
), details AS (
  SELECT product_id, id AS movement_id, 'arithmetic'::text AS kind,
         ("previousBalance" + quantity)::text AS expected, "newBalance"::text AS actual
    FROM ordered WHERE "deletedAt" IS NULL AND "newBalance" IS DISTINCT FROM "previousBalance" + quantity
  UNION ALL
  SELECT product_id, id, 'link_break', prior_new_balance::text, "previousBalance"::text
    FROM live_links WHERE has_live_link AND timestamp_count = 1 AND prior_timestamp_count = 1
      AND "previousBalance" IS DISTINCT FROM prior_new_balance
  UNION ALL
  SELECT product_id, id, 'link_order_unknown', 'timestamp order shared', "previousBalance"::text
    FROM live_links WHERE has_live_link AND (timestamp_count > 1 OR prior_timestamp_count > 1)
  UNION ALL
  SELECT product_id, id, 'end_mismatch', stock_quantity::text, "newBalance"::text
    FROM last_live WHERE last_rank = 1 AND timestamp_count = 1
      AND "newBalance" IS DISTINCT FROM stock_quantity
  UNION ALL
  SELECT product_id, id, 'end_order_unknown', 'timestamp order shared', "newBalance"::text
    FROM last_live WHERE last_rank = 1 AND timestamp_count > 1
)
SELECT 's09_balance_chains_detail'::text AS section,
       product_id::text AS product_id, movement_id::text AS movement_id, kind, expected, actual
  FROM details ORDER BY product_id, movement_id, kind;



\echo '@@inspect-section s10_product_anomalies'
WITH batches AS (
  SELECT "productId", count(*) AS batch_count,
         COALESCE(sum("remainingQuantity"), 0) AS batch_quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4) AS batch_value
    FROM purchase_cost_history WHERE "deletedAt" IS NULL GROUP BY "productId"
), products_with_batches AS (
  SELECT p.id, p.name, p.type::text AS product_type, p."stockQuantity" AS stock_quantity,
         (p."deletedAt" IS NOT NULL) AS is_soft_deleted,
         COALESCE(b.batch_count, 0) AS batch_count,
         COALESCE(b.batch_quantity, 0)::numeric(18,4) AS batch_quantity,
         COALESCE(b.batch_value, 0)::numeric(24,4) AS batch_value
    FROM products p LEFT JOIN batches b ON b."productId" = p.id
), metrics(metric, value, note) AS (
  SELECT 'soft_deleted_with_stock', count(*) FILTER (
    WHERE is_soft_deleted AND COALESCE(stock_quantity, 0) <> 0)::text, '' FROM products_with_batches
  UNION ALL
  SELECT 'soft_deleted_with_batches', count(*) FILTER (
    WHERE is_soft_deleted AND EXISTS (
      SELECT 1 FROM purchase_cost_history batch
       WHERE batch."productId" = products_with_batches.id
         AND batch."deletedAt" IS NULL AND batch."remainingQuantity" > 0))::text, ''
    FROM products_with_batches
  UNION ALL
  SELECT 'service_with_stock', count(*) FILTER (
    WHERE product_type = 'Service' AND COALESCE(stock_quantity, 0) <> 0)::text,
    'non-stocked interpreted as type = Service' FROM products_with_batches
  UNION ALL
  SELECT 'service_with_batches', count(*) FILTER (
    WHERE product_type = 'Service' AND batch_count > 0)::text,
    'non-stocked interpreted as type = Service' FROM products_with_batches
  UNION ALL
  SELECT 'service_with_batch_value', count(*) FILTER (
    WHERE product_type = 'Service' AND batch_value <> 0)::text,
    'non-stocked interpreted as type = Service' FROM products_with_batches
)
SELECT 's10_product_anomalies'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section s10_product_anomalies_detail'
WITH batches AS (
  SELECT "productId", count(*) AS batch_count,
         COALESCE(sum("remainingQuantity"), 0)::numeric(18,4) AS batch_quantity,
         COALESCE(sum(CASE WHEN "landedCost" IS NOT NULL AND "remainingQuantity" IS NOT NULL
                           THEN "remainingQuantity" * "landedCost" END), 0)::numeric(24,4) AS batch_value
    FROM purchase_cost_history WHERE "deletedAt" IS NULL GROUP BY "productId"
), products_with_batches AS (
  SELECT p.id, p.name, p.type::text AS product_type, p."stockQuantity" AS stock_quantity,
         (p."deletedAt" IS NOT NULL) AS is_soft_deleted,
         COALESCE(b.batch_count, 0) AS batch_count,
         COALESCE(b.batch_quantity, 0)::numeric(18,4) AS batch_quantity,
         COALESCE(b.batch_value, 0)::numeric(24,4) AS batch_value
    FROM products p LEFT JOIN batches b ON b."productId" = p.id
), detail AS (
  SELECT id, name, stock_quantity, batch_quantity, batch_value, 'soft_deleted_with_stock'::text AS kind
    FROM products_with_batches WHERE is_soft_deleted AND COALESCE(stock_quantity, 0) <> 0
  UNION ALL
  SELECT p.id, p.name, p.stock_quantity, p.batch_quantity, p.batch_value, 'soft_deleted_with_batches'
    FROM products_with_batches p WHERE p.is_soft_deleted AND EXISTS (
      SELECT 1 FROM purchase_cost_history batch WHERE batch."productId" = p.id
       AND batch."deletedAt" IS NULL AND batch."remainingQuantity" > 0)
  UNION ALL
  SELECT id, name, stock_quantity, batch_quantity, batch_value, 'service_with_stock'
    FROM products_with_batches WHERE product_type = 'Service' AND COALESCE(stock_quantity, 0) <> 0
  UNION ALL
  SELECT id, name, stock_quantity, batch_quantity, batch_value, 'service_with_batches'
    FROM products_with_batches WHERE product_type = 'Service' AND batch_count > 0
  UNION ALL
  SELECT id, name, stock_quantity, batch_quantity, batch_value, 'service_with_batch_value'
    FROM products_with_batches WHERE product_type = 'Service' AND batch_value <> 0
)
SELECT 's10_product_anomalies_detail'::text AS section,
       id::text AS product_id, name AS product_name, kind,
       stock_quantity::text AS stock_quantity, batch_quantity::text AS batch_quantity,
       batch_value::text AS batch_value
  FROM detail ORDER BY product_id, kind;

\echo '@@inspect-section s11_users'
WITH roles(role) AS (
  VALUES ('admin'), ('manager'), ('sales_staff'), ('inventory_staff'), ('procurement_staff')
), active_users AS (
  SELECT role::text AS role FROM users
   WHERE "isActive" = true AND "deletedAt" IS NULL AND status::text = 'active'
), role_counts AS (
  SELECT roles.role, count(active_users.role)::text AS count
    FROM roles LEFT JOIN active_users ON active_users.role = roles.role
   GROUP BY roles.role
), summary AS (
  SELECT count(*) FILTER (WHERE role = 'admin') AS admins,
         count(*) FILTER (WHERE role = 'manager') AS managers,
         count(*) FILTER (WHERE role = 'inventory_staff') AS inventory_staff
    FROM active_users
), metrics(metric, value, note) AS (
  SELECT 'active.' || role, count, '' FROM role_counts
  UNION ALL
  SELECT 'inactive_users', count(*) FILTER (
    WHERE NOT ("isActive" = true AND "deletedAt" IS NULL AND status::text = 'active'))::text, '' FROM users
  UNION ALL
  SELECT 'has_active_admin', (admins > 0)::text, '' FROM summary
  UNION ALL
  SELECT 'has_distinct_preparer', (admins >= 2 OR (admins >= 1 AND managers + inventory_staff >= 1))::text,
         'distinct accounts; the data cannot show distinct people' FROM summary
)
SELECT 's11_users'::text AS section, metric, value, note FROM metrics;



\echo '@@inspect-section s12_project_records'
WITH metrics(metric, value, note) AS (
  SELECT 'p5.draft_stock_adjustments', (SELECT count(*) FROM stock_adjustments p WHERE p.status::text = 'draft' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_stock_adjustments.soft_deleted', (SELECT count(*) FROM stock_adjustments p WHERE p.status::text = 'draft' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_provider_settlements', (SELECT count(*) FROM provider_settlements p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_provider_settlements.soft_deleted', (SELECT count(*) FROM provider_settlements p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliations.first_time', (SELECT count(*) FROM bank_statement_reconciliations p WHERE p.status::text = 'DRAFT' AND p."currentVersionNo" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliations.first_time.soft_deleted', (SELECT count(*) FROM bank_statement_reconciliations p WHERE p.status::text = 'DRAFT' AND p."currentVersionNo" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliations.reopened', (SELECT count(*) FROM bank_statement_reconciliations p WHERE p.status::text = 'DRAFT' AND p."currentVersionNo" IS NOT NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliations.reopened.soft_deleted', (SELECT count(*) FROM bank_statement_reconciliations p WHERE p.status::text = 'DRAFT' AND p."currentVersionNo" IS NOT NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_provider_settlement_lines', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_provider_settlement_lines.soft_deleted_parent', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_provider_settlement_lines.soft_deleted_row', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_lines', (SELECT count(*) FROM bank_statement_reconciliation_lines c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_lines.soft_deleted_parent', (SELECT count(*) FROM bank_statement_reconciliation_lines c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_lines.soft_deleted_row', (SELECT count(*) FROM bank_statement_reconciliation_lines c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_setup_marks', (SELECT count(*) FROM bank_statement_reconciliation_setup_marks c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_setup_marks.soft_deleted_parent', (SELECT count(*) FROM bank_statement_reconciliation_setup_marks c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p5.draft_bank_reconciliation_setup_marks.soft_deleted_row', (SELECT count(*) FROM bank_statement_reconciliation_setup_marks c JOIN bank_statement_reconciliations p ON p.id = c."reconciliationId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_orders.DRAFT', (SELECT count(*) FROM sales_orders p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_orders.DRAFT.soft_deleted', (SELECT count(*) FROM sales_orders p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_orders.READY', (SELECT count(*) FROM sales_orders p WHERE p.status::text = 'READY' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_orders.READY.soft_deleted', (SELECT count(*) FROM sales_orders p WHERE p.status::text = 'READY' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_orders.DRAFT', (SELECT count(*) FROM purchase_orders p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_orders.DRAFT.soft_deleted', (SELECT count(*) FROM purchase_orders p WHERE p.status::text = 'DRAFT' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_orders.READY', (SELECT count(*) FROM purchase_orders p WHERE p.status::text = 'READY' AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_orders.READY.soft_deleted', (SELECT count(*) FROM purchase_orders p WHERE p.status::text = 'READY' AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.DRAFT', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.DRAFT.soft_deleted_parent', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.DRAFT.soft_deleted_row', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.READY', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.READY.soft_deleted_parent', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.sales_order_items.READY.soft_deleted_row', (SELECT count(*) FROM sales_order_items c JOIN sales_orders p ON p.id = c."salesOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.DRAFT', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.DRAFT.soft_deleted_parent', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.DRAFT.soft_deleted_row', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.READY', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.READY.soft_deleted_parent', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.purchase_order_items.READY.soft_deleted_row', (SELECT count(*) FROM purchase_order_items c JOIN purchase_orders p ON p.id = c."purchaseOrderId" WHERE p.status::text = 'READY' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.stock_adjustment_items.draft', (SELECT count(*) FROM stock_adjustment_items c JOIN stock_adjustments p ON p.id = c."stockAdjustmentId" WHERE p.status::text = 'draft' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.stock_adjustment_items.draft.soft_deleted_parent', (SELECT count(*) FROM stock_adjustment_items c JOIN stock_adjustments p ON p.id = c."stockAdjustmentId" WHERE p.status::text = 'draft' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.stock_adjustment_items.draft.soft_deleted_row', (SELECT count(*) FROM stock_adjustment_items c JOIN stock_adjustments p ON p.id = c."stockAdjustmentId" WHERE p.status::text = 'draft' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.provider_settlement_lines.draft', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.provider_settlement_lines.draft.soft_deleted_parent', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NULL AND p."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p6.provider_settlement_lines.draft.soft_deleted_row', (SELECT count(*) FROM provider_settlement_lines c JOIN provider_settlements p ON p.id = c."settlementId" WHERE p.status::text = 'DRAFT' AND c."deletedAt" IS NOT NULL)::text, 'source: local #1398 design spec §4–5; projects 5–6 have no GitHub issues'
  UNION ALL
  SELECT 'p7.account_mappings', (SELECT count(*) FROM payment_method_account_mappings)::text, ''
  UNION ALL
  SELECT 'p7.account_mappings.soft_deleted', (SELECT count(*) FROM payment_method_account_mappings WHERE "deletedAt" IS NOT NULL)::text, ''
  UNION ALL
  SELECT 'p7.account_mappings.inactive', (SELECT count(*) FROM payment_method_account_mappings WHERE "deletedAt" IS NULL AND "isActive" = false)::text, ''
  UNION ALL
  SELECT 'p7.balance_sheet_account_groups', (SELECT count(*) FROM balance_sheet_account_groups)::text, ''
  UNION ALL
  SELECT 'p7.mappings_to_soft_deleted_payment_methods', (SELECT count(*) FROM payment_method_account_mappings m JOIN payment_methods pm ON pm.id = m."paymentMethodId" WHERE m."deletedAt" IS NULL AND pm."deletedAt" IS NOT NULL)::text, ''
)
SELECT 's12_project_records'::text AS section, metric, value, note FROM metrics;

\echo '@@inspect-section d1_receipt_line_identity'
SELECT CASE WHEN count(*) = 3 THEN 1 ELSE 0 END AS d1_ready
  FROM information_schema.columns
 WHERE table_schema = current_schema()
   AND (table_name, column_name) IN (
     ('stock_occurrences', 'receiptEvidenceVersion'),
     ('stock_movements', 'purchaseOrderItemId'),
     ('purchase_cost_history', 'purchaseOrderItemId')
   )
\gset
\if :d1_ready
WITH receipt_occurrences AS (
  SELECT id AS occurrence_id, "documentId" AS po_id, "receiptEvidenceVersion" AS version,
         'occurrence'::text AS receipt_kind
    FROM stock_occurrences WHERE kind::text = 'receipt'
), receipts AS (
  SELECT occurrence_id::text AS receipt_key, occurrence_id, po_id, version, receipt_kind
    FROM receipt_occurrences
  UNION ALL
  SELECT po.id::text, NULL::uuid, po.id, NULL::smallint, 'legacy'
    FROM purchase_orders po
   WHERE po.status::text = 'RECEIVED'
     AND NOT EXISTS (SELECT 1 FROM receipt_occurrences o WHERE o.po_id = po.id)
), items AS (
  SELECT r.receipt_key, r.po_id, i.id AS item_id, i."productId" AS product_id
    FROM receipts r JOIN purchase_order_items i ON i."purchaseOrderId" = r.po_id
   WHERE i."deletedAt" IS NULL
), receipt_movements AS (
  SELECT r.receipt_key, r.receipt_kind, r.version, r.po_id, m.*
    FROM receipts r JOIN stock_movements m
      ON ((r.receipt_kind = 'occurrence' AND m."occurrenceId" = r.occurrence_id)
      OR (r.receipt_kind = 'legacy' AND m."referenceType" = 'purchase_order'
          AND m."referenceId" = r.po_id AND m."movementType"::text = 'purchase_receipt'))
     AND m."movementType"::text <> 'purchase_receipt_reversal'
), receipt_batches AS (
  SELECT r.receipt_key, r.receipt_kind, r.version, r.po_id, b.*
    FROM receipts r JOIN purchase_cost_history b
      ON (r.receipt_kind = 'occurrence' AND b."occurrenceId" = r.occurrence_id)
      OR (r.receipt_kind = 'legacy' AND b."purchaseOrderId" = r.po_id)
), item_movement_counts AS (
  SELECT i.receipt_key, i.item_id, count(m.id) AS movement_count
    FROM items i LEFT JOIN receipt_movements m ON m.receipt_key = i.receipt_key
      AND m."purchaseOrderItemId" = i.item_id
   GROUP BY i.receipt_key, i.item_id
), item_batch_counts AS (
  SELECT i.receipt_key, i.item_id, count(b.id) AS batch_count
    FROM items i LEFT JOIN receipt_batches b ON b.receipt_key = i.receipt_key
      AND b."purchaseOrderItemId" = i.item_id
   GROUP BY i.receipt_key, i.item_id
), product_keys AS (
  SELECT receipt_key, product_id FROM items
  UNION SELECT receipt_key, "productId" FROM receipt_movements
  UNION SELECT receipt_key, "productId" FROM receipt_batches
), product_counts AS (
  SELECT k.receipt_key, k.product_id,
         (SELECT count(*) FROM items i WHERE i.receipt_key = k.receipt_key AND i.product_id = k.product_id) AS item_count,
         (SELECT count(*) FROM receipt_movements m WHERE m.receipt_key = k.receipt_key AND m."productId" = k.product_id) AS movement_count,
         (SELECT count(*) FROM receipt_batches b WHERE b.receipt_key = k.receipt_key AND b."productId" = k.product_id) AS batch_count
    FROM product_keys k
), receipt_counts AS (
  SELECT r.receipt_key, r.receipt_kind, r.version,
         (SELECT count(*) FROM items i WHERE i.receipt_key = r.receipt_key) AS item_count,
         (SELECT count(*) FROM receipt_movements m WHERE m.receipt_key = r.receipt_key) AS movement_count,
         (SELECT count(*) FROM receipt_batches b WHERE b.receipt_key = r.receipt_key) AS batch_count,
         (SELECT count(*) FROM receipt_movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" IS NULL)
           + (SELECT count(*) FROM receipt_batches b WHERE b.receipt_key = r.receipt_key AND b."purchaseOrderItemId" IS NULL) AS null_identity_count,
         (SELECT count(*) FROM receipt_movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" IS NOT NULL)
           + (SELECT count(*) FROM receipt_batches b WHERE b.receipt_key = r.receipt_key AND b."purchaseOrderItemId" IS NOT NULL) AS identified_count
    FROM receipts r
), violations AS (
  SELECT 'receipts.version_other'::text AS metric,
         count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version IS NOT NULL AND version <> 1)::text AS value FROM receipts
  UNION ALL SELECT 'any.mixed_identity', count(*) FILTER (WHERE null_identity_count > 0 AND identified_count > 0)::text FROM receipt_counts
  UNION ALL SELECT 'v1.null_identity_rows', ((SELECT count(*) FROM receipt_movements WHERE version = 1 AND "purchaseOrderItemId" IS NULL) + (SELECT count(*) FROM receipt_batches WHERE version = 1 AND "purchaseOrderItemId" IS NULL))::text
  UNION ALL SELECT 'v1.item_not_exactly_one_movement', count(DISTINCT r.receipt_key) FILTER (WHERE r.receipt_kind = 'occurrence' AND r.version = 1 AND EXISTS (SELECT 1 FROM item_movement_counts x WHERE x.receipt_key = r.receipt_key AND x.movement_count <> 1))::text FROM receipts r
  UNION ALL SELECT 'v1.item_not_exactly_one_batch', count(DISTINCT r.receipt_key) FILTER (WHERE r.receipt_kind = 'occurrence' AND r.version = 1 AND EXISTS (SELECT 1 FROM item_batch_counts x WHERE x.receipt_key = r.receipt_key AND x.batch_count <> 1))::text FROM receipts r
  UNION ALL SELECT 'v1.unequal_counts', count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version = 1 AND (item_count <> movement_count OR item_count <> batch_count))::text FROM receipt_counts
  UNION ALL SELECT 'v1.identity_other_po', (SELECT count(*) FROM (
    SELECT m.receipt_key FROM receipt_movements m JOIN purchase_order_items i ON i.id = m."purchaseOrderItemId" WHERE m.version = 1 AND i."purchaseOrderId" <> m.po_id
    UNION SELECT b.receipt_key FROM receipt_batches b JOIN purchase_order_items i ON i.id = b."purchaseOrderItemId" WHERE b.version = 1 AND i."purchaseOrderId" <> b.po_id
  ) defects)::text
  UNION ALL SELECT 'v1.product_mismatch', (SELECT count(*) FROM (
    SELECT m.receipt_key FROM receipt_movements m JOIN purchase_order_items i ON i.id = m."purchaseOrderItemId" WHERE m.version = 1 AND i."productId" <> m."productId"
    UNION SELECT b.receipt_key FROM receipt_batches b JOIN purchase_order_items i ON i.id = b."purchaseOrderItemId" WHERE b.version = 1 AND i."productId" <> b."productId"
  ) defects)::text
  UNION ALL SELECT 'v1.movement_shape', count(DISTINCT receipt_key)::text FROM receipt_movements WHERE version = 1 AND ("movementType"::text <> 'purchase_receipt' OR "referenceType" IS DISTINCT FROM 'purchase_order' OR "referenceId" IS DISTINCT FROM po_id)
  UNION ALL SELECT 'v1.movement_values_null', count(DISTINCT receipt_key)::text FROM receipt_movements WHERE version = 1 AND ("unitValue" IS NULL OR "totalValue" IS NULL)
  UNION ALL SELECT 'reversal.unlinked', count(*)::text FROM stock_movements WHERE "movementType"::text = 'purchase_receipt_reversal' AND "reversesMovementId" IS NULL
  UNION ALL SELECT 'reversal.original_not_receipt', count(*)::text FROM stock_movements r JOIN stock_movements o ON o.id = r."reversesMovementId" WHERE r."movementType"::text = 'purchase_receipt_reversal' AND o."movementType"::text <> 'purchase_receipt'
  UNION ALL SELECT 'reversal.identity_not_preserved', count(*)::text FROM stock_movements r JOIN stock_movements o ON o.id = r."reversesMovementId" WHERE r."movementType"::text = 'purchase_receipt_reversal' AND r."purchaseOrderItemId" IS DISTINCT FROM o."purchaseOrderItemId"
  UNION ALL SELECT 'historical.identity_present', count(*)::text FROM receipt_counts c WHERE (c.receipt_kind = 'legacy' OR c.version IS NULL) AND c.identified_count > 0
  UNION ALL SELECT 'historical.row_count_mismatch.occurrence', count(DISTINCT receipt_key)::text FROM product_counts p JOIN receipts r USING (receipt_key) WHERE r.receipt_kind = 'occurrence' AND r.version IS NULL AND (p.item_count <> p.movement_count OR p.item_count <> p.batch_count)
  UNION ALL SELECT 'historical.row_count_mismatch.legacy', count(DISTINCT receipt_key)::text FROM product_counts p JOIN receipts r USING (receipt_key) WHERE r.receipt_kind = 'legacy' AND (p.item_count <> p.movement_count OR p.item_count <> p.batch_count)
)
SELECT 'd1_receipt_line_identity'::text AS section, 'status'::text AS metric, 'evaluated'::text AS value, 'zero counts mean no violations of the listed rules, not that the requirements are satisfied'::text AS note
UNION ALL SELECT 'd1_receipt_line_identity', 'receipts.version_null', count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version IS NULL)::text, '' FROM receipts
UNION ALL SELECT 'd1_receipt_line_identity', 'receipts.version_1', count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version = 1)::text, '' FROM receipts
UNION ALL SELECT 'd1_receipt_line_identity', 'receipts.version_other', count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version IS NOT NULL AND version <> 1)::text, '' FROM receipts
UNION ALL SELECT 'd1_receipt_line_identity', 'receipts.legacy_no_occurrence', count(*) FILTER (WHERE receipt_kind = 'legacy')::text, '' FROM receipts
UNION ALL SELECT 'd1_receipt_line_identity', metric, value, '' FROM violations
UNION ALL SELECT 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.occurrence', count(*) FILTER (WHERE receipt_kind = 'occurrence' AND version IS NULL AND identified_count = 0 AND item_count = movement_count AND item_count = batch_count AND NOT EXISTS (SELECT 1 FROM product_counts p WHERE p.receipt_key = receipt_counts.receipt_key AND (p.item_count <> p.movement_count OR p.item_count <> p.batch_count)))::text, 'uniqueness not evaluated; determined by the application''s matcher' FROM receipt_counts
UNION ALL SELECT 'd1_receipt_line_identity', 'historical.uniqueness_not_evaluated.legacy', count(*) FILTER (WHERE receipt_kind = 'legacy' AND identified_count = 0 AND item_count = movement_count AND item_count = batch_count AND NOT EXISTS (SELECT 1 FROM product_counts p WHERE p.receipt_key = receipt_counts.receipt_key AND (p.item_count <> p.movement_count OR p.item_count <> p.batch_count)))::text, 'uniqueness not evaluated; determined by the application''s matcher' FROM receipt_counts;
\else
SELECT 'd1_receipt_line_identity'::text AS section, 'status'::text AS metric,
       'not evaluated: migration prerequisite absent'::text AS value,
       'missing: ' || (SELECT string_agg(required.table_name || '.' || required.column_name, ', ' ORDER BY required.ordinal)
         FROM (VALUES (1, 'stock_occurrences', 'receiptEvidenceVersion'), (2, 'stock_movements', 'purchaseOrderItemId'), (3, 'purchase_cost_history', 'purchaseOrderItemId')) AS required(ordinal, table_name, column_name)
        WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = current_schema() AND c.table_name = required.table_name AND c.column_name = required.column_name)) AS note;
\endif

\echo '@@inspect-section d1_receipt_line_identity_detail'
\if :d1_ready
WITH occurrence_receipts AS (
  SELECT id AS occurrence_id, "documentId" AS po_id, "receiptEvidenceVersion" AS version,
         'occurrence'::text AS receipt_kind
    FROM stock_occurrences WHERE kind::text = 'receipt'
), receipts AS (
  SELECT occurrence_id::text AS receipt_key, occurrence_id, po_id, version, receipt_kind FROM occurrence_receipts
  UNION ALL
  SELECT po.id::text, NULL::uuid, po.id, NULL::smallint, 'legacy'
    FROM purchase_orders po WHERE po.status::text = 'RECEIVED'
      AND NOT EXISTS (SELECT 1 FROM occurrence_receipts o WHERE o.po_id = po.id)
), movements AS (
  SELECT r.receipt_key, r.receipt_kind, r.occurrence_id, r.po_id, r.version, m.*
    FROM receipts r JOIN stock_movements m
      ON ((r.receipt_kind = 'occurrence' AND m."occurrenceId" = r.occurrence_id)
       OR (r.receipt_kind = 'legacy' AND m."referenceType" = 'purchase_order' AND m."referenceId" = r.po_id AND m."movementType"::text = 'purchase_receipt'))
     AND m."movementType"::text <> 'purchase_receipt_reversal'
), batches AS (
  SELECT r.receipt_key, r.receipt_kind, r.occurrence_id, r.po_id, r.version, b.*
    FROM receipts r JOIN purchase_cost_history b
      ON (r.receipt_kind = 'occurrence' AND b."occurrenceId" = r.occurrence_id)
       OR (r.receipt_kind = 'legacy' AND b."purchaseOrderId" = r.po_id)
), item_counts AS (
  SELECT r.receipt_key, r.receipt_kind, r.occurrence_id, r.po_id, r.version,
         i.id AS item_id, i."productId" AS product_id,
         (SELECT count(*) FROM movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" = i.id) AS movement_count,
         (SELECT count(*) FROM batches b WHERE b.receipt_key = r.receipt_key AND b."purchaseOrderItemId" = i.id) AS batch_count
    FROM receipts r JOIN purchase_order_items i ON i."purchaseOrderId" = r.po_id AND i."deletedAt" IS NULL
), details AS (
  SELECT receipt_kind, po_id, occurrence_id, 'receipts.version_other'::text AS rule
    FROM receipts WHERE receipt_kind = 'occurrence' AND version IS NOT NULL AND version <> 1
  UNION ALL SELECT r.receipt_kind, r.po_id, r.occurrence_id, 'any.mixed_identity'
    FROM receipts r WHERE EXISTS (SELECT 1 FROM movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" IS NULL)
      AND (EXISTS (SELECT 1 FROM movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" IS NOT NULL)
        OR EXISTS (SELECT 1 FROM batches b WHERE b.receipt_key = r.receipt_key AND b."purchaseOrderItemId" IS NOT NULL))
  UNION ALL SELECT receipt_kind, po_id, occurrence_id, 'v1.null_identity_rows' FROM movements WHERE version = 1 AND "purchaseOrderItemId" IS NULL
  UNION ALL SELECT receipt_kind, po_id, occurrence_id, 'v1.null_identity_rows' FROM batches WHERE version = 1 AND "purchaseOrderItemId" IS NULL
  UNION ALL SELECT DISTINCT receipt_kind, po_id, occurrence_id, 'v1.item_not_exactly_one_movement' FROM item_counts WHERE receipt_kind = 'occurrence' AND version = 1 AND movement_count <> 1
  UNION ALL SELECT DISTINCT receipt_kind, po_id, occurrence_id, 'v1.item_not_exactly_one_batch' FROM item_counts WHERE receipt_kind = 'occurrence' AND version = 1 AND batch_count <> 1
  UNION ALL SELECT r.receipt_kind, r.po_id, r.occurrence_id, 'v1.unequal_counts' FROM receipts r
    WHERE r.receipt_kind = 'occurrence' AND r.version = 1 AND ((SELECT count(*) FROM item_counts i WHERE i.receipt_key = r.receipt_key) <> (SELECT count(*) FROM movements m WHERE m.receipt_key = r.receipt_key)
       OR (SELECT count(*) FROM item_counts i WHERE i.receipt_key = r.receipt_key) <> (SELECT count(*) FROM batches b WHERE b.receipt_key = r.receipt_key))
  UNION ALL SELECT DISTINCT m.receipt_kind, m.po_id, m.occurrence_id, 'v1.identity_other_po' FROM movements m JOIN purchase_order_items i ON i.id = m."purchaseOrderItemId" WHERE m.version = 1 AND i."purchaseOrderId" <> m.po_id
  UNION ALL SELECT DISTINCT b.receipt_kind, b.po_id, b.occurrence_id, 'v1.identity_other_po' FROM batches b JOIN purchase_order_items i ON i.id = b."purchaseOrderItemId" WHERE b.version = 1 AND i."purchaseOrderId" <> b.po_id
  UNION ALL SELECT DISTINCT m.receipt_kind, m.po_id, m.occurrence_id, 'v1.product_mismatch' FROM movements m JOIN purchase_order_items i ON i.id = m."purchaseOrderItemId" WHERE m.version = 1 AND i."productId" <> m."productId"
  UNION ALL SELECT DISTINCT b.receipt_kind, b.po_id, b.occurrence_id, 'v1.product_mismatch' FROM batches b JOIN purchase_order_items i ON i.id = b."purchaseOrderItemId" WHERE b.version = 1 AND i."productId" <> b."productId"
  UNION ALL SELECT DISTINCT receipt_kind, po_id, occurrence_id, 'v1.movement_shape' FROM movements WHERE version = 1 AND ("movementType"::text <> 'purchase_receipt' OR "referenceType" IS DISTINCT FROM 'purchase_order' OR "referenceId" IS DISTINCT FROM po_id)
  UNION ALL SELECT DISTINCT receipt_kind, po_id, occurrence_id, 'v1.movement_values_null' FROM movements WHERE version = 1 AND ("unitValue" IS NULL OR "totalValue" IS NULL)
  UNION ALL SELECT r.receipt_kind, r.po_id, r.occurrence_id, 'historical.identity_present' FROM receipts r
    WHERE (r.receipt_kind = 'legacy' OR r.version IS NULL) AND (EXISTS (SELECT 1 FROM movements m WHERE m.receipt_key = r.receipt_key AND m."purchaseOrderItemId" IS NOT NULL) OR EXISTS (SELECT 1 FROM batches b WHERE b.receipt_key = r.receipt_key AND b."purchaseOrderItemId" IS NOT NULL))
)
SELECT 'd1_receipt_line_identity_detail'::text AS section, receipt_kind, po_id::text AS purchase_order_id,
       occurrence_id::text AS occurrence_id, rule FROM details
UNION ALL
SELECT 'd1_receipt_line_identity_detail', 'occurrence'::text, COALESCE(r.po_id, m."referenceId")::text, m."occurrenceId"::text,
       CASE WHEN m."reversesMovementId" IS NULL THEN 'reversal.unlinked'
            WHEN original."movementType"::text <> 'purchase_receipt' THEN 'reversal.original_not_receipt'
            ELSE 'reversal.identity_not_preserved' END
  FROM stock_movements m LEFT JOIN stock_movements original ON original.id = m."reversesMovementId"
  LEFT JOIN receipts r ON r.occurrence_id = m."occurrenceId"
 WHERE m."movementType"::text = 'purchase_receipt_reversal'
   AND (m."reversesMovementId" IS NULL OR original."movementType"::text <> 'purchase_receipt' OR m."purchaseOrderItemId" IS DISTINCT FROM original."purchaseOrderItemId")
ORDER BY receipt_kind, purchase_order_id, occurrence_id, rule;
\else
SELECT 'd1_receipt_line_identity_detail'::text AS section, NULL::text AS receipt_kind,
       NULL::text AS purchase_order_id, NULL::text AS occurrence_id, NULL::text AS rule
 WHERE false;
\endif

\echo '@@inspect-section d2_valuation_gaps'
SELECT CASE WHEN to_regclass(format('%I.%I', current_schema(), 'stock_movement_valuation_gaps')) IS NOT NULL
                  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'stock_occurrences' AND column_name = 'hasValuationGap')
            THEN 1 ELSE 0 END AS d2_ready
\gset
\if :d2_ready
WITH gap_rows AS (
  SELECT g."movementId" AS movement_id, g.quantity, m."productId" AS product_id,
         m."occurrenceId" AS occurrence_id, o."hasValuationGap" AS flagged
    FROM stock_movement_valuation_gaps g
    JOIN stock_movements m ON m.id = g."movementId"
    JOIN stock_occurrences o ON o.id = m."occurrenceId"
   WHERE o.kind::text = 'fulfilment' AND m."movementType"::text = 'sale'
), metrics(metric, value, note) AS (
  SELECT 'status', 'evaluated', ''
  UNION ALL SELECT 'products_with_gaps', count(DISTINCT product_id)::text, 'unvalued; a recorded zero posted value is not a known zero cost' FROM gap_rows
  UNION ALL SELECT 'fulfilment_occurrences_with_gaps', count(DISTINCT occurrence_id)::text, 'unvalued; a recorded zero posted value is not a known zero cost' FROM gap_rows
  UNION ALL SELECT 'sale_movements_with_gaps', count(DISTINCT movement_id)::text, 'unvalued; a recorded zero posted value is not a known zero cost' FROM gap_rows
  UNION ALL SELECT 'uncovered_quantity', COALESCE(sum(quantity), 0)::numeric(15,4)::text, 'unvalued; a recorded zero posted value is not a known zero cost' FROM gap_rows
  UNION ALL SELECT 'flagged_occurrences_without_gap_rows', count(*)::text, ''
    FROM stock_occurrences o WHERE o.kind::text = 'fulfilment' AND o."hasValuationGap" = true
      AND NOT EXISTS (SELECT 1 FROM stock_movement_valuation_gaps g JOIN stock_movements m ON m.id = g."movementId" WHERE m."occurrenceId" = o.id)
  UNION ALL SELECT 'gap_rows_on_unflagged_occurrences', count(*)::text, ''
    FROM stock_movement_valuation_gaps g JOIN stock_movements m ON m.id = g."movementId"
    JOIN stock_occurrences o ON o.id = m."occurrenceId" WHERE o."hasValuationGap" = false
)
SELECT 'd2_valuation_gaps'::text AS section, metric, value, note FROM metrics;
\else
SELECT 'd2_valuation_gaps'::text AS section, 'status'::text AS metric,
       'not evaluated: migration prerequisite absent'::text AS value,
       'missing: ' || (SELECT string_agg(required.object_name, ', ' ORDER BY required.ordinal)
         FROM (VALUES (1, 'stock_movement_valuation_gaps'), (2, 'stock_occurrences.hasValuationGap')) AS required(ordinal, object_name)
        WHERE (required.ordinal = 1 AND to_regclass(format('%I.%I', current_schema(), 'stock_movement_valuation_gaps')) IS NULL)
           OR (required.ordinal = 2 AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = current_schema() AND c.table_name = 'stock_occurrences' AND c.column_name = 'hasValuationGap'))) AS note;
\endif

\echo '@@inspect-section d2_valuation_gaps_detail'
\if :d2_ready
SELECT 'd2_valuation_gaps_detail'::text AS section, p.id::text AS product_id, p.name AS product_name,
       count(DISTINCT o.id)::text AS fulfilment_occurrences,
       count(DISTINCT m.id)::text AS sale_movements,
       COALESCE(sum(g.quantity), 0)::numeric(15,4)::text AS uncovered_quantity
  FROM stock_movement_valuation_gaps g
  JOIN stock_movements m ON m.id = g."movementId"
  JOIN stock_occurrences o ON o.id = m."occurrenceId" AND o.kind::text = 'fulfilment'
  JOIN products p ON p.id = m."productId"
 WHERE m."movementType"::text = 'sale'
 GROUP BY p.id, p.name ORDER BY p.name, p.id;
\else
SELECT 'd2_valuation_gaps_detail'::text AS section, NULL::text AS product_id, NULL::text AS product_name,
       NULL::text AS fulfilment_occurrences, NULL::text AS sale_movements, NULL::text AS uncovered_quantity
 WHERE false;
\endif


ROLLBACK;
\echo '@@inspect-end'
