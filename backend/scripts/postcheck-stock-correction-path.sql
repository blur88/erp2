-- #1406 read-only postcheck. Any FAIL is a stop-and-investigate result.
-- It verifies the restrictive stock-history FKs, partial uniqueness guards,
-- receipt-line identity guards, provenance referential integrity, and receipt
-- reversal occurrence linkage, including FK_purchase_cost_history_occurrence (#1414).
--
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < backend/scripts/postcheck-stock-correction-path.sql

BEGIN READ ONLY;

WITH expected_foreign_keys(name, source_table_name, source_column_name, target_table_name, target_column_name) AS (
  VALUES
    ('FK_purchase_cost_history_occurrence', 'purchase_cost_history', 'occurrenceId', 'stock_occurrences', 'id'),
    ('FK_a200937c3bef6072ce44d760fe3', 'purchase_cost_history', 'productId', 'products', 'id'),
    ('FK_5c780823d6beebab76e469e2e17', 'purchase_cost_history', 'reversedByOccurrenceId', 'stock_occurrences', 'id'),
    ('FK_a3acb59db67e977be45e382fc56', 'stock_movements', 'productId', 'products', 'id'),
    ('FK_6e87ea9ab16010d08671f12b633', 'stock_movements', 'reversesMovementId', 'stock_movements', 'id'),
    ('FK_ac607027d537535d292b28f3854', 'stock_movements', 'occurrenceId', 'stock_occurrences', 'id'),
    ('FK_060822dfc7623d639b8c187bdda', 'stock_movements', 'purchaseOrderItemId', 'purchase_order_items', 'id'),
    ('FK_54f778f185d6a7cec057169ce19', 'purchase_cost_history', 'purchaseOrderItemId', 'purchase_order_items', 'id'),
    ('FK_a803b54b23d2fb8c0fe7f5389f9', 'stock_occurrences', 'reversesOccurrenceId', 'stock_occurrences', 'id'),
    ('FK_stock_occurrences_legacy_journal', 'stock_occurrences', 'legacyJournalEntryId', 'journal_entry', 'id'),
    ('FK_7a90005ab332be99fb12c7d6c84', 'stock_batch_consumptions', 'movementId', 'stock_movements', 'id'),
    ('FK_51f795684690dbcdee919a915f2', 'stock_batch_consumptions', 'batchId', 'purchase_cost_history', 'id'),
    ('FK_stock_movement_valuation_gap_movement', 'stock_movement_valuation_gaps', 'movementId', 'stock_movements', 'id')
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
expected_indexes(name, table_name, key_columns, normalized_predicate) AS (
  VALUES
    ('UQ_stock_occurrence_reverses', 'stock_occurrences', ARRAY['reversesOccurrenceId']::text[], 'reversesoccurrenceidisnotnull'),
    ('UQ_stock_movement_reverses', 'stock_movements', ARRAY['reversesMovementId']::text[], 'reversesmovementidisnotnull'),
    ('UQ_stock_movement_product_sequence', 'stock_movements', ARRAY['productId', 'productSequence']::text[], 'productsequenceisnotnull'),
    ('UQ_stock_movement_occurrence_item', 'stock_movements', ARRAY['occurrenceId', 'purchaseOrderItemId']::text[], 'occurrenceidisnotnullandpurchaseorderitemidisnotnull'),
    ('UQ_purchase_cost_history_occurrence_item', 'purchase_cost_history', ARRAY['occurrenceId', 'purchaseOrderItemId']::text[], 'occurrenceidisnotnullandpurchaseorderitemidisnotnull')
),
index_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_indexes expected
  JOIN pg_class index_class ON index_class.relname = expected.name
  JOIN pg_index index_row ON index_row.indexrelid = index_class.oid
  JOIN pg_class table_class ON table_class.oid = index_row.indrelid
    AND table_class.relname = expected.table_name
    AND table_class.relnamespace = index_class.relnamespace
  CROSS JOIN LATERAL (
    SELECT array_agg(attribute.attname::text ORDER BY index_keys.ordinality) AS key_columns
    FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS index_keys(attnum, ordinality)
    JOIN pg_attribute attribute ON attribute.attrelid = table_class.oid
      AND attribute.attnum = index_keys.attnum AND NOT attribute.attisdropped
    WHERE index_keys.ordinality <= index_row.indnkeyatts
  ) actual_index
  WHERE index_row.indisunique AND index_row.indpred IS NOT NULL
    AND actual_index.key_columns = expected.key_columns
    AND lower(regexp_replace(replace(pg_get_expr(index_row.indpred, index_row.indrelid), '"', ''), '[()[:space:]]', '', 'g')) = expected.normalized_predicate
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
expected_gap_checks(name, table_name) AS (
  VALUES
    ('CHK_stock_occurrence_valuation_gap_kind', 'stock_occurrences'),
    ('CHK_stock_movement_valuation_gap_quantity_positive', 'stock_movement_valuation_gaps'),
    ('CHK_stock_movement_valuation_gap_value_zero', 'stock_movement_valuation_gaps'),
    ('CHK_stock_movement_valuation_gap_status', 'stock_movement_valuation_gaps')
),
gap_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_gap_checks expected
  JOIN pg_constraint constraint_row ON constraint_row.conname = expected.name
    AND constraint_row.contype = 'c'
  JOIN pg_class table_class ON table_class.oid = constraint_row.conrelid
    AND table_class.relname = expected.table_name
),
expected_gap_triggers(name, table_name) AS (
  VALUES
    ('trg_stock_movement_valuation_gap_immutable', 'stock_movement_valuation_gaps'),
    ('trg_stock_occurrence_valuation_gap_consistency', 'stock_occurrences'),
    ('trg_stock_movement_valuation_gap_consistency', 'stock_movement_valuation_gaps')
),
gap_trigger_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_gap_triggers expected
  JOIN pg_trigger trigger_row ON trigger_row.tgname = expected.name
    AND NOT trigger_row.tgisinternal
  JOIN pg_class table_class ON table_class.oid = trigger_row.tgrelid
    AND table_class.relname = expected.table_name
),
expected_other_checks(name, table_name) AS (
  VALUES
    ('CHK_stock_occurrence_reversal_reason_length', 'stock_occurrences'),
    ('CHK_stock_batch_consumptions_quantity_positive', 'stock_batch_consumptions')
),
other_check AS (
  SELECT count(DISTINCT expected.name)::int AS passing_count
  FROM expected_other_checks expected
  JOIN pg_constraint constraint_row ON constraint_row.conname = expected.name
    AND constraint_row.contype = 'c'
  JOIN pg_class table_class ON table_class.oid = constraint_row.conrelid
    AND table_class.relname = expected.table_name
),
valuation_gap_marker_mismatches AS (
  SELECT count(*)::bigint AS violation_count
  FROM stock_occurrences o
  WHERE o."hasValuationGap" IS DISTINCT FROM EXISTS (
    SELECT 1
    FROM stock_movement_valuation_gaps g
    JOIN stock_movements m ON m.id = g."movementId"
    WHERE m."occurrenceId" = o.id
  )
),
valuation_gap_invalid_rows AS (
  SELECT count(*)::bigint AS violation_count
  FROM stock_movement_valuation_gaps g
  JOIN stock_movements m ON m.id = g."movementId"
  JOIN stock_occurrences o ON o.id = m."occurrenceId"
  WHERE g.quantity <= 0 OR g."valueScale8" <> 0 OR g.status <> 'unvalued_gap'
     OR m."movementType"::text <> 'sale' OR m.quantity >= 0
     OR o.kind::text <> 'fulfilment'
),
valuation_gap_quantity_mismatches AS (
  SELECT count(*)::bigint AS violation_count
  FROM stock_movements m
  JOIN stock_occurrences o ON o.id = m."occurrenceId"
  LEFT JOIN (
    SELECT "movementId", sum(quantity)::numeric AS quantity
    FROM stock_batch_consumptions
    GROUP BY "movementId"
  ) c ON c."movementId" = m.id
  LEFT JOIN stock_movement_valuation_gaps g ON g."movementId" = m.id
  WHERE m."movementType"::text = 'sale' AND m.quantity < 0
    AND o.kind::text = 'fulfilment' AND o."isLegacy" IS NOT TRUE
    AND (o."hasValuationGap" OR c.quantity IS NOT NULL OR g."movementId" IS NOT NULL)
    AND abs(m.quantity)::numeric IS DISTINCT FROM (COALESCE(c.quantity, 0) + COALESCE(g.quantity, 0))::numeric
),
totals AS (
  SELECT
    (SELECT passing_count FROM foreign_key_check) AS passing_fks,
    (SELECT passing_count FROM index_check) AS passing_indexes,
    (SELECT count(*)::int FROM expected_foreign_keys) AS expected_fks,
    (SELECT count(*)::int FROM expected_indexes) AS expected_indexes,
    (SELECT violation_count FROM orphan_provenance) AS orphan_provenance_count,
    (SELECT violation_count FROM unlinked_reversed_batches) AS unlinked_reversed_batch_count,
    (SELECT passing_count FROM gap_check) AS passing_gap_checks,
    (SELECT count(*)::int FROM expected_gap_checks) AS expected_gap_checks,
    (SELECT passing_count FROM gap_trigger_check) AS passing_gap_triggers,
    (SELECT count(*)::int FROM expected_gap_triggers) AS expected_gap_triggers,
    (SELECT passing_count FROM other_check) AS passing_other_checks,
    (SELECT count(*)::int FROM expected_other_checks) AS expected_other_checks,
    (SELECT violation_count FROM valuation_gap_marker_mismatches) AS gap_marker_mismatch_count,
    (SELECT violation_count FROM valuation_gap_invalid_rows) AS invalid_gap_row_count,
    (SELECT violation_count FROM valuation_gap_quantity_mismatches) AS gap_quantity_mismatch_count
)
SELECT CASE
         WHEN passing_fks = expected_fks
           AND passing_indexes = expected_indexes
           AND orphan_provenance_count = 0
           AND unlinked_reversed_batch_count = 0
           AND passing_gap_checks = expected_gap_checks
           AND passing_gap_triggers = expected_gap_triggers
           AND passing_other_checks = expected_other_checks
           AND gap_marker_mismatch_count = 0
           AND invalid_gap_row_count = 0
           AND gap_quantity_mismatch_count = 0
         THEN 'stock-correction postcheck: PASS'
         ELSE 'stock-correction postcheck: FAIL'
       END AS result,
       passing_fks, expected_fks, passing_indexes, expected_indexes,
        orphan_provenance_count, unlinked_reversed_batch_count,
        passing_gap_checks, expected_gap_checks,
        passing_gap_triggers, expected_gap_triggers,
        passing_other_checks, expected_other_checks,
        gap_marker_mismatch_count, invalid_gap_row_count,
        gap_quantity_mismatch_count
FROM totals;

WITH gap_exposure AS (
  SELECT p.id AS product_id,
         p.name AS product_name,
         count(DISTINCT o.id)::bigint AS fulfillment_occurrences,
         count(DISTINCT m.id)::bigint AS sale_movements,
         sum(g.quantity)::numeric AS uncovered_quantity
  FROM stock_movement_valuation_gaps g
  JOIN stock_movements m ON m.id = g."movementId"
  JOIN stock_occurrences o ON o.id = m."occurrenceId"
  JOIN products p ON p.id = m."productId"
  GROUP BY p.id, p.name
), gap_summary AS (
  SELECT count(DISTINCT o.id)::bigint AS fulfillment_occurrences,
         count(DISTINCT m.id)::bigint AS sale_movements,
         COALESCE(sum(g.quantity), 0)::numeric AS uncovered_quantity
  FROM stock_movement_valuation_gaps g
  JOIN stock_movements m ON m.id = g."movementId"
  JOIN stock_occurrences o ON o.id = m."occurrenceId"
)
SELECT 'valuation_gap_exposure' AS section,
       'summary'::text AS record_type,
       NULL::uuid AS product_id,
       NULL::text AS product_name,
       gap_summary.fulfillment_occurrences,
       gap_summary.sale_movements,
       gap_summary.uncovered_quantity,
       'unvalued, recorded zero posted value is not known zero cost'::text AS valuation_status
FROM gap_summary
UNION ALL
SELECT 'valuation_gap_exposure',
       'product',
       product_id,
       product_name,
       fulfillment_occurrences,
       sale_movements,
       uncovered_quantity,
       'unvalued, recorded zero posted value is not known zero cost'::text
FROM gap_exposure
ORDER BY record_type, product_name, product_id;

ROLLBACK;
