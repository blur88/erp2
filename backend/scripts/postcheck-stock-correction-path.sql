-- #1406 read-only postcheck. Any FAIL is a stop-and-investigate result.
-- It verifies the restrictive stock-history FKs, partial uniqueness guards,
-- receipt-line identity guards, provenance referential integrity, and receipt
-- reversal occurrence linkage.
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/postcheck-stock-correction-path.sql

BEGIN READ ONLY;

WITH expected_foreign_keys(name, source_table_name, source_column_name, target_table_name, target_column_name) AS (
  VALUES
    ('FK_a200937c3bef6072ce44d760fe3', 'purchase_cost_history', 'productId', 'products', 'id'),
    ('FK_5c780823d6beebab76e469e2e17', 'purchase_cost_history', 'reversedByOccurrenceId', 'stock_occurrences', 'id'),
    ('FK_a3acb59db67e977be45e382fc56', 'stock_movements', 'productId', 'products', 'id'),
    ('FK_6e87ea9ab16010d08671f12b633', 'stock_movements', 'reversesMovementId', 'stock_movements', 'id'),
    ('FK_ac607027d537535d292b28f3854', 'stock_movements', 'occurrenceId', 'stock_occurrences', 'id'),
    ('FK_060822dfc7623d639b8c187bdda', 'stock_movements', 'purchaseOrderItemId', 'purchase_order_items', 'id'),
    ('FK_54f778f185d6a7cec057169ce19', 'purchase_cost_history', 'purchaseOrderItemId', 'purchase_order_items', 'id'),
    ('FK_a803b54b23d2fb8c0fe7f5389f9', 'stock_occurrences', 'reversesOccurrenceId', 'stock_occurrences', 'id'),
    ('FK_7a90005ab332be99fb12c7d6c84', 'stock_batch_consumptions', 'movementId', 'stock_movements', 'id'),
    ('FK_51f795684690dbcdee919a915f2', 'stock_batch_consumptions', 'batchId', 'purchase_cost_history', 'id')
),
foreign_key_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_foreign_keys expected
  JOIN pg_constraint constraint_row ON constraint_row.conname = expected.name
  JOIN pg_class source_table ON source_table.oid = constraint_row.conrelid
    AND source_table.relname = expected.source_table_name
  JOIN pg_attribute source_column ON source_column.attrelid = source_table.oid
    AND source_column.attname = expected.source_column_name AND NOT source_column.attisdropped
  JOIN pg_class target_table ON target_table.oid = constraint_row.confrelid
    AND target_table.relname = expected.target_table_name
  JOIN pg_attribute target_column ON target_column.attrelid = target_table.oid
    AND target_column.attname = expected.target_column_name AND NOT target_column.attisdropped
  WHERE constraint_row.contype = 'f'
    AND constraint_row.confdeltype = 'r'
    AND constraint_row.conkey = ARRAY[source_column.attnum::smallint]
    AND constraint_row.confkey = ARRAY[target_column.attnum::smallint]
),
expected_indexes(name, table_name) AS (
  VALUES
    ('UQ_stock_occurrence_reverses', 'stock_occurrences'),
    ('UQ_stock_movement_reverses', 'stock_movements'),
    ('UQ_stock_movement_product_sequence', 'stock_movements'),
    ('UQ_stock_movement_occurrence_item', 'stock_movements'),
    ('UQ_purchase_cost_history_occurrence_item', 'purchase_cost_history')
),
index_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_indexes expected
  JOIN pg_class index_class ON index_class.relname = expected.name
  JOIN pg_index index_row ON index_row.indexrelid = index_class.oid
  JOIN pg_class table_class ON table_class.oid = index_row.indrelid
    AND table_class.relname = expected.table_name
    AND table_class.relnamespace = index_class.relnamespace
  WHERE index_row.indisunique AND index_row.indpred IS NOT NULL
),
orphan_provenance AS (
  SELECT count(*)::bigint AS violation_count
  FROM stock_batch_consumptions c
  LEFT JOIN stock_movements m ON m.id = c."movementId"
  LEFT JOIN purchase_cost_history b ON b.id = c."batchId"
  WHERE m.id IS NULL OR b.id IS NULL
),
unlinked_reversed_batches AS (
  SELECT count(*)::bigint AS violation_count
  FROM purchase_cost_history b
  LEFT JOIN stock_occurrences o ON o.id = b."reversedByOccurrenceId"
  WHERE b."reversedAt" IS NOT NULL
    AND (o.id IS NULL OR o.kind::text <> 'receipt_reversal'
      OR o."documentType" <> 'purchase_order'
      OR o."documentId" IS DISTINCT FROM b."purchaseOrderId"
      OR (b."occurrenceId" IS NOT NULL
        AND o."reversesOccurrenceId" IS DISTINCT FROM b."occurrenceId")
      OR (b."occurrenceId" IS NULL
        AND (o."isLegacy" IS NOT TRUE OR o."legacyJournalEntryId" IS NULL)))
),
totals AS (
  SELECT
    (SELECT passing_count FROM foreign_key_check) AS passing_fks,
    (SELECT passing_count FROM index_check) AS passing_indexes,
    (SELECT count(*)::int FROM expected_foreign_keys) AS expected_fks,
    (SELECT count(*)::int FROM expected_indexes) AS expected_indexes,
    (SELECT violation_count FROM orphan_provenance) AS orphan_provenance_count,
    (SELECT violation_count FROM unlinked_reversed_batches) AS unlinked_reversed_batch_count
)
SELECT CASE
         WHEN passing_fks = expected_fks
          AND passing_indexes = expected_indexes
          AND orphan_provenance_count = 0
          AND unlinked_reversed_batch_count = 0
         THEN 'stock-correction postcheck: PASS'
         ELSE 'stock-correction postcheck: FAIL'
       END AS result,
       passing_fks, expected_fks, passing_indexes, expected_indexes,
       orphan_provenance_count, unlinked_reversed_batch_count
FROM totals;

ROLLBACK;
