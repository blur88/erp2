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
