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

ROLLBACK;
\echo '@@inspect-end'
