BEGIN READ ONLY;

SELECT
  CASE
    WHEN table_name IN ('bank_reconciliations', 'reconciled_transactions') THEN 'legacy'
    WHEN table_name IN (
      'bank_statement_reconciliations',
      'bank_statement_reconciliation_lines',
      'bank_statement_reconciliation_setup_marks',
      'bank_statement_reconciliation_versions',
      'bank_statement_reconciliation_version_lines'
    ) THEN 'new'
    ELSE 'review'
  END AS category,
  table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND (
    table_name IN (
      'bank_reconciliations',
      'reconciled_transactions',
      'bank_statement_reconciliations',
      'bank_statement_reconciliation_lines',
      'bank_statement_reconciliation_setup_marks',
      'bank_statement_reconciliation_versions',
      'bank_statement_reconciliation_version_lines'
    )
    OR table_name ILIKE '%reconcil%'
  )
ORDER BY category, table_name;

ROLLBACK;
